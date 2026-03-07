import { Router, Request, Response } from 'express';
import { query, getOne, getMany } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { Run, RunSlide, ExportTask } from '../types';
import { GenerationService } from '../services/generation';

const router = Router();
router.use(requireAuth);

// List runs with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const { status, job_id, trigger_type, date_from, date_to } = req.query;
    let sql = `
      SELECT r.*, j.name as job_name
      FROM runs r
      LEFT JOIN jobs j ON j.id = r.job_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let idx = 1;

    if (status) { sql += ` AND r.status = $${idx++}`; params.push(status); }
    if (job_id) { sql += ` AND r.job_id = $${idx++}`; params.push(job_id); }
    if (trigger_type) { sql += ` AND r.trigger_type = $${idx++}`; params.push(trigger_type); }
    if (date_from) { sql += ` AND r.created_at >= $${idx++}`; params.push(date_from); }
    if (date_to) { sql += ` AND r.created_at <= $${idx++}`; params.push(date_to); }

    sql += ' ORDER BY r.created_at DESC LIMIT 100';

    const runs = await getMany<Run>(sql, params);
    res.json(runs);
  } catch (err) {
    console.error('List runs error:', err);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// Get run detail
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const run = await getOne<Run>(
      `SELECT r.*, j.name as job_name
       FROM runs r LEFT JOIN jobs j ON j.id = r.job_id
       WHERE r.id = $1`,
      [req.params.id]
    );
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const slides = await getMany<RunSlide>(
      `SELECT rs.*, bi.public_url as image_url, bi.filename as image_filename
       FROM run_slides rs
       LEFT JOIN bucket_images bi ON bi.id = rs.selected_image_id
       WHERE rs.run_id = $1
       ORDER BY rs.position ASC`,
      [req.params.id]
    );

    const exportTask = await getOne<ExportTask>(
      'SELECT * FROM export_tasks WHERE run_id = $1 ORDER BY created_at DESC LIMIT 1',
      [req.params.id]
    );

    res.json({ ...run, slides, export_task: exportTask });
  } catch (err) {
    console.error('Get run error:', err);
    res.status(500).json({ error: 'Failed to get run' });
  }
});

// Approve run
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const { enable_auto_approved_for_job } = req.body;

    const run = await getOne<Run>('SELECT * FROM runs WHERE id = $1', [req.params.id]);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'awaiting_approval') {
      return res.status(400).json({ error: 'Run is not awaiting approval' });
    }

    await query(`UPDATE runs SET status = 'approved' WHERE id = $1`, [req.params.id]);

    // Queue export task
    const account = await getOne(
      `SELECT id FROM connected_accounts WHERE provider = 'tiktok' AND is_active = true LIMIT 1`
    );

    if (account) {
      await query(
        `INSERT INTO export_tasks (run_id, account_id, status) VALUES ($1, $2, 'queued')`,
        [req.params.id, account.id]
      );
      await query(`UPDATE runs SET status = 'exporting' WHERE id = $1`, [req.params.id]);
    }

    // Optionally enable auto-approve for the job
    if (enable_auto_approved_for_job) {
      await query('UPDATE jobs SET auto_approved = true WHERE id = $1', [run.job_id]);
    }

    res.json({ success: true, export_queued: !!account });
  } catch (err) {
    console.error('Approve error:', err);
    res.status(500).json({ error: 'Failed to approve run' });
  }
});

// Reject run
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const run = await getOne<Run>('SELECT * FROM runs WHERE id = $1', [req.params.id]);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'awaiting_approval') {
      return res.status(400).json({ error: 'Run is not awaiting approval' });
    }

    await query(`UPDATE runs SET status = 'rejected' WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Reject error:', err);
    res.status(500).json({ error: 'Failed to reject run' });
  }
});

// Regenerate text (keep images)
router.post('/:id/regenerate-text', async (req: Request, res: Response) => {
  try {
    const run = await getOne<Run>(
      `SELECT r.*, j.name as job_name, j.general_prompt
       FROM runs r LEFT JOIN jobs j ON j.id = r.job_id WHERE r.id = $1`,
      [req.params.id]
    );
    if (!run) return res.status(404).json({ error: 'Run not found' });

    const genService = new GenerationService();
    const updated = await genService.regenerateText(run);

    res.json(updated);
  } catch (err) {
    console.error('Regenerate error:', err);
    res.status(500).json({ error: 'Failed to regenerate text' });
  }
});

// Retry export
router.post('/:id/retry-export', async (req: Request, res: Response) => {
  try {
    const run = await getOne<Run>('SELECT * FROM runs WHERE id = $1', [req.params.id]);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    if (run.status !== 'failed') {
      return res.status(400).json({ error: 'Can only retry failed runs' });
    }

    const account = await getOne(
      `SELECT id FROM connected_accounts WHERE provider = 'tiktok' AND is_active = true LIMIT 1`
    );
    if (!account) return res.status(400).json({ error: 'No active TikTok account' });

    await query(`UPDATE runs SET status = 'exporting', error_message = NULL WHERE id = $1`, [req.params.id]);
    await query(
      `INSERT INTO export_tasks (run_id, account_id, status) VALUES ($1, $2, 'queued')`,
      [req.params.id, account.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Retry export error:', err);
    res.status(500).json({ error: 'Failed to retry export' });
  }
});

export default router;
