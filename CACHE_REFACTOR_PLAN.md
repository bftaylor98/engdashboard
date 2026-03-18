# Engineering Dashboard — Cache Architecture Refactor Plan

## Purpose

This document is a step-by-step instruction set for Cursor AI to refactor how the Engineering Dashboard handles ProShop API cache warming. The goals are:

1. **Clean console** — Cache warming logs should NOT appear in the main server CLI. Only HTTP server messages, startup info, and actual errors should appear in the terminal.
2. **Smart scheduling** — Caches should refresh on independent intervals that wait for the previous run to finish before scheduling the next one (not overlapping `setInterval`).
3. **Efficient throttle usage** — Long paginated queries (tooling, open POs, machines) shouldn't starve faster caches (NCRs, time tracking) from refreshing.
4. **Centralized cache state** — Replace the scattered `let xxxCache = null` variables across multiple route files with a single cache store.
5. **Credential cleanup** — Move the EST100 SQL database credentials to `.env`.

**The app owner (Brad) has no coding knowledge.** Every phase must be atomic, testable, and safe.

---

## CRITICAL RULES

### Rule 1: Never Break What Works
- **Before starting ANY phase**, create a git commit: `git add -A && git commit -m "backup: before cache-phase X"`
- **After completing each phase**, verify the app starts: `npm run dev`. The server must start, the frontend must load, and data must still appear on pages that use cached data (Dashboard, Analytics, Schedule, Machines, Time Tracking, NCRs).
- **Routes must continue returning the same JSON shape.** Do not change any API response format. The frontend depends on these exact shapes.
- **Do not modify any frontend files** (`src/` directory) during this plan.

### Rule 2: One Phase at a Time
Complete each phase fully before moving to the next. Each phase must end with a working app.

### Rule 3: Debugging Loop Protocol
Same as the UI plan:
1. Read the full error message — exact file and line.
2. Check if the error existed before your changes — `git stash`, test, `git stash pop`.
3. If your change caused it: fix only that specific error.
4. After 3 failed fix attempts for the same error: revert the phase (`git checkout .`) and retry with a simpler approach.
5. Never enter fix-on-fix loops.

### Rule 4: Test Verification After Each Phase
After each phase, confirm:
1. `npm run dev` starts without errors
2. The server logs `Engineering Schedule Dashboard API running on http://localhost:3001`
3. Open `http://localhost:5173` and verify:
   - Dashboard loads with stat cards showing numbers
   - Schedule page loads with work orders
   - Analytics page shows charts (may take a minute for caches to warm)

---

## Architecture Context — How It Works Now

### Cache Flow
```
Server starts
  → runProshopWarmsSequentially() fires (serial, 5s gaps)
  → Each warm function calls ProShop GraphQL API via proshopClient.js
  → proshopClient.js throttles: 1 API call at a time, 300ms gap
  → Results stored in module-level variables (let xxxCache = null)
  → setInterval / setTimeout schedule ongoing refreshes
  → HTTP routes read from module-level cache variables (never call ProShop)
```

### Current Cache Inventory
| Cache | File | Warm Function | Interval | ProShop API Calls Per Warm |
|-------|------|--------------|----------|---------------------------|
| Tooling Expenses | proshop.js | warmToolingExpensesCache | 15 min | 1-20 (paginated POs) |
| Open POs | proshop.js | warmOpenPOsCache | 15 min | 1-20 pages + N detail queries |
| NCRs | proshop.js | warmSharedNcrCache | 10 min | 2 (count + bulk) |
| Material Status | proshop.js | warmMaterialStatusCache | 5 min | 1-5 (WOs + PO lookups) |
| Time Tracking | timeTracking.js | warmTimeTrackingCache | 10 min | 4 (1 per user) |
| Latest Date | timeTracking.js | warmLatestDateCache | 10 min | 4 (1 per user) |
| Time Stats | timeTracking.js | warmTimeTrackingStatsCache | 10 min | 4+ (per user, YTD) |
| Machines | machines.js | warmMachinesCache | 10 min | 1-20 (paginated WOs) |
| Stock Grid | stockGrid.js | warmStockGridCache | 5 min | 0 (SQL, not ProShop) |

### Current Problems
1. **Console noise**: 78 console.log/warn/error statements across cache route files. Every warm cycle prints multiple lines.
2. **setInterval doesn't wait for completion**: If a warm takes 3 minutes, the next `setInterval` fires while it's still running. This can cause overlapping API calls.
3. **Global serial throttle queue**: All warm functions share one queue. A 20-page machines warm queues 20 calls and blocks everything behind it.
4. **Cache state is scattered**: Each route file has its own `let xxxCache = null` variables. No central way to check "what caches are loaded, when were they last updated, are any errored?"
5. **Open POs warm is especially expensive**: It paginates ALL POs, then fires a DETAIL query for each open Rocket Supply PO. With N open POs, that's `(pages) + N` API calls.

---

## PHASE 0: Credential Cleanup — EST100 SQL

**Goal**: Move the hardcoded EST100 database credentials from `server/routes/stockGrid.js` to `.env`.

### 0.1 — Add EST100 variables to `.env`

Append to the existing `.env` file:
```env
EST100_SERVER=192.168.1.36
EST100_DATABASE=EST100
EST100_USER=ITM2005
EST100_PASSWORD=ITM
```

### 0.2 — Add to `.env.example`

Append to `.env.example`:
```env
EST100_SERVER=192.168.1.36
EST100_DATABASE=EST100
EST100_USER=your-sql-user
EST100_PASSWORD=your-sql-password
```

### 0.3 — Update `server/routes/stockGrid.js`

Replace the hardcoded `EST100_CONFIG` block (lines 32-44) with:
```js
const EST100_CONFIG = {
  server: process.env.EST100_SERVER || '192.168.1.36',
  database: process.env.EST100_DATABASE || 'EST100',
  user: process.env.EST100_USER || '',
  password: process.env.EST100_PASSWORD || '',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  requestTimeout: 30000,
  connectionTimeout: 10000,
};
```

### 0.4 — Commit
```bash
git add -A
git commit -m "cache-phase 0: move EST100 credentials to .env"
```

---

## PHASE 1: Create Cache Logger

**Goal**: Replace all `console.log/warn/error` calls in cache-related code with a logger that writes to a file instead of stdout. The main server CLI stays clean.

### 1.1 — Create `server/lib/cacheLogger.js`

```js
/**
 * Cache-specific logger. Writes to logs/cache.log instead of stdout.
 * Errors still go to stderr so they're visible if something is truly broken.
 *
 * Set CACHE_LOG_CONSOLE=1 to also print to console (for debugging).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'cache.log');
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5 MB — rotate when exceeded
const CONSOLE_TOO = process.env.CACHE_LOG_CONSOLE === '1' || process.env.CACHE_LOG_CONSOLE === 'true';

// Ensure logs directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function rotateIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size > MAX_LOG_SIZE) {
        const rotated = LOG_FILE + '.1';
        if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
        fs.renameSync(LOG_FILE, rotated);
      }
    }
  } catch (_) {
    // ignore rotation errors
  }
}

function write(level, tag, ...args) {
  const timestamp = new Date().toISOString();
  const message = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  const line = `${timestamp} [${level}] [${tag}] ${message}\n`;

  rotateIfNeeded();
  fs.appendFileSync(LOG_FILE, line);

  if (CONSOLE_TOO) {
    if (level === 'ERROR') console.error(line.trimEnd());
    else console.log(line.trimEnd());
  }
}

export const cacheLog = {
  info: (tag, ...args) => write('INFO', tag, ...args),
  warn: (tag, ...args) => write('WARN', tag, ...args),
  error: (tag, ...args) => {
    write('ERROR', tag, ...args);
    // Errors also go to stderr so they're not invisible
    const timestamp = new Date().toISOString();
    const message = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    console.error(`${timestamp} [cache-error] [${tag}] ${message}`);
  },
};
```

### 1.2 — Add `logs/` to `.gitignore`

Append to `.gitignore`:
```
logs/
```

### 1.3 — Replace console statements in `server/routes/proshop.js`

Add this import at the top of `server/routes/proshop.js`:
```js
import { cacheLog } from '../lib/cacheLogger.js';
```

Then replace all `console.log`, `console.warn`, `console.error` calls in the file that are related to cache warming and ProShop operations. Replace them with the `cacheLog` equivalent:

- `console.log('[proshop] Tooling expenses cache warmed')` → `cacheLog.info('proshop', 'Tooling expenses cache warmed')`
- `console.warn('[proshop] Tooling expenses warm rate limited ...')` → `cacheLog.warn('proshop', 'Tooling expenses warm rate limited, cache unchanged')`
- `console.error('[proshop] Tooling expenses warm failed:', err.message)` → `cacheLog.error('proshop', 'Tooling expenses warm failed:', err.message)`
- And so on for ALL cache-related console statements in the file.

**KEEP** the `console.log` calls on these specific lines — they run once at module load and are useful startup info:
- `console.log('[proshop] Loaded X customer abbreviations...')` (line ~120)
- `console.log('[proshop] Loaded X employee ID -> name mappings')` (line ~148)
- Any `console.warn` about missing CSV files (these only fire once at startup)

**Replace everything else** — all log statements inside warm functions, build functions, and their `.catch()` handlers.

### 1.4 — Replace console statements in `server/routes/timeTracking.js`

Same pattern: import `cacheLog`, replace all `console.log/warn/error` with `cacheLog.info/warn/error('time-tracking', ...)`.

### 1.5 — Replace console statements in `server/routes/machines.js`

Same pattern. Use tag `'machines'`. The machines file is especially noisy — it has debug logs for every pagination page. Replace all of them.

### 1.6 — Replace console statements in `server/routes/stockGrid.js`

Same pattern. Use tag `'stock-grid'`.

### 1.7 — Replace console statements in `server/lib/proshopClient.js`

Same pattern. Use tag `'proshop-client'`. This file has error logging for auth failures and GraphQL errors.

### 1.8 — Update `server/index.js` startup log

Replace the line:
```js
console.log('[server] ProShop caches: initial warm then NCR 10min, material 5min, tooling/open POs 15min, time-tracking 10min (staggered)');
```
With just:
```js
console.log('[server] ProShop cache warming started (see logs/cache.log for details)');
```

### 1.9 — Commit
```bash
git add -A
git commit -m "cache-phase 1: route cache logs to logs/cache.log"
```

---

## PHASE 2: Centralized Cache Store

**Goal**: Replace scattered `let xxxCache = null` variables with a single cache store. Routes read from it. Warm functions write to it.

### 2.1 — Create `server/lib/cacheStore.js`

```js
/**
 * Centralized in-memory cache store.
 * All ProShop and external data caches live here.
 * Warm functions write via set(). Routes read via get().
 */
import { cacheLog } from './cacheLogger.js';

const store = new Map();

/**
 * Set a cache entry.
 * @param {string} key - Cache key (e.g., 'tooling-expenses', 'ncrs', 'material-status')
 * @param {any} data - The cached response data
 * @param {object} [meta] - Optional metadata (error info, cache key variants, etc.)
 */
export function setCache(key, data, meta = {}) {
  store.set(key, {
    data,
    timestamp: Date.now(),
    error: null,
    ...meta,
  });
  cacheLog.info('cache-store', `Updated: ${key}`);
}

/**
 * Record a cache error (cache data unchanged, but track that the last refresh failed).
 * @param {string} key - Cache key
 * @param {object} error - Error info (e.g., { reason: 'rate_limited', message: '...' })
 */
export function setCacheError(key, error) {
  const existing = store.get(key);
  if (existing) {
    existing.error = error;
    existing.lastErrorAt = Date.now();
  } else {
    store.set(key, {
      data: null,
      timestamp: null,
      error,
      lastErrorAt: Date.now(),
    });
  }
}

/**
 * Get a cache entry.
 * @param {string} key
 * @returns {{ data: any, timestamp: number|null, error: any } | null}
 */
export function getCache(key) {
  return store.get(key) || null;
}

/**
 * Get just the cached data (convenience).
 * @param {string} key
 * @returns {any|null}
 */
export function getCacheData(key) {
  const entry = store.get(key);
  return entry?.data ?? null;
}

/**
 * Get the last error for a cache key (null if no error or if last refresh succeeded).
 * @param {string} key
 * @returns {object|null}
 */
export function getCacheError(key) {
  const entry = store.get(key);
  return entry?.error ?? null;
}

/**
 * Get a status summary of all caches (for debug endpoint).
 * @returns {object}
 */
export function getCacheStatus() {
  const status = {};
  for (const [key, entry] of store.entries()) {
    status[key] = {
      hasData: entry.data != null,
      lastUpdated: entry.timestamp ? new Date(entry.timestamp).toISOString() : null,
      ageMs: entry.timestamp ? Date.now() - entry.timestamp : null,
      error: entry.error,
      lastErrorAt: entry.lastErrorAt ? new Date(entry.lastErrorAt).toISOString() : null,
    };
  }
  return status;
}
```

### 2.2 — Add a debug endpoint to `server/index.js`

After the existing `/api/debug/requests` endpoint, add:
```js
import { getCacheStatus } from './lib/cacheStore.js';

// Debug: cache status – requires auth
app.get('/api/debug/caches', requireAuth, (req, res) => {
  res.json({ caches: getCacheStatus() });
});
```

This gives you a way to check cache health at `http://localhost:3001/api/debug/caches`.

### 2.3 — Migrate `server/routes/proshop.js` cache variables to the store

Import the cache store at the top of the file:
```js
import { setCache, setCacheError, getCacheData, getCacheError } from '../lib/cacheStore.js';
```

**For each cache in proshop.js**, replace the module-level variable pattern with the store.

**Tooling Expenses** — Replace:
```js
// DELETE these module-level variables:
let expensesCache = null;
let cacheTimestamp = null;
let expensesLastError = null;
```

In `warmToolingExpensesCache()` `.then()`:
```js
// Replace: expensesCache = response; cacheTimestamp = Date.now(); expensesLastError = null;
// With:
setCache('tooling-expenses', response);
```

In `warmToolingExpensesCache()` `.catch()`:
```js
// Replace: expensesLastError = { reason: 'rate_limited', ... };
// With:
setCacheError('tooling-expenses', { reason: 'rate_limited', message: 'ProShop temporarily unavailable' });
```

In the route handler `router.get('/tooling-expenses', ...)`:
```js
// Replace: if (expensesCache) return res.json(expensesCache);
// With:
const cached = getCacheData('tooling-expenses');
if (cached) return res.json(cached);
const err = getCacheError('tooling-expenses');
if (err?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
return res.status(200).json({ success: true, data: null });
```

In `getToolingExpensesCurrentMonth()`:
```js
// Replace: if (!expensesCache?.data) return null;
// With:
const cached = getCacheData('tooling-expenses');
if (!cached?.data) return null;
return typeof cached.data.totalExpense === 'number' ? cached.data.totalExpense : null;
```

**Repeat this exact pattern for:**
- **Material Status**: key `'material-status'`, replace `materialStatusCache`, `materialStatusLastError`, etc.
- **Open POs**: key `'open-pos'`, replace `openPOsCache`, `openPOsLastError`, etc.
- **NCRs**: key `'ncrs-recent'`, `'ncrs-last24h'`, `'ncrs-by-assignee'`. The NCR warm function populates multiple cache entries from one fetch — use `setCache()` for each.
- **All NCRs raw**: key `'ncrs-all'`, replace `allNcrsCache`, etc.

**IMPORTANT**: The NCR section has multiple interrelated caches (`recentNcrsCacheByLimit`, `last24hNcrsCache`, `byAssigneeCache`, `allNcrsCache`). Migrate them one at a time. The `recentNcrsCacheByLimit` is keyed by limit number — use `setCache('ncrs-recent-10', ...)` etc., or store as `setCache('ncrs-recent', { [limit]: response })`.

### 2.4 — Migrate `server/routes/timeTracking.js` cache variables

Same pattern. Keys: `'time-tracking'`, `'time-tracking-latest-date'`, `'time-tracking-stats'`.

The `timeTrackingCache` is a map keyed by `${date}:${userId|all}`. Instead of migrating that entire map structure, use a simple approach:
```js
setCache('time-tracking', { entries: timeTrackingCache, lastError: null });
```
Or keep the map as-is and only migrate the error state and the flag variables. Use your judgment — the goal is that warm functions call `setCache()` and routes call `getCacheData()`, but if the existing map structure makes that awkward, you can keep the map and just add the store for the status/error tracking.

### 2.5 — Migrate `server/routes/machines.js` cache variables

Key: `'machines'`. Replace `machinesCache`, `machinesLastError`.

### 2.6 — Migrate `server/routes/stockGrid.js` cache variables

Key: `'stock-grid'`. Replace `stockGridCache`, `stockGridCacheTimestamp`.

### 2.7 — Commit
```bash
git add -A
git commit -m "cache-phase 2: centralized cache store"
```

---

## PHASE 3: Smart Scheduler

**Goal**: Replace the `setTimeout`/`setInterval` mess in `server/index.js` with a scheduler that:
- Waits for the previous warm to FINISH before scheduling the next one
- Tracks execution time
- Logs schedule state to cache.log
- Respects priorities (fast caches don't get blocked by slow ones)

### 3.1 — Create `server/lib/cacheScheduler.js`

```js
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
    cacheLog.error('scheduler', `"${job.name}" failed after ${duration}ms: ${err.message || err}`);
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
```

### 3.2 — Convert warm functions to return Promises

Currently, warm functions like `warmToolingExpensesCache()` call the async build function and handle `.then()/.catch()` internally, returning `void`. The scheduler needs them to return a Promise so it can track completion.

**For each warm function**, change the pattern from:
```js
export function warmToolingExpensesCache() {
  buildToolingExpensesResponse()
    .then((response) => {
      setCache('tooling-expenses', response);
      cacheLog.info('proshop', 'Tooling expenses cache warmed');
    })
    .catch((err) => { ... });
}
```

To:
```js
export async function warmToolingExpensesCache() {
  try {
    const response = await buildToolingExpensesResponse();
    setCache('tooling-expenses', response);
    cacheLog.info('proshop', 'Tooling expenses cache warmed');
  } catch (err) {
    if (isProshopRateLimitError(err)) {
      setCacheError('tooling-expenses', { reason: 'rate_limited', message: 'ProShop temporarily unavailable' });
      cacheLog.warn('proshop', 'Tooling expenses warm rate limited, cache unchanged');
    } else {
      cacheLog.error('proshop', 'Tooling expenses warm failed:', err.message || err);
    }
    throw err; // Re-throw so scheduler can track the failure
  }
}
```

Do this for ALL warm functions:
- `warmToolingExpensesCache` in proshop.js
- `warmOpenPOsCache` in proshop.js
- `warmSharedNcrCache` in proshop.js
- `warmMaterialStatusCache` in proshop.js
- `warmTimeTrackingCache` in timeTracking.js
- `warmLatestDateCache` in timeTracking.js
- `warmTimeTrackingStatsCache` in timeTracking.js
- `warmMachinesCache` in machines.js
- `warmStockGridCache` in stockGrid.js

### 3.3 — Replace the scheduling logic in `server/index.js`

Remove ALL of the following from `server/index.js`:
- The `PROSHOP_WARM_DELAY_MS` constant
- ALL `*_INTERVAL_MS` and `*_FIRST_DELAY_MS` constants
- The `delay()` function
- The `runProshopWarmsSequentially()` function
- ALL `setTimeout(() => { ... setInterval(...) ... })` blocks inside `app.listen`

Replace with:
```js
import { registerJob, getSchedulerStatus } from './lib/cacheScheduler.js';

// Inside the app.listen callback, after the startup logs:

// Stock grid (SQL — not ProShop, can run immediately)
registerJob('stock-grid', () => warmStockGridCache(), {
  intervalMs: 5 * 60 * 1000,  // 5 min
  initialDelayMs: 0,
});

// ProShop caches — staggered initial delays so they don't all hit the API at once
registerJob('material-status', () => warmMaterialStatusCache(db), {
  intervalMs: 5 * 60 * 1000,  // 5 min (highest refresh rate — material changes matter)
  initialDelayMs: 2000,
});

registerJob('ncrs', () => warmSharedNcrCache(), {
  intervalMs: 10 * 60 * 1000, // 10 min
  initialDelayMs: 7000,
});

registerJob('time-tracking', async () => {
  await warmTimeTrackingCache();
  await warmLatestDateCache();
  await warmTimeTrackingStatsCache();
}, {
  intervalMs: 10 * 60 * 1000, // 10 min
  initialDelayMs: 12000,
});

registerJob('machines', () => warmMachinesCache(), {
  intervalMs: 10 * 60 * 1000, // 10 min
  initialDelayMs: 17000,
});

registerJob('tooling-expenses', () => warmToolingExpensesCache(), {
  intervalMs: 15 * 60 * 1000, // 15 min
  initialDelayMs: 22000,
});

registerJob('open-pos', () => warmOpenPOsCache(), {
  intervalMs: 15 * 60 * 1000, // 15 min
  initialDelayMs: 27000,
});
```

Note the staggered initial delays (2s, 7s, 12s, 17s, 22s, 27s). This replaces the old `runProshopWarmsSequentially()` function — each job starts independently with enough gap that they don't all compete for the throttle queue at once.

### 3.4 — Add scheduler status to debug endpoint

In `server/index.js`, update or add:
```js
import { getCacheStatus } from './lib/cacheStore.js';
import { getSchedulerStatus } from './lib/cacheScheduler.js';

app.get('/api/debug/caches', requireAuth, (req, res) => {
  res.json({
    caches: getCacheStatus(),
    scheduler: getSchedulerStatus(),
  });
});
```

### 3.5 — Add graceful shutdown

At the bottom of `server/index.js`, add:
```js
import { stopAll } from './lib/cacheScheduler.js';

process.on('SIGINT', () => {
  console.log('[server] Shutting down...');
  stopAll();
  server.close(() => process.exit(0));
});

process.on('SIGTERM', () => {
  stopAll();
  server.close(() => process.exit(0));
});
```

### 3.6 — Commit
```bash
git add -A
git commit -m "cache-phase 3: smart scheduler replaces setTimeout/setInterval"
```

---

## PHASE 4: Verification and Cleanup

### 4.1 — Verify console output

Start the server with `npm run dev`. The terminal should show:
```
[server] Engineering Schedule Dashboard API running on http://localhost:3001
[server] Database initialized with X work orders
[server] ProShop cache warming started (see logs/cache.log for details)
```

And then **nothing else** unless there's an actual error. All cache warming activity should only appear in `logs/cache.log`.

If cache warm errors still appear in the terminal, that's expected — `cacheLog.error()` intentionally writes to both the log file and stderr so you can spot real problems. But routine `info` and `warn` messages should only be in the log file.

### 4.2 — Verify cache.log

Check that `logs/cache.log` is being created and populated:
```bash
cat logs/cache.log
```

You should see scheduler registration messages, warm completion messages, and timing info.

### 4.3 — Verify the debug endpoint

Open `http://localhost:3001/api/debug/caches` (you'll need to pass a valid auth token). It should show all cache keys with their status, timestamps, and scheduler job info.

### 4.4 — Verify data loads on the frontend

Open the app and check:
- Dashboard: stat cards have numbers (not zeros or loading forever)
- Schedule: work orders appear with material status
- Analytics: charts load with tooling expense data
- Machines: machine queues show work orders
- Time Tracking: employee time data appears
- NCRs page: non-conformances load

Wait at least 30 seconds for the first caches to warm.

### 4.5 — Clean up any dead code

Search `server/index.js` for any remaining references to the old scheduling constants or functions that were replaced. Delete them if found.

Search all route files for any remaining module-level cache variables (`let xxxCache = null`) that should have been replaced by the cache store in Phase 2. Delete them if found.

### 4.6 — Commit
```bash
git add -A
git commit -m "cache-phase 4: verification and cleanup"
```

---

## Summary of What Changed

| Before | After |
|--------|-------|
| 78 console.log/warn/error in route files | All routed to `logs/cache.log` |
| Scattered `let xxxCache = null` in 4 files | Centralized `cacheStore.js` with `get/set` |
| `setInterval` that overlaps if warm is slow | `setTimeout` after completion (no overlap) |
| `runProshopWarmsSequentially()` blocks all | Independent jobs with staggered starts |
| No visibility into cache health | `/api/debug/caches` endpoint |
| EST100 SQL password hardcoded | Moved to `.env` |
| No graceful shutdown of timers | `stopAll()` on SIGINT/SIGTERM |

---

## Future Improvements (Not In This Plan)

These are worth doing eventually but are out of scope for this refactor:

1. **Priority throttle queue**: The proshopClient.js throttle treats all API calls equally. A future improvement could add priority levels so fast caches (2 API calls) don't get stuck behind slow paginated caches (20 API calls). This would mean modifying `proshopClient.js` to accept a priority parameter.

2. **Open POs optimization**: `buildOpenPOsResponse()` fetches ALL POs, filters for Rocket Supply, then fires a detail query for EACH one. This could be optimized by using a GraphQL filter for supplier name (if ProShop supports it) to avoid fetching thousands of irrelevant POs.

3. **Worker threads**: If the server ever becomes CPU-bound processing cache data, moving warm functions to a Node `worker_threads` Worker would fully isolate them from the HTTP serving thread. Not needed currently since the bottleneck is I/O (waiting for ProShop responses), not CPU.

4. **Cache persistence**: Currently all caches are lost on server restart. Writing caches to SQLite or a JSON file on disk would let the app serve stale-but-recent data immediately on restart while fresh data warms.

---

## Emergency Rollback

If the app is broken:
```bash
git log --oneline
# Find the commit before your changes
git checkout <hash> -- .
```

Or revert everything:
```bash
git checkout main -- .
```
