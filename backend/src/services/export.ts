import { getOne, getMany, query } from '../db/pool';
import { ExportTask, Run, RunSlide, ConnectedAccount } from '../types';

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

      // Get run and slides
      const run = await getOne<Run>('SELECT * FROM runs WHERE id = $1', [task.run_id]);
      if (!run) throw new Error('Run not found');

      const slides = await getMany<RunSlide & { image_url: string }>(
        `SELECT rs.*, bi.public_url as image_url
         FROM run_slides rs
         LEFT JOIN bucket_images bi ON bi.id = rs.selected_image_id
         WHERE rs.run_id = $1 ORDER BY rs.position ASC`,
        [task.run_id]
      );

      // Get account tokens
      const account = await getOne<ConnectedAccount & { access_token_encrypted: string }>(
        'SELECT * FROM connected_accounts WHERE id = $1',
        [task.account_id]
      );
      if (!account || !account.access_token_encrypted) {
        throw new Error('TikTok account not connected or tokens missing');
      }

      const accessToken = account.access_token_encrypted; // In production, decrypt this

      // TikTok Content Posting API - Photo mode (slideshow)
      // Step 1: Initialize photo post
      const imageUrls = slides
        .filter(s => s.image_url)
        .map(s => s.image_url);

      const slideTexts = slides.map(s => s.generated_text || '').filter(Boolean);
      const caption = [
        run.post_title || '',
        run.caption || '',
        slideTexts.join(' | '),
        run.hashtags_json ? (JSON.parse(JSON.stringify(run.hashtags_json)) as string[]).map(h => `#${h}`).join(' ') : '',
      ].filter(Boolean).join('\n\n');

      // TikTok Photo Post API
      const postData = {
        post_info: {
          title: run.post_title || 'Slideshow',
          description: caption.substring(0, 2200), // TikTok caption limit
          disable_comment: false,
          privacy_level: 'SELF_ONLY', // Draft mode - only visible to self
          auto_add_music: true,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          photo_cover_index: 0,
          photo_images: imageUrls,
        },
        post_mode: 'DIRECT_POST',
        media_type: 'PHOTO',
      };

      const response = await fetch('https://open.tiktokapis.com/v2/post/publish/', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: JSON.stringify(postData),
      });

      const result = await response.json() as any;

      if (result.error?.code !== 'ok' && response.status !== 200) {
        throw new Error(`TikTok API error: ${JSON.stringify(result)}`);
      }

      // Mark success
      await query(
        `UPDATE export_tasks SET status = 'completed', external_reference = $1 WHERE id = $2`,
        [result.data?.publish_id || JSON.stringify(result), task.id]
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
