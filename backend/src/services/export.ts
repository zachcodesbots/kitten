import { getOne, getMany, query } from '../db/pool';
import { ExportTask, Run, RunSlide } from '../types';

export class ExportService {
  async processQueuedExports(): Promise<void> {
    try {
      const tasks = await getMany<ExportTask>(
        `SELECT * FROM export_tasks WHERE status = 'queued' ORDER BY created_at ASC LIMIT 5`
      );
      for (const task of tasks) {
        await this.processExport(task);
      }
    } catch (err) {
      console.error('Export queue processing error:', err);
    }
  }

  private async processExport(task: ExportTask): Promise<void> {
    try {
      await query(`UPDATE export_tasks SET status = 'processing' WHERE id = $1`, [task.id]);

      const run = await getOne<Run>('SELECT * FROM runs WHERE id = $1', [task.run_id]);
      if (!run) throw new Error('Run not found');

      const job = await getOne<{ id: string; add_to_drafts: boolean }>(
        'SELECT id, add_to_drafts FROM jobs WHERE id = $1',
        [run.job_id]
      );
      if (!job) throw new Error('Job not found');

      const slides = await getMany<RunSlide & { image_url: string }>(
        `SELECT rs.*, COALESCE(rs.composited_image_url, bi.public_url) as image_url
         FROM run_slides rs
         LEFT JOIN bucket_images bi ON bi.id = rs.selected_image_id
         WHERE rs.run_id = $1 ORDER BY rs.position ASC`,
        [task.run_id]
      );

      const imageUrls = slides.filter(s => s.image_url).map(s => s.image_url);
      if (imageUrls.length < 2) throw new Error('Need at least 2 images for a slideshow');

      const account = await getOne<{ profile_username: string; label: string }>(
        'SELECT profile_username, label FROM connected_accounts WHERE id = $1',
        [task.account_id]
      );
      if (!account?.profile_username) throw new Error('Account not found or missing profile username');

      const apiToken = process.env.UPLOAD_POST_API_TOKEN;
      if (!apiToken) throw new Error('UPLOAD_POST_API_TOKEN not configured');
      const profileUsername = account.profile_username;

      const hashtags = run.hashtags_json
        ? (run.hashtags_json as string[]).map(h => `#${h}`).join(' ')
        : '';
      const caption = [run.caption || '', hashtags].filter(Boolean).join('\n\n').substring(0, 2200);
      const postMode = job.add_to_drafts ? 'MEDIA_UPLOAD' : 'DIRECT_POST';

      const formData = new FormData();
      formData.append('user', profileUsername);
      formData.append('tiktok_title', '');
      formData.append('tiktok_description', 'the app is called "JournAI" btw #gymmotivation #motivation #fyp #fitness #discipline');
      formData.append('platform[]', 'tiktok');
      formData.append('post_mode', postMode);
      formData.append('auto_add_music', 'true');
      imageUrls.forEach(url => formData.append('photos[]', url));

      const response = await fetch('https://api.upload-post.com/api/upload_photos', {
        method: 'POST',
        headers: {
          'Authorization': `Apikey ${apiToken}`,
        },
        body: formData,
      });

      const result = await response.json() as any;

      if (!response.ok) {
        throw new Error(`upload-post.com error: ${JSON.stringify(result)}`);
      }

      await query(
        `UPDATE export_tasks SET status = 'completed', external_reference = $1 WHERE id = $2`,
        [result.id || result.request_id || 'completed', task.id]
      );
      await query(`UPDATE runs SET status = 'exported' WHERE id = $1`, [task.run_id]);

      console.log(`Export completed for run ${task.run_id}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown export error';
      console.error(`Export failed for task ${task.id}:`, errorMsg);
      await query(
        `UPDATE export_tasks SET status = 'failed', error_message = $1 WHERE id = $2`,
        [errorMsg, task.id]
      );
      await query(
        `UPDATE runs SET status = 'failed', error_message = $1 WHERE id = $2`,
        [errorMsg, task.run_id]
      );
    }
  }
}