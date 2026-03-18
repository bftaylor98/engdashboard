import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getNcrCountLast30Days, getToolingExpensesCurrentMonth, getMaterialArrivedCount } from './proshop.js';
import { getEvents as getCalendarEvents } from './calendar.js';

const router = Router();

/** Known widget IDs for validation */
const KNOWN_WIDGET_IDS = new Set([
  'clock',
  'work-orders',
  'on-hold',
  'material-arrived',
  'tooling-cost',
  'status-breakdown',
  'workload-distribution',
  'calendar-this-week',
  'hot-jobs',
  'weather-footer',
  'basketball-score',
]);

/** Must match frontend TV_GRID_COLS / TV_GRID_ROWS (16×8 for finer resizing) */
const GRID_COLS = 16;
const GRID_ROWS = 8;

/** Default TV config when no row exists (matches frontend DEFAULT_TV_CONFIG, 16×8 grid) */
const DEFAULT_TV_CONFIG = {
  activeWidgetIds: [
    'clock',
    'work-orders',
    'on-hold',
    'material-arrived',
    'tooling-cost',
    'status-breakdown',
    'workload-distribution',
    'calendar-this-week',
    'hot-jobs',
    'weather-footer',
    'basketball-score',
  ],
  layout: [
    { widgetId: 'clock', gridCol: 2, gridRow: 2, gridColSpan: 4, gridRowSpan: 2 },
    { widgetId: 'work-orders', gridCol: 6, gridRow: 2, gridColSpan: 2, gridRowSpan: 2 },
    { widgetId: 'on-hold', gridCol: 8, gridRow: 2, gridColSpan: 2, gridRowSpan: 2 },
    { widgetId: 'material-arrived', gridCol: 10, gridRow: 2, gridColSpan: 2, gridRowSpan: 2 },
    { widgetId: 'tooling-cost', gridCol: 12, gridRow: 2, gridColSpan: 2, gridRowSpan: 2 },
    { widgetId: 'basketball-score', gridCol: 14, gridRow: 2, gridColSpan: 2, gridRowSpan: 2 },
    { widgetId: 'status-breakdown', gridCol: 2, gridRow: 4, gridColSpan: 8, gridRowSpan: 2 },
    { widgetId: 'workload-distribution', gridCol: 10, gridRow: 4, gridColSpan: 6, gridRowSpan: 2 },
    { widgetId: 'calendar-this-week', gridCol: 2, gridRow: 6, gridColSpan: 8, gridRowSpan: 2 },
    { widgetId: 'hot-jobs', gridCol: 10, gridRow: 6, gridColSpan: 6, gridRowSpan: 2 },
    { widgetId: 'weather-footer', gridCol: 2, gridRow: 8, gridColSpan: 14, gridRowSpan: 1 },
  ],
};

function isAdmin(req) {
  const u = req.user;
  return u && (u.username === 'admin' || u.username === 'brad');
}

/** This week: Sunday 00:00:00 to Saturday 23:59:59.999 (weekStartsOn: 0) */
function getThisWeekRange() {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dayOfWeek);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

// Status labels for status breakdown (match Analytics STATUS_OPTIONS, excluding completed)
const STATUS_LABELS = {
  engineering: 'Engineering',
  'engineering-completed': 'Eng. Comp.',
  programming: 'Programming',
  'programming-completed': 'Prog. Comp.',
  hold: 'Hold',
};

/**
 * GET /api/tv - Combined dashboard stats + workload (public, no auth).
 * For TV display: one request per refresh.
 */
function debugTiming(req) {
  return process.env.DEBUG === '1' || process.env.DEBUG === 'true' || (req.query && req.query.debug !== undefined);
}

router.get('/', async (req, res) => {
  try {
    const db = req.db;
    const now = new Date().toISOString().split('T')[0];
    const logTiming = debugTiming(req);

    const dbPhaseStart = Date.now();
    // Dashboard stats (no assignee filter - full shop view)
    const total = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status != 'completed'`
    ).get().count;
    const overdue = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE due_date < ? AND current_status NOT IN (?, ?, ?)`
    ).get(now, 'engineering-completed', 'programming-completed', 'completed').count;
    const dueThisWeek = db.prepare(`
      SELECT COUNT(*) as count FROM engineering_work_orders
      WHERE due_date >= ? AND due_date <= date(?, '+7 days')
      AND current_status NOT IN ('engineering-completed', 'programming-completed', 'completed')
    `).get(now, now).count;
    const hotJobs = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE is_hot_job = 1 AND current_status != 'completed'`
    ).get().count;
    const completed = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status IN ('engineering-completed', 'programming-completed') AND current_status != 'completed'`
    ).get().count;
    const inProgress = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status IN ('engineering', 'programming') AND current_status != 'completed'`
    ).get().count;
    const assigned = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status = 'engineering' AND current_status != 'completed'`
    ).get().count;
    const totalProgHours = db.prepare(
      `SELECT COALESCE(SUM(est_programming_hours), 0) as total FROM engineering_work_orders WHERE current_status NOT IN (?, ?, ?)`
    ).get('engineering-completed', 'programming-completed', 'completed').total;
    const totalEngHours = db.prepare(
      `SELECT COALESCE(SUM(est_engineering_hours), 0) as total FROM engineering_work_orders WHERE current_status NOT IN (?, ?, ?)`
    ).get('engineering-completed', 'programming-completed', 'completed').total;
    const materialNotOrdered = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE material_status = 'not-ordered' AND current_status NOT IN ('engineering-completed', 'programming-completed', 'completed')`
    ).get().count;
    const materialArrivedCountDb = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE material_status = 'arrived' AND current_status != 'completed'`
    ).get().count;

    const revisionCount = db.prepare('SELECT COUNT(*) as count FROM revision_alerts').get().count;

    const workload = db.prepare(`
      SELECT
        current_box as assignee,
        COUNT(*) as jobCount,
        COALESCE(SUM(est_programming_hours), 0) as programmingHours,
        COALESCE(SUM(est_engineering_hours), 0) as engineeringHours,
        SUM(CASE WHEN due_date < date('now') AND current_status NOT IN ('engineering-completed', 'programming-completed', 'completed') THEN 1 ELSE 0 END) as overdueCount
      FROM engineering_work_orders
      WHERE current_box IS NOT NULL AND current_box != '' AND current_status != 'completed'
      GROUP BY current_box
      ORDER BY jobCount DESC
    `).all();

    // Status breakdown (excluding completed)
    const statusRows = db.prepare(`
      SELECT current_status as value, COUNT(*) as count
      FROM engineering_work_orders
      WHERE current_status != 'completed'
      GROUP BY current_status
    `).all();
    const statusBreakdown = statusRows.map((row) => ({
      value: row.value,
      label: STATUS_LABELS[row.value] ?? row.value,
      count: row.count,
    }));

    if (logTiming) {
      console.log(`[tv] db phase ${Date.now() - dbPhaseStart}ms`);
    }

    let ncrCountLast30Days = null;
    let toolingSpendCurrentMonth = null;
    let materialArrivedCount = materialArrivedCountDb;
    const proshopDelay = (ms) => new Promise((r) => setTimeout(r, ms));
    try {
      let t0 = Date.now();
      try {
        ncrCountLast30Days = await getNcrCountLast30Days();
        if (logTiming) console.log(`[tv] getNcrCountLast30Days ${Date.now() - t0}ms ok`);
      } catch (e) {
        if (logTiming) console.log(`[tv] getNcrCountLast30Days ${Date.now() - t0}ms error: ${e?.message || e}`);
        console.warn('[tv] ProShop helpers error:', e?.message || e);
      }
      await proshopDelay(1500);
      t0 = Date.now();
      try {
        toolingSpendCurrentMonth = await getToolingExpensesCurrentMonth();
        if (logTiming) console.log(`[tv] getToolingExpensesCurrentMonth ${Date.now() - t0}ms ok`);
      } catch (e) {
        if (logTiming) console.log(`[tv] getToolingExpensesCurrentMonth ${Date.now() - t0}ms error: ${e?.message || e}`);
        console.warn('[tv] ProShop helpers error:', e?.message || e);
      }
      await proshopDelay(1500);
      t0 = Date.now();
      try {
        const materialArrivedProshop = await getMaterialArrivedCount(db);
        if (logTiming) console.log(`[tv] getMaterialArrivedCount ${Date.now() - t0}ms ok`);
        if (materialArrivedProshop != null) materialArrivedCount = materialArrivedProshop;
      } catch (e) {
        if (logTiming) console.log(`[tv] getMaterialArrivedCount ${Date.now() - t0}ms error: ${e?.message || e}`);
        console.warn('[tv] ProShop helpers error:', e?.message || e);
      }
    } catch (proErr) {
      console.warn('[tv] ProShop helpers error:', proErr?.message || proErr);
    }

    let calendarThisWeek = [];
    try {
      const { weekStart, weekEnd } = getThisWeekRange();
      calendarThisWeek = await getCalendarEvents(weekStart, weekEnd);
    } catch (e) {
      console.warn('[tv] calendar this week error:', e?.message || e);
    }

    const hotJobList = db
      .prepare(
        `SELECT wo_number, part_name, due_date FROM engineering_work_orders WHERE is_hot_job = 1 AND current_status != 'completed' ORDER BY due_date ASC, wo_number ASC`
      )
      .all();

    const payload = {
      success: true,
      data: {
        stats: {
          total,
          overdue,
          dueThisWeek,
          hotJobs,
          completed,
          inProgress,
          assigned,
          totalProgrammingHours: totalProgHours,
          totalEngineeringHours: totalEngHours,
          materialNotOrdered,
          materialArrivedCount,
          revisionCount,
        },
        workload,
        statusBreakdown,
        ncrCountLast30Days,
        toolingSpendCurrentMonth,
        calendarThisWeek,
        hotJobList,
      },
    };
    try {
      if (!res.headersSent) res.json(payload);
    } catch (sendErr) {
      console.warn('[tv] send failed (client disconnected?):', sendErr?.message);
    }
  } catch (err) {
    console.error('[tv] combined error:', err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

/**
 * GET /api/tv/dashboard - Dashboard stats only (public).
 */
router.get('/dashboard', (req, res) => {
  try {
    const db = req.db;
    const now = new Date().toISOString().split('T')[0];

    const total = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status != 'completed'`
    ).get().count;
    const overdue = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE due_date < ? AND current_status NOT IN (?, ?, ?)`
    ).get(now, 'engineering-completed', 'programming-completed', 'completed').count;
    const dueThisWeek = db.prepare(`
      SELECT COUNT(*) as count FROM engineering_work_orders
      WHERE due_date >= ? AND due_date <= date(?, '+7 days')
      AND current_status NOT IN ('engineering-completed', 'programming-completed', 'completed')
    `).get(now, now).count;
    const hotJobs = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE is_hot_job = 1 AND current_status != 'completed'`
    ).get().count;
    const completed = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status IN ('engineering-completed', 'programming-completed') AND current_status != 'completed'`
    ).get().count;
    const inProgress = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status IN ('engineering', 'programming') AND current_status != 'completed'`
    ).get().count;
    const assigned = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status = 'engineering' AND current_status != 'completed'`
    ).get().count;
    const totalProgHours = db.prepare(
      `SELECT COALESCE(SUM(est_programming_hours), 0) as total FROM engineering_work_orders WHERE current_status NOT IN (?, ?, ?)`
    ).get('engineering-completed', 'programming-completed', 'completed').total;
    const totalEngHours = db.prepare(
      `SELECT COALESCE(SUM(est_engineering_hours), 0) as total FROM engineering_work_orders WHERE current_status NOT IN (?, ?, ?)`
    ).get('engineering-completed', 'programming-completed', 'completed').total;
    const materialNotOrdered = db.prepare(
      `SELECT COUNT(*) as count FROM engineering_work_orders WHERE material_status = 'not-ordered' AND current_status NOT IN ('engineering-completed', 'programming-completed', 'completed')`
    ).get().count;
    const revisionCount = db.prepare('SELECT COUNT(*) as count FROM revision_alerts').get().count;

    res.json({
      success: true,
      data: {
        total,
        overdue,
        dueThisWeek,
        hotJobs,
        completed,
        inProgress,
        assigned,
        totalProgrammingHours: totalProgHours,
        totalEngineeringHours: totalEngHours,
        materialNotOrdered,
        revisionCount,
      },
    });
  } catch (err) {
    console.error('[tv] dashboard error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/tv/workload - Workload by assignee (public).
 */
router.get('/workload', (req, res) => {
  try {
    const db = req.db;
    const rows = db.prepare(`
      SELECT
        current_box as assignee,
        COUNT(*) as jobCount,
        COALESCE(SUM(est_programming_hours), 0) as programmingHours,
        COALESCE(SUM(est_engineering_hours), 0) as engineeringHours,
        SUM(CASE WHEN due_date < date('now') AND current_status NOT IN ('engineering-completed', 'programming-completed', 'completed') THEN 1 ELSE 0 END) as overdueCount
      FROM engineering_work_orders
      WHERE current_box IS NOT NULL AND current_box != '' AND current_status != 'completed'
      GROUP BY current_box
      ORDER BY jobCount DESC
    `).all();

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[tv] workload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/tv/config - Return TV layout config (public, for TV display and config page load).
 */
router.get('/config', (req, res) => {
  try {
    const db = req.db;
    const row = db.prepare('SELECT config_json FROM tv_config WHERE id = 1').get();
    if (!row || !row.config_json) {
      return res.json({ success: true, data: DEFAULT_TV_CONFIG });
    }
    let data;
    try {
      data = JSON.parse(row.config_json);
    } catch (e) {
      return res.json({ success: true, data: DEFAULT_TV_CONFIG });
    }
    if (!data.activeWidgetIds || !Array.isArray(data.layout)) {
      return res.json({ success: true, data: DEFAULT_TV_CONFIG });
    }
    res.json({ success: true, data: { activeWidgetIds: data.activeWidgetIds, layout: data.layout } });
  } catch (err) {
    console.error('[tv] config get error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * PUT /api/tv/config - Save TV layout config (auth + admin only).
 */
router.put('/config', requireAuth, (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  try {
    const db = req.db;
    const { activeWidgetIds, layout } = req.body || {};
    if (!Array.isArray(activeWidgetIds) || !Array.isArray(layout)) {
      return res.status(400).json({ success: false, error: 'activeWidgetIds and layout (arrays) required' });
    }
    for (const id of activeWidgetIds) {
      if (typeof id !== 'string' || !KNOWN_WIDGET_IDS.has(id)) {
        return res.status(400).json({ success: false, error: `Invalid or unknown widget id: ${id}` });
      }
    }
    for (const item of layout) {
      if (
        !item ||
        typeof item.widgetId !== 'string' ||
        !KNOWN_WIDGET_IDS.has(item.widgetId) ||
        typeof item.gridCol !== 'number' ||
        typeof item.gridRow !== 'number' ||
        typeof item.gridColSpan !== 'number' ||
        typeof item.gridRowSpan !== 'number' ||
        item.gridCol < 1 ||
        item.gridRow < 1 ||
        item.gridColSpan < 1 ||
        item.gridRowSpan < 1 ||
        item.gridCol + item.gridColSpan - 1 > GRID_COLS ||
        item.gridRow + item.gridRowSpan - 1 > GRID_ROWS
      ) {
        return res.status(400).json({
          success: false,
          error: 'Each layout item must have widgetId (known id), gridCol, gridRow, gridColSpan, gridRowSpan within grid bounds',
        });
      }
    }
    const config = { activeWidgetIds, layout };
    const now = new Date().toISOString();
    db.prepare('INSERT INTO tv_config (id, config_json, updated_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at').run(
      JSON.stringify(config),
      now
    );
    res.json({ success: true, data: config });
  } catch (err) {
    console.error('[tv] config put error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
