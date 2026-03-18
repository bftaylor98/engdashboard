/**
 * Cache warming scheduler.
 * Runs warm functions on independent intervals.
 * Each job waits for completion before scheduling its next run (no overlap).
 * Jobs run independently — a slow job doesn't block other jobs from running.
 */
import { cacheLog } from './cacheLogger.js';

const jobs = new Map();

/**
 * Register a cache warming job.
 * @param {string} name - Job name (for logging)
 * @param {Function} fn - Async function to execute (the warm function)
 * @param {object} options
 * @param {number} options.intervalMs - How long to wait AFTER completion before running again
 * @param {number} [options.initialDelayMs=0] - Delay before first run
 */
export function registerJob(name, fn, { intervalMs, initialDelayMs = 0 }) {
  if (jobs.has(name)) {
    cacheLog.warn('scheduler', `Job "${name}" already registered, skipping duplicate`);
    return;
  }

  const job = {
    name,
    fn,
    intervalMs,
    running: false,
    runCount: 0,
    lastRunMs: null,
    lastError: null,
    timer: null,
  };

  jobs.set(name, job);

  // Schedule first run
  job.timer = setTimeout(() => runJob(job), initialDelayMs);
  cacheLog.info('scheduler', `Registered "${name}" — interval ${intervalMs / 1000}s, first run in ${initialDelayMs / 1000}s`);
}

async function runJob(job) {
  if (job.running) {
    cacheLog.warn('scheduler', `"${job.name}" still running from previous cycle, skipping`);
    job.timer = setTimeout(() => runJob(job), job.intervalMs);
    return;
  }

  job.running = true;
  const start = Date.now();

  try {
    await job.fn();
    const duration = Date.now() - start;
    job.lastRunMs = duration;
    job.lastError = null;
    job.runCount++;
    cacheLog.info('scheduler', `"${job.name}" completed in ${duration}ms (run #${job.runCount})`);
  } catch (err) {
    const duration = Date.now() - start;
    job.lastRunMs = duration;
    job.lastError = err.message || String(err);
    job.runCount++;
    cacheLog.error('scheduler', `"${job.name}" failed after ${duration}ms:`, err.message || err);
  } finally {
    job.running = false;
    // Schedule next run AFTER completion
    job.timer = setTimeout(() => runJob(job), job.intervalMs);
  }
}

/**
 * Get status of all scheduled jobs (for debug endpoint).
 */
export function getSchedulerStatus() {
  const status = {};
  for (const [name, job] of jobs.entries()) {
    status[name] = {
      running: job.running,
      runCount: job.runCount,
      lastRunMs: job.lastRunMs,
      lastError: job.lastError,
      intervalMs: job.intervalMs,
    };
  }
  return status;
}

/**
 * Stop all scheduled jobs (for graceful shutdown).
 */
export function stopAll() {
  for (const [name, job] of jobs.entries()) {
    if (job.timer) clearTimeout(job.timer);
    cacheLog.info('scheduler', `Stopped "${name}"`);
  }
  jobs.clear();
}
