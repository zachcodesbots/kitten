import { getMany, getOne, query } from '../db/pool';
import { Job, JobSlide, JobSchedule } from '../types';
import { GenerationService } from './generation';

export class SchedulerService {
  private genService = new GenerationService();

  async checkAndRunDueJobs(): Promise<void> {
    try {
      const dueSchedules = await getMany<JobSchedule & { job_is_active: boolean }>(
        `SELECT js.*, j.is_active as job_is_active
         FROM job_schedules js
         JOIN jobs j ON j.id = js.job_id
         WHERE js.schedule_type != 'manual'
           AND j.is_active = true
           AND js.next_run_at IS NOT NULL
           AND js.next_run_at <= NOW()`
      );

      for (const schedule of dueSchedules) {
        if (!schedule.job_is_active) continue;

        console.log(`Running scheduled job for schedule ${schedule.id} (job ${schedule.job_id})`);

        try {
          const job = await getOne<Job>('SELECT * FROM jobs WHERE id = $1', [schedule.job_id]);
          if (!job) continue;

          const slides = await getMany<JobSlide>(
            `SELECT js.*, b.name as bucket_name FROM job_slides js
             LEFT JOIN buckets b ON b.id = js.bucket_id
             WHERE js.job_id = $1 ORDER BY js.position ASC`,
            [job.id]
          );

          await this.genService.generateRun({ ...job, slides }, 'scheduled');

          // Update last_run_at and compute next_run_at
          const nextRun = this.computeNextRun(schedule);
          await query(
            `UPDATE job_schedules SET last_run_at = NOW(), next_run_at = $1 WHERE id = $2`,
            [nextRun, schedule.id]
          );

          console.log(`Scheduled run completed for job ${schedule.job_id}. Next run: ${nextRun}`);
        } catch (err) {
          console.error(`Failed to run scheduled job ${schedule.job_id}:`, err);
        }
      }
    } catch (err) {
      console.error('Scheduler check error:', err);
    }
  }

  private computeNextRun(schedule: JobSchedule): string | null {
    const now = new Date();

    if (schedule.schedule_type === 'daily' && schedule.run_times_json) {
      const times = typeof schedule.run_times_json === 'string'
        ? JSON.parse(schedule.run_times_json)
        : schedule.run_times_json;

      if (Array.isArray(times) && times.length > 0) {
        // Find next time today or tomorrow
        for (const time of times.sort()) {
          const [hours, minutes] = time.split(':').map(Number);
          const candidate = new Date(now);
          candidate.setHours(hours, minutes, 0, 0);
          if (candidate > now) return candidate.toISOString();
        }
        // All times passed today, schedule for tomorrow's first time
        const [hours, minutes] = times[0].split(':').map(Number);
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(hours, minutes, 0, 0);
        return tomorrow.toISOString();
      }
    }

    if (schedule.schedule_type === 'weekly' && schedule.active_days && schedule.run_times_json) {
      const days = typeof schedule.active_days === 'string'
        ? JSON.parse(schedule.active_days)
        : schedule.active_days;
      const times = typeof schedule.run_times_json === 'string'
        ? JSON.parse(schedule.run_times_json)
        : schedule.run_times_json;

      if (Array.isArray(days) && Array.isArray(times) && days.length > 0 && times.length > 0) {
        // Find next valid day/time combo within next 7 days
        for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
          const candidate = new Date(now);
          candidate.setDate(candidate.getDate() + dayOffset);
          const dayOfWeek = candidate.getDay();

          if (days.includes(dayOfWeek)) {
            for (const time of times.sort()) {
              const [hours, minutes] = time.split(':').map(Number);
              candidate.setHours(hours, minutes, 0, 0);
              if (candidate > now) return candidate.toISOString();
            }
          }
        }
      }
    }

    // Default: next day same time
    const nextDay = new Date(now);
    nextDay.setDate(nextDay.getDate() + 1);
    return nextDay.toISOString();
  }
}
