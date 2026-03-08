import OpenAI from 'openai';
import { query, getOne, getMany } from '../db/pool';
import { Job, JobSlide, Run, RunSlide, BucketImage } from '../types';
import { compositeAndUpload } from './compositor';

export class GenerationService {
  private async getOpenAIClient(): Promise<OpenAI> {
    // Try DB-stored key first, fall back to env
    const setting = await getOne<{ value: string }>(`SELECT value FROM app_settings WHERE key = 'openai_api_key'`);
    const apiKey = setting?.value || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OpenAI API key not configured');
    return new OpenAI({ apiKey });
  }

  private async getModel(): Promise<string> {
    const setting = await getOne<{ value: string }>(`SELECT value FROM app_settings WHERE key = 'default_model'`);
    return setting?.value || 'gpt-4o-mini';
  }

  async generateRun(job: Job & { slides?: JobSlide[] }, triggerType: 'manual' | 'scheduled'): Promise<Run> {
    if (!job.slides || job.slides.length === 0) {
      throw new Error('Job has no slides configured');
    }

    // Create run record
    const model = await this.getModel();
    const run = await getOne<Run>(
      `INSERT INTO runs (job_id, trigger_type, status, model_snapshot)
       VALUES ($1, $2, 'generating', $3) RETURNING *`,
      [job.id, triggerType, model]
    );
    if (!run) throw new Error('Failed to create run');

    try {
      // Fetch all available images per bucket for AI to choose from
      const bucketImages: { slide: JobSlide; images: BucketImage[] }[] = [];
      for (const slide of job.slides) {
        const images = await getMany<BucketImage>(
          `SELECT * FROM bucket_images WHERE bucket_id = $1 AND status = 'active'`,
          [slide.bucket_id]
        );
        if (!images.length) throw new Error(`No active images in bucket for slide ${slide.position}`);
        bucketImages.push({ slide, images });
      }

      // Build prompt and generate text + image choices
      const promptPayload = this.buildPrompt(job, bucketImages);
      const openai = await this.getOpenAIClient();

      const completion = await openai.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: promptPayload.system },
          { role: 'user', content: promptPayload.user },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.8,
        max_tokens: 2000,
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) throw new Error('Empty OpenAI response');

      const generated = JSON.parse(content);

      // Save prompt snapshot
      await query(
        `UPDATE runs SET prompt_snapshot = $1, post_title = $2, caption = $3, hashtags_json = $4 WHERE id = $5`,
        [
          JSON.stringify(promptPayload),
          generated.post_title || null,
          generated.caption || null,
          generated.hashtags ? JSON.stringify(generated.hashtags) : null,
          run.id,
        ]
      );

      // Create run slides
      // Create run slides using AI-chosen images
      for (let i = 0; i < bucketImages.length; i++) {
        const { slide, images } = bucketImages[i];
        const slideKey = `slide_${i + 1}_text`;
        const chosenFilename = generated[`slide_${i + 1}_image`];
        const generatedText = generated[slideKey] || '';

        // Find the chosen image by filename, fall back to first if not found
        const image = images.find(img => img.filename === chosenFilename) || images[0];

        let compositedUrl: string | null = null;
        if (image.public_url && generatedText) {
          try {
            const isCTA = (slide.bucket_name || '').toLowerCase().includes('cta');
            compositedUrl = await compositeAndUpload(image.public_url, generatedText, isCTA);
          } catch (e) {
            console.error(`Compositing failed for slide ${i + 1}:`, e);
          }
        }

        await query(
          `INSERT INTO run_slides (run_id, position, bucket_id, selected_image_id, generated_text, composited_image_url)
          VALUES ($1, $2, $3, $4, $5, $6)`,
          [run.id, slide.position, slide.bucket_id, image.id, generatedText, compositedUrl]
        );
      }

      // Update status
      const finalStatus = (job.auto_approved && triggerType === 'scheduled')
        ? 'approved'
        : 'awaiting_approval';

      await query(`UPDATE runs SET status = $1 WHERE id = $2`, [finalStatus, run.id]);

      // If auto-approved, queue export
      if (finalStatus === 'approved') {
        const account = await getOne(
          `SELECT id FROM connected_accounts WHERE provider = 'tiktok' AND is_active = true LIMIT 1`
        );
        if (account) {
          await query(
            `INSERT INTO export_tasks (run_id, account_id, status) VALUES ($1, $2, 'queued')`,
            [run.id, account.id]
          );
          await query(`UPDATE runs SET status = 'exporting' WHERE id = $1`, [run.id]);
        }
      }

      // Return full run
      const fullRun = await getOne<Run>(
        `SELECT r.*, j.name as job_name FROM runs r LEFT JOIN jobs j ON j.id = r.job_id WHERE r.id = $1`,
        [run.id]
      );
      const slides = await getMany<RunSlide>(
        `SELECT rs.*, bi.public_url as image_url, bi.filename as image_filename
         FROM run_slides rs LEFT JOIN bucket_images bi ON bi.id = rs.selected_image_id
         WHERE rs.run_id = $1 ORDER BY rs.position ASC`,
        [run.id]
      );

      return { ...fullRun!, slides } as any;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      await query(
        `UPDATE runs SET status = 'failed', error_message = $1 WHERE id = $2`,
        [errorMsg, run.id]
      );
      throw err;
    }
  }

  async regenerateText(run: Run): Promise<any> {
    const openai = await this.getOpenAIClient();
    const model = await this.getModel();

    // Get existing slides with their images
    const slides = await getMany<RunSlide>(
      `SELECT rs.*, bi.public_url as image_url, bi.filename as image_filename, b.name as bucket_name
      FROM run_slides rs 
      LEFT JOIN bucket_images bi ON bi.id = rs.selected_image_id
      LEFT JOIN buckets b ON b.id = rs.bucket_id
      WHERE rs.run_id = $1 ORDER BY rs.position ASC`,
      [run.id]
    );

    // Get job for prompt
    const job = await getOne<Job>('SELECT * FROM jobs WHERE id = $1', [run.job_id]);
    if (!job) throw new Error('Job not found');

    const jobSlides = await getMany<JobSlide>(
      'SELECT * FROM job_slides WHERE job_id = $1 ORDER BY position ASC',
      [job.id]
    );

    // For regenerate, wrap each existing image as a single-option bucket so AI "chooses" the same image
    const bucketImages = slides.map((s, i) => ({
      slide: jobSlides[i] || { position: i + 1, bucket_id: s.bucket_id, prompt_override: null } as JobSlide,
      images: [{ filename: s.image_filename || 'image', id: s.selected_image_id } as BucketImage],
    }));

    const promptPayload = this.buildPrompt(job, bucketImages);

    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: promptPayload.system },
        { role: 'user', content: promptPayload.user },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8,
      max_tokens: 2000,
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error('Empty OpenAI response');

    const generated = JSON.parse(content);

    // Update slide texts
    for (let i = 0; i < slides.length; i++) {
      const slideKey = `slide_${i + 1}_text`;
      const text = generated[slideKey] || '';

      let compositedUrl: string | null = null;
      if (slides[i].image_url && text) {
        try {
          const isCTA = (slides[i].bucket_name || '').toLowerCase().includes('cta');
          compositedUrl = await compositeAndUpload(slides[i].image_url!, text, isCTA);
        } catch (e) {
          console.error(`Compositing failed for slide ${i + 1}:`, e);
        }
      }

      await query(
        'UPDATE run_slides SET generated_text = $1, composited_image_url = $2 WHERE id = $3',
        [text, compositedUrl, slides[i].id]
      );
    }

    // Update run metadata
    await query(
      `UPDATE runs SET prompt_snapshot = $1, post_title = $2, caption = $3, hashtags_json = $4, status = 'awaiting_approval' WHERE id = $5`,
      [
        JSON.stringify(promptPayload),
        generated.post_title || run.post_title,
        generated.caption || run.caption,
        generated.hashtags ? JSON.stringify(generated.hashtags) : run.hashtags_json,
        run.id,
      ]
    );

    // Return updated
    const updated = await getOne<Run>(
      'SELECT r.*, j.name as job_name FROM runs r LEFT JOIN jobs j ON j.id = r.job_id WHERE r.id = $1',
      [run.id]
    );
    const updatedSlides = await getMany<RunSlide>(
      `SELECT rs.*, bi.public_url as image_url, bi.filename as image_filename
       FROM run_slides rs LEFT JOIN bucket_images bi ON bi.id = rs.selected_image_id
       WHERE rs.run_id = $1 ORDER BY rs.position ASC`,
      [run.id]
    );

    return { ...updated, slides: updatedSlides };
  }

  private async selectImageFromBucket(bucketId: string, excludeIds: string[]): Promise<BucketImage | null> {
    if (excludeIds.length > 0) {
      return getOne<BucketImage>(
        `SELECT * FROM bucket_images
        WHERE bucket_id = $1 AND status = 'active' AND id != ALL($2)
        ORDER BY RANDOM() LIMIT 1`,
        [bucketId, excludeIds]
      );
    }
    return getOne<BucketImage>(
      `SELECT * FROM bucket_images
      WHERE bucket_id = $1 AND status = 'active'
      ORDER BY RANDOM() LIMIT 1`,
      [bucketId]
    );
  }

  private buildPrompt(
    job: Job,
    bucketImages: { slide: JobSlide; images: BucketImage[] }[]
  ): { system: string; user: string } {
    const slideInstructions = bucketImages.map(({ slide, images }, i) => {
      const fileList = images.map(img => `"${img.filename}"`).join(', ');
      let instruction = `Slide ${i + 1}: Choose the best image from [${fileList}]`;
      if (slide.prompt_override) {
        instruction += ` — Special instruction: ${slide.prompt_override}`;
      }
      return instruction;
    }).join('\n');

    const system = `You are a creative content writer for TikTok slideshow posts. For each slide, you will be given a list of available image filenames. Choose the most fitting image and write engaging, concise text to accompany it. Keep text short and impactful — TikTok audiences scroll fast.

Always respond with valid JSON in this exact format:
{
  "post_title": "A catchy title for the post",
  "slide_1_image": "chosen_filename.jpg",
  "slide_1_text": "Text for slide 1",
  "slide_2_image": "chosen_filename.jpg",
  "slide_2_text": "Text for slide 2",
  ... (one image+text pair per slide)
  "caption": "A TikTok caption for the post",
  "hashtags": ["relevant", "hashtags", "here"]
}

Important: The slide_X_image value must be an exact filename from the provided options for that slide.`;

    const user = `${job.general_prompt || 'Create engaging slideshow content for these slides.'}

Slide sequence:
${slideInstructions}

Number of slides: ${bucketImages.length}
For each slide, pick the best image filename from the options and write matching text. Then generate a caption and hashtags.`;

    return { system, user };
  }
}