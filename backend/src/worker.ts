import dotenv from 'dotenv';
import { SchedulerService } from './services/scheduler';
import { ExportService } from './services/export';

dotenv.config();

const scheduler = new SchedulerService();
const exporter = new ExportService();

const SCHEDULER_INTERVAL = 60_000; // Check every 60 seconds
const EXPORT_INTERVAL = 15_000;    // Check every 15 seconds

async function runScheduler() {
  while (true) {
    try {
      await scheduler.checkAndRunDueJobs();
    } catch (err) {
      console.error('Scheduler tick error:', err);
    }
    await sleep(SCHEDULER_INTERVAL);
  }
}

async function runExporter() {
  while (true) {
    try {
      await exporter.processQueuedExports();
    } catch (err) {
      console.error('Exporter tick error:', err);
    }
    await sleep(EXPORT_INTERVAL);
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('Kitten worker started');
console.log(`Scheduler interval: ${SCHEDULER_INTERVAL / 1000}s`);
console.log(`Export interval: ${EXPORT_INTERVAL / 1000}s`);

Promise.all([runScheduler(), runExporter()]).catch(err => {
  console.error('Worker fatal error:', err);
  process.exit(1);
});
