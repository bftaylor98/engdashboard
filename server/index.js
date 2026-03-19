import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database/init.js';
import { requireAuth } from './middleware/auth.js';
import authRoutes from './routes/auth.js';
import workOrderRoutes from './routes/workOrders.js';
import importRoutes from './routes/import.js';
import exportRoutes from './routes/export.js';
import statsRoutes from './routes/stats.js';
import revisionAlertRoutes from './routes/revisionAlerts.js';
import constructionMetricRoutes from './routes/constructionMetrics.js';
import eventsRoutes from './routes/events.js';
import versionRoutes from './routes/versions.js';
import proshopRoutes, {
  warmToolingExpensesCache,
  warmOpenPOsCache,
  warmSharedNcrCache,
  warmMaterialStatusCache,
} from './routes/proshop.js';
import timeTrackingRoutes, {
  warmTimeTrackingCache,
  warmLatestDateCache,
  warmTimeTrackingStatsCache,
} from './routes/timeTracking.js';
import stockGridRoutes, { warmStockGridCache } from './routes/stockGrid.js';
import projectsRoutes from './routes/projects.js';
import knowledgeRoutes from './routes/knowledge.js';
import tvRoutes from './routes/tv.js';
import calendarRoutes from './routes/calendar.js';
import machinesRoutes, { warmMachinesCache } from './routes/machines.js';
import { getProshopToken } from './lib/proshopClient.js';
import { getCacheStatus } from './lib/cacheStore.js';
import { registerJob, getSchedulerStatus, stopAll } from './lib/cacheScheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

const DEBUG = process.env.DEBUG === '1' || process.env.DEBUG === 'true';

/** In-memory ring buffer of recent requests for GET /api/debug/requests (max 50) */
const RECENT_REQUESTS_MAX = 50;
const recentRequests = [];

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Initialize database
const db = initDatabase();

// Make db available to routes
app.use((req, res, next) => {
  req.db = db;
  next();
});

// Request timing: log method, path, status, duration when DEBUG=1 or ?debug=1; always push to recentRequests
app.use((req, res, next) => {
  const start = Date.now();
  const pathForLog = req.originalUrl?.split('?')[0] || req.path || req.url;
  res.on('finish', () => {
    const duration = Date.now() - start;
    const entry = {
      method: req.method,
      path: pathForLog,
      status: res.statusCode,
      durationMs: duration,
      timestamp: new Date().toISOString(),
    };
    recentRequests.unshift(entry);
    if (recentRequests.length > RECENT_REQUESTS_MAX) recentRequests.pop();
    const logTiming = DEBUG || (req.query && req.query.debug !== undefined);
    if (logTiming) {
      console.log(`[timing] ${req.method} ${pathForLog} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.use('/api/tv', tvRoutes);

// Protected API Routes – require valid session token
app.use('/api/work-orders', requireAuth, workOrderRoutes);
app.use('/api/import', requireAuth, importRoutes);
app.use('/api/export', requireAuth, exportRoutes);
app.use('/api/stats', requireAuth, statsRoutes);
app.use('/api/revision-alerts', requireAuth, revisionAlertRoutes);
app.use('/api/construction-metrics', requireAuth, constructionMetricRoutes);
app.use('/api/versions', requireAuth, versionRoutes);
app.use('/api/proshop/time-tracking', requireAuth, timeTrackingRoutes);
app.use('/api/proshop', requireAuth, proshopRoutes);
app.use('/api/stock-grid', requireAuth, stockGridRoutes);
app.use('/api/projects', requireAuth, projectsRoutes);
app.use('/api/knowledge', requireAuth, knowledgeRoutes);
app.use('/api/calendar', requireAuth, calendarRoutes);
app.use('/api/machines', requireAuth, machinesRoutes);

// SSE endpoint (auth handled inside via query string token)
app.use('/api/events', eventsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const count = db.prepare('SELECT COUNT(*) as count FROM engineering_work_orders').get();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    workOrderCount: count.count
  });
});

// Debug: status (health + optional Proshop connectivity) – requires auth
app.get('/api/debug/status', requireAuth, async (req, res) => {
  try {
    const count = db.prepare('SELECT COUNT(*) as count FROM engineering_work_orders').get();
    const payload = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      workOrderCount: count.count,
    };
    const proshopStart = Date.now();
    const proshopTimeoutMs = 10000;
    try {
      const tokenPromise = getProshopToken();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), proshopTimeoutMs)
      );
      await Promise.race([tokenPromise, timeoutPromise]);
      const proshopMs = Date.now() - proshopStart;
      payload.proshop = 'ok';
      payload.proshopMs = proshopMs;
    } catch (proErr) {
      const proshopMs = Date.now() - proshopStart;
      payload.proshop = proErr?.message === 'timeout' ? 'timeout' : 'error';
      payload.proshopMs = proshopMs;
      if (proErr?.message !== 'timeout') payload.proshopError = proErr?.message || String(proErr);
    }
    res.json(payload);
  } catch (err) {
    console.error('[debug] status error:', err);
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// Debug: recent request timings – requires auth
app.get('/api/debug/requests', requireAuth, (req, res) => {
  res.json({ requests: recentRequests });
});

// Debug: cache status – requires auth
app.get('/api/debug/caches', requireAuth, (req, res) => {
  res.json({ caches: getCacheStatus(), scheduler: getSchedulerStatus() });
});

// Serve static frontend in production
const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runInitialWarm() {
  // 2. material status
  try {
    await warmMaterialStatusCache(db);
  } catch (_) {
    // warm functions already log to cache.log; keep startup console clean
  }
  await sleep(3000);

  // 3. shared NCR cache
  try {
    await warmSharedNcrCache();
  } catch (_) {
    // warm functions already log to cache.log; keep startup console clean
  }
  await sleep(3000);

  // 4. time tracking caches (run sequentially, no gaps between them)
  try {
    await warmTimeTrackingCache();
  } catch (_) {
    // warm functions already log to cache.log; keep startup console clean
  }
  try {
    await warmLatestDateCache();
  } catch (_) {
    // warm functions already log to cache.log; keep startup console clean
  }
  try {
    await warmTimeTrackingStatsCache();
  } catch (_) {
    // warm functions already log to cache.log; keep startup console clean
  }
  await sleep(3000);

  // 5. machines (30s hard timeout — machines query is large and can hang on startup)
  try {
    await Promise.race([
      warmMachinesCache(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('machines warm timed out')), 30000)),
    ]);
  } catch (_) {
    // warm functions already log to cache.log; keep startup console clean
  }
  await sleep(3000);

  // 6. tooling expenses
  try {
    await warmToolingExpensesCache();
  } catch (_) {
    // warm functions already log to cache.log; keep startup console clean
  }
  await sleep(3000);

  // 7. open POs
  try {
    await warmOpenPOsCache();
  } catch (_) {
    // warm functions already log to cache.log; keep startup console clean
  }

  console.log('[server] Initial cache warm complete');

  // Register recurring refresh jobs after initial caches are populated.
  registerJob('material-status', () => warmMaterialStatusCache(db), { intervalMs: 5 * 60 * 1000 });
  registerJob('ncrs', warmSharedNcrCache, { intervalMs: 10 * 60 * 1000 });
  registerJob(
    'time-tracking',
    async () => {
      await warmTimeTrackingCache();
      await warmLatestDateCache();
      await warmTimeTrackingStatsCache();
    },
    { intervalMs: 10 * 60 * 1000 }
  );
  registerJob('machines', warmMachinesCache, { intervalMs: 10 * 60 * 1000 });
  registerJob('tooling-expenses', warmToolingExpensesCache, { intervalMs: 15 * 60 * 1000 });
  registerJob('open-pos', warmOpenPOsCache, { intervalMs: 15 * 60 * 1000 });
}

const server = app.listen(PORT, () => {
  console.log(`[server] Engineering Schedule Dashboard API running on http://localhost:${PORT}`);
  const count = db.prepare('SELECT COUNT(*) as count FROM engineering_work_orders').get();
  console.log(`[server] Database initialized with ${count.count} work orders`);
  console.log('[server] ProShop cache warming started (see logs/cache.log for details)');

  // 1. stock grid (SQL, not ProShop) can warm/refresh immediately and independently
  registerJob('stock-grid', warmStockGridCache, { intervalMs: 5 * 60 * 1000, initialDelayMs: 0 });

  // Run sequential initial warm without blocking server startup
  setImmediate(() => {
    runInitialWarm();
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[server] Port ${PORT} is already in use. Stop the other process (e.g. run "npx kill-port 3001") and restart.`);
    process.exit(1);
  }
  throw err;
});

function shutdown() {
  stopAll();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

export default app;

