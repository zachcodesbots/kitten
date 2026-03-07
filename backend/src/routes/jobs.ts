import { Router, Request, Response } from 'express';
import { query, getOne, getMany } from '../db/pool';
import { requireAuth } from '../middleware/auth';
import { Job, JobSlide, JobSchedule } from '../types';
import { GenerationService } from '../services/generation';

const router = Router();
router.use(requireAuth);

// List all jobs
router.get('/', async (_req: Request, res: Response) => {
  try {
    const jobs = await getMany<Job>(
      `SELECT j.*, 
        (SELECT COUNT(*) FROM runs r WHERE r.job_id = j.id) as run_count,
        (SELECT js.schedule_type FROM job_schedules js WHERE js.job_id = j.id LIMIT 1) as schedule_type
       FROM jobs j ORDER BY j.created_at DESC`
    );
    res.json(jobs);
  } catch (err) {
    console.error('List jobs error:', err);
    res.status(500).json({ error: 'Failed to list jobs' });
  }
});

// Create job
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      name, general_prompt, slide_count, is_active, require_approval,
      auto_approved, timezone, slides, schedule,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Job name required' });

    const job = await getOne<Job>(
      `INSERT INTO jobs (name, general_prompt, slide_count, is_active, require_approval, auto_approved, timezone)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        name,
        general_prompt || null,
        slide_count || 6,
        is_active !== false,
        require_approval !== false,
        auto_approved || false,
        timezone || 'UTC',
      ]
    );

    if (!job) throw new Error('Failed to create job');

    // Create slides
    if (Array.isArray(slides)) {
      for (const slide of slides) {
        await query(
          `INSERT INTO job_slides (job_id, position, bucket_id, prompt_override) VALUES ($1, $2, $3, $4)`,
          [job.id, slide.position, slide.bucket_id, slide.prompt_override || null]
        );
      }
    }

    // Create schedule
    if (schedule) {
      await query(
        `INSERT INTO job_schedules (job_id, schedule_type, cron_expression, run_times_json, active_days, next_run_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          job.id,
          schedule.schedule_type || 'manual',
          schedule.cron_expression || null,
          schedule.run_times_json ? JSON.stringify(schedule.run_times_json) : null,
          schedule.active_days ? JSON.stringify(schedule.active_days) : null,
          schedule.next_run_at || null,
        ]
      );
    }

    const fullJob = await getJobWithDetails(job.id);
    res.status(201).json(fullJob);
  } catch (err) {
    console.error('Create job error:', err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// Get job detail
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const job = await getJobWithDetails(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  } catch (err) {
    console.error('Get job error:', err);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

// Update job
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const {
      name, general_prompt, slide_count, is_active, require_approval,
      auto_approved, timezone, slides, schedule,
    } = req.body;

    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (general_prompt !== undefined) { fields.push(`general_prompt = $${idx++}`); values.push(general_prompt); }
    if (slide_count !== undefined) { fields.push(`slide_count = $${idx++}`); values.push(slide_count); }
    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }
    if (require_approval !== undefined) { fields.push(`require_approval = $${idx++}`); values.push(require_approval); }
    if (auto_approved !== undefined) { fields.push(`auto_approved = $${idx++}`); values.push(auto_approved); }
    if (timezone !== undefined) { fields.push(`timezone = $${idx++}`); values.push(timezone); }

    if (fields.length > 0) {
      values.push(req.params.id);
      await query(`UPDATE jobs SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    }

    // Replace slides if provided
    if (Array.isArray(slides)) {
      await query('DELETE FROM job_slides WHERE job_id = $1', [req.params.id]);
      for (const slide of slides) {
        await query(
          `INSERT INTO job_slides (job_id, position, bucket_id, prompt_override) VALUES ($1, $2, $3, $4)`,
          [req.params.id, slide.position, slide.bucket_id, slide.prompt_override || null]
        );
      }
    }

    // Replace schedule if provided
    if (schedule) {
      await query('DELETE FROM job_schedules WHERE job_id = $1', [req.params.id]);
      await query(
        `INSERT INTO job_schedules (job_id, schedule_type, cron_expression, run_times_json, active_days, next_run_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          req.params.id,
          schedule.schedule_type || 'manual',
          schedule.cron_expression || null,
          schedule.run_times_json ? JSON.stringify(schedule.run_times_json) : null,
          schedule.active_days ? JSON.stringify(schedule.active_days) : null,
          schedule.next_run_at || null,
        ]
      );
    }

    const fullJob = await getJobWithDetails(req.params.id);
    res.json(fullJob);
  } catch (err) {
    console.error('Update job error:', err);
    res.status(500).json({ error: 'Failed to update job' });
  }
});

// Delete job
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    await query('UPDATE jobs SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete job error:', err);
    res.status(500).json({ error: 'Failed to delete job' });
  }
});

// Duplicate job
router.post('/:id/duplicate', async (req: Request, res: Response) => {
  try {
    const source = await getJobWithDetails(req.params.id);
    if (!source) return res.status(404).json({ error: 'Job not found' });

    const job = await getOne<Job>(
      `INSERT INTO jobs (name, general_prompt, slide_count, is_active, require_approval, auto_approved, timezone)
       VALUES ($1, $2, $3, false, $4, $5, $6) RETURNING *`,
      [
        `${source.name} (copy)`,
        source.general_prompt,
        source.slide_count,
        source.require_approval,
        source.auto_approved,
        source.timezone,
      ]
    );

    if (!job) throw new Error('Failed to duplicate');

    if (source.slides) {
      for (const slide of source.slides) {
        await query(
          `INSERT INTO job_slides (job_id, position, bucket_id, prompt_override) VALUES ($1, $2, $3, $4)`,
          [job.id, slide.position, slide.bucket_id, slide.prompt_override]
        );
      }
    }

    const fullJob = await getJobWithDetails(job.id);
    res.status(201).json(fullJob);
  } catch (err) {
    console.error('Duplicate job error:', err);
    res.status(500).json({ error: 'Failed to duplicate job' });
  }
});

// Pause job
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    await query('UPDATE jobs SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to pause job' });
  }
});

// Resume job
router.post('/:id/resume', async (req: Request, res: Response) => {
  try {
    await query('UPDATE jobs SET is_active = true WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resume job' });
  }
});

// Generate preview (manual run)
router.post('/:id/generate', async (req: Request, res: Response) => {
  try {
    const job = await getJobWithDetails(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const genService = new GenerationService();
    const run = await genService.generateRun({ ...job, schedule: job.schedule ?? undefined } as any, 'manual');


    res.status(201).json(run);
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

// Helper: get job with slides and schedule
async function getJobWithDetails(jobId: string) {
  const job = await getOne<Job>('SELECT * FROM jobs WHERE id = $1', [jobId]);
  if (!job) return null;

  const slides = await getMany<JobSlide>(
    `SELECT js.*, b.name as bucket_name
     FROM job_slides js
     LEFT JOIN buckets b ON b.id = js.bucket_id
     WHERE js.job_id = $1
     ORDER BY js.position ASC`,
    [jobId]
  );

  const schedule = await getOne<JobSchedule>(
    'SELECT * FROM job_schedules WHERE job_id = $1',
    [jobId]
  );

  return { ...job, slides, schedule };
}

export default router;
