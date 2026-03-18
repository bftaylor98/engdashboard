import express from 'express';
import { getProshopToken, executeGraphQLQuery, isProshopRateLimitError } from '../lib/proshopClient.js';
import { cacheLog } from '../lib/cacheLogger.js';
import { setCache, setCacheError, clearCacheError, getCacheData, getCacheError } from '../lib/cacheStore.js';

const router = express.Router();

const TT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
const timeTrackingCache = {}; // key -> { response, timestamp }; also mirrored in cacheStore 'time-tracking'

// When cache is empty, return same shape as other ProShop routes (route never calls ProShop)
const RATE_LIMIT_RESPONSE = {
  error: true,
  reason: 'rate_limited',
  message: 'ProShop is temporarily unavailable. Please try again shortly.',
};

const TRACKED_USERS = [
  { proshopId: '345', firstName: 'Alex', lastName: 'Vincent' },
  { proshopId: '039', firstName: 'Thad', lastName: 'Slone' },
  { proshopId: '035', firstName: 'Rob', lastName: 'Perkins' },
  { proshopId: '268', firstName: 'Damien', lastName: 'McDaniel' },
];

const CATEGORY_LABELS = {
  PR: 'Programming',
  EN: 'Engineering',
  MP: 'Manufacturing Process',
  SE: 'Setup',
  RN: 'Run',
  IN: 'Inspection',
  PK: 'Packing',
  SH: 'Shipping',
  MA: 'Maintenance',
  TR: 'Training',
  MT: 'Meeting',
  CL: 'Cleanup',
  OT: 'Other',
};

/** Proshop returns times without colons e.g. "2026-02-25T113000Z". Normalize to ISO. */
function parseProshopTime(str) {
  if (!str || typeof str !== 'string') return null;
  const m = str.match(/^(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (m) return `${m[1]}T${m[2]}:${m[3]}:${m[4]}.000Z`;
  return str;
}

/** Given YYYY-MM-DD (Eastern day), return UTC range for that EST day (fixed UTC-5). */
function toESTRange(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const start = new Date(Date.UTC(y, m - 1, d, 5, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d + 1, 4, 59, 59, 999));
  return {
    startISO: start.toISOString(),
    endISO: end.toISOString(),
  };
}

/** Given start and end YYYY-MM-DD (Eastern), return UTC range for that span (fixed UTC-5). */
function toESTRangeBetween(startDateStr, endDateStr) {
  const start = toESTRange(startDateStr);
  const end = toESTRange(endDateStr);
  return { startISO: start.startISO, endISO: end.endISO };
}

/** Get EST date string (YYYY-MM-DD) from an ISO time (fixed UTC-5, no DST). */
function getESTDateFromISO(isoStr) {
  if (!isoStr) return null;
  const d = new Date(isoStr);
  const utc = d.getTime();
  const estOffset = 5 * 60 * 60 * 1000;
  const est = new Date(utc - estOffset);
  const y = est.getUTCFullYear();
  const m = String(est.getUTCMonth() + 1).padStart(2, '0');
  const day = String(est.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Day of week in EST (fixed UTC-5) for YYYY-MM-DD. 0=Sun, 1=Mon, ..., 6=Sat. */
function getESTDayOfWeek(dateStr) {
  const [y, mo, day] = dateStr.split('-').map(Number);
  const atNoonEST = new Date(Date.UTC(y, mo - 1, day, 12, 0, 0) - 5 * 60 * 60 * 1000);
  return atNoonEST.getUTCDay();
}

/** Next calendar day as YYYY-MM-DD. */
function nextDayStr(dateStr) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}

/** Count weekdays (Mon–Fri) in EST between startDateStr and endDateStr (inclusive). */
function countWeekdaysEST(startDateStr, endDateStr) {
  let count = 0;
  let curr = startDateStr;
  while (curr <= endDateStr) {
    const dow = getESTDayOfWeek(curr);
    if (dow >= 1 && dow <= 5) count++;
    curr = nextDayStr(curr);
  }
  return count;
}

/** Today's date as YYYY-MM-DD in Eastern (fixed UTC-5). */
function getESTDate() {
  const now = new Date();
  const utc = now.getTime();
  const estOffset = 5 * 60 * 60 * 1000;
  const est = new Date(utc - estOffset);
  const y = est.getUTCFullYear();
  const m = String(est.getUTCMonth() + 1).padStart(2, '0');
  const d = String(est.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Compute labor time in hours: (timeOut - timeIn - pauseMinutes) / 60, rounded to 2 decimals. */
function computeLaborTime(timeInStr, timeOutStr, pauseMinutes) {
  const tin = parseProshopTime(timeInStr);
  const tout = timeOutStr ? parseProshopTime(timeOutStr) : null;
  if (!tin) return null;
  if (!tout) return null;
  const inMs = new Date(tin).getTime();
  const outMs = new Date(tout).getTime();
  const pauseMs = (Number(pauseMinutes) || 0) * 60 * 1000;
  const hours = (outMs - inMs - pauseMs) / (60 * 60 * 1000);
  return Math.round(Math.max(0, hours) * 100) / 100;
}

const TIME_TRACKING_QUERY = `
  query GetUserTimeTracking($userId: String!, $pageSize: Int!, $pageStart: Int!, $filter: UserTimeTrackingFilter) {
    user(id: $userId) {
      id
      firstName
      lastName
      timeTracking(pageSize: $pageSize, pageStart: $pageStart, filter: $filter) {
        totalRecords
        records {
          id
          category
          operationNumber
          operatorPlainText
          percentTime
          percentWorkCellTime
          qtyRun
          spentDoing
          status
          timeIn
          timeOut
          totalTimePaused
          workCellPlainText
          workOrderPlainText
        }
      }
    }
  }
`;

function normalizeEntry(record) {
  const categoryCode = (record.category || 'OT').toUpperCase();
  const category = CATEGORY_LABELS[categoryCode] || CATEGORY_LABELS.OT || 'Other';
  const timeIn = record.timeIn ? parseProshopTime(record.timeIn) : null;
  const timeOut = record.timeOut ? parseProshopTime(record.timeOut) : null;
  const pauseTime = Number(record.totalTimePaused) || 0;
  const laborTime = computeLaborTime(record.timeIn, record.timeOut, pauseTime);
  const percentLaborTime = record.percentTime != null ? record.percentTime : null;
  const percentResourceTime = record.percentWorkCellTime != null ? record.percentWorkCellTime : null;
  return {
    id: record.id,
    category,
    categoryCode,
    workOrderNumber: record.workOrderPlainText || null,
    operationNumber: record.operationNumber || null,
    workCell: record.workCellPlainText || null,
    timeIn,
    timeOut,
    percentLaborTime,
    percentResourceTime,
    pauseTime,
    laborTime,
    spentDoing: record.spentDoing || null,
    status: record.status || null,
  };
}

async function fetchUserTimeTracking(token, userId, range) {
  const filter = {
    timeIn: {
      greaterThanOrEqual: range.startISO,
      lessThanOrEqual: range.endISO,
    },
  };
  const pageSize = 100;
  let pageStart = 0;
  const allRecords = [];
  let totalRecords = 0;
  do {
    const data = await executeGraphQLQuery(
      TIME_TRACKING_QUERY,
      { userId, pageSize, pageStart, filter },
      token
    );
    const user = data?.user;
    if (!user) throw new Error('No user in response');
    const tt = user.timeTracking;
    if (!tt || !tt.records) break;
    allRecords.push(...tt.records);
    totalRecords = tt.totalRecords ?? 0;
    pageStart += tt.records.length;
  } while (allRecords.length < totalRecords && pageStart < totalRecords);
  // Dedupe by id in case Proshop pagination returns same page (would inflate hours)
  const byId = new Map();
  for (const r of allRecords) {
    if (r.id) {
      if (!byId.has(r.id)) byId.set(r.id, r);
    } else {
      byId.set(`anon-${byId.size}`, r);
    }
  }
  const uniqueRecords = Array.from(byId.values());
  return uniqueRecords.map(normalizeEntry);
}

/**
 * Build time-tracking-by-date response (shared for route and cache warming).
 */
async function buildTimeTrackingResponse(dateStr, userIdFilter = null) {
  const range = toESTRange(dateStr);
  const token = await getProshopToken();
  const usersToFetch = userIdFilter
    ? TRACKED_USERS.filter((u) => u.proshopId === userIdFilter)
    : TRACKED_USERS;

  const results = await Promise.all(
    usersToFetch.map(async (u) => {
      try {
        const entries = await fetchUserTimeTracking(token, u.proshopId, range);
        const totalLaborTime = entries.reduce(
          (sum, e) => sum + (e.laborTime != null ? e.laborTime : 0),
          0
        );
        return {
          userId: u.proshopId,
          firstName: u.firstName,
          lastName: u.lastName,
          displayName: `${u.firstName} ${u.lastName}`,
          totalEntries: entries.length,
          totalLaborTime: Math.round(totalLaborTime * 100) / 100,
          error: null,
          entries,
        };
      } catch (err) {
        return {
          userId: u.proshopId,
          firstName: u.firstName,
          lastName: u.lastName,
          displayName: `${u.firstName} ${u.lastName}`,
          totalEntries: 0,
          totalLaborTime: 0,
          error: err.message || 'Failed to fetch',
          entries: [],
        };
      }
    })
  );

  return {
    success: true,
    data: {
      date: dateStr,
      users: results,
    },
  };
}

/**
 * Build time-tracking-by-range response (startDate + endDate, optional userId).
 */
async function buildTimeTrackingRangeResponse(startDateStr, endDateStr, userIdFilter = null) {
  const range = toESTRangeBetween(startDateStr, endDateStr);
  const token = await getProshopToken();
  const usersToFetch = userIdFilter
    ? TRACKED_USERS.filter((u) => u.proshopId === userIdFilter)
    : TRACKED_USERS;

  const results = await Promise.all(
    usersToFetch.map(async (u) => {
      try {
        const entries = await fetchUserTimeTracking(token, u.proshopId, range);
        const totalLaborTime = entries.reduce(
          (sum, e) => sum + (e.laborTime != null ? e.laborTime : 0),
          0
        );
        return {
          userId: u.proshopId,
          firstName: u.firstName,
          lastName: u.lastName,
          displayName: `${u.firstName} ${u.lastName}`,
          totalEntries: entries.length,
          totalLaborTime: Math.round(totalLaborTime * 100) / 100,
          error: null,
          entries,
        };
      } catch (err) {
        return {
          userId: u.proshopId,
          firstName: u.firstName,
          lastName: u.lastName,
          displayName: `${u.firstName} ${u.lastName}`,
          totalEntries: 0,
          totalLaborTime: 0,
          error: err.message || 'Failed to fetch',
          entries: [],
        };
      }
    })
  );

  return {
    success: true,
    data: {
      date: startDateStr,
      endDate: endDateStr,
      users: results,
    },
  };
}

export function warmTimeTrackingCache() {
  const dateStr = getESTDate();
  const cacheKey = `${dateStr}:all`;
  buildTimeTrackingResponse(dateStr, null)
    .then((response) => {
      timeTrackingCache[cacheKey] = { response, timestamp: Date.now() };
      setCache('time-tracking', { entries: { ...timeTrackingCache } });
      clearCacheError('time-tracking');
      cacheLog.info('time-tracking', 'Cache warmed for date:', dateStr);
    })
    .catch((err) => {
      cacheLog.error('time-tracking', 'Warm failed:', err.message || err);
      if (isProshopRateLimitError(err)) {
        setCacheError('time-tracking', { reason: 'rate_limited' });
      } else {
        setCacheError('time-tracking', { reason: 'error', message: err.message || String(err) });
      }
    });
}

/**
 * GET /api/proshop/time-tracking
 * Returns cached time tracking only (never calls ProShop). Background job refreshes cache.
 * Query params: date (YYYY-MM-DD) for single day, OR startDate + endDate for range; optional userId
 */
router.get('/', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const startDateStr = req.query.startDate || null;
  const endDateStr = req.query.endDate || null;
  const userIdFilter = req.query.userId || null;
  const isRange = startDateStr && endDateStr;

  if (isRange) {
    const cacheKey = `range:${startDateStr}:${endDateStr}:${userIdFilter || 'all'}`;
    const entries = getCacheData('time-tracking')?.entries;
    const cached = entries?.[cacheKey];
    if (cached?.response) return res.json(cached.response);
    if (getCacheError('time-tracking')?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
    return res.status(200).json({
      success: true,
      data: { date: startDateStr, endDate: endDateStr, users: [] },
    });
  }

  const dateStr = req.query.date || getESTDate();
  const cacheKey = `${dateStr}:${userIdFilter || 'all'}`;
  const entries = getCacheData('time-tracking')?.entries;
  const cached = entries?.[cacheKey];
  if (cached?.response) return res.json(cached.response);
  if (getCacheError('time-tracking')?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
  return res.status(200).json({
    success: true,
    data: { date: dateStr, users: [] },
  });
});

/**
 * Build latest-date response (shared for route and cache warming).
 */
async function buildLatestDateResponse() {
  const token = await getProshopToken();
  const today = getESTDate();
  const [y, m, d] = today.split('-').map(Number);

  for (let daysBack = 0; daysBack < 7; daysBack++) {
    const date = new Date(y, m - 1, d - daysBack);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const range = toESTRange(dateStr);
    let hasAny = false;
    for (const u of TRACKED_USERS) {
      try {
        const filter = {
          timeIn: {
            greaterThanOrEqual: range.startISO,
            lessThanOrEqual: range.endISO,
          },
        };
        const data = await executeGraphQLQuery(
          TIME_TRACKING_QUERY,
          { userId: u.proshopId, pageSize: 1, pageStart: 0, filter },
          token
        );
        const total = data?.user?.timeTracking?.totalRecords ?? 0;
        if (total > 0) {
          hasAny = true;
          break;
        }
      } catch (_) {
        // skip this user
      }
    }
    if (hasAny) {
      return { success: true, data: { date: dateStr } };
    }
  }

  return { success: true, data: { date: today } };
}

export function warmLatestDateCache() {
  buildLatestDateResponse()
    .then((response) => {
      setCache('time-tracking-latest-date', response);
      clearCacheError('time-tracking');
      cacheLog.info('time-tracking', 'Latest-date cache warmed');
    })
    .catch((err) => {
      cacheLog.error('time-tracking', 'Latest-date warm failed:', err.message || err);
      if (isProshopRateLimitError(err)) {
        setCacheError('time-tracking', { reason: 'rate_limited' });
      } else {
        setCacheError('time-tracking', { reason: 'error', message: err.message || String(err) });
      }
    });
}

/**
 * GET /api/proshop/time-tracking/latest-date
 * Returns cached latest-date only (never calls ProShop). Background job refreshes cache.
 */
router.get('/latest-date', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const cached = getCacheData('time-tracking-latest-date');
  if (cached) return res.json(cached);
  if (getCacheError('time-tracking')?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
  const today = getESTDate();
  return res.status(200).json({ success: true, data: { date: today } });
});

/**
 * Compute per-user stats from YTD entries (EST: fixed UTC-5).
 * todayStr: YYYY-MM-DD (today in EST).
 */
function computeUserStats(entries, todayStr) {
  const [y, m, d] = todayStr.split('-').map(Number);
  const year = y;
  const month = m;
  const quarter = Math.ceil(month / 3); // 1-4
  // Use noon UTC minus 5h for EST day-of-week so result is server-timezone independent (fixed UTC-5).
  const todayAtESTNoon = new Date(Date.UTC(year, m - 1, d, 12, 0, 0) - 5 * 60 * 60 * 1000);
  const jan1Str = `${year}-01-01`;
  // Average = total hours ÷ work weeks (Mon–Fri) so far this year.
  const weekdayCount = countWeekdaysEST(jan1Str, todayStr);
  const workWeeksYTD = Math.max(weekdayCount / 5, 0.2); // min 0.2 to avoid division by zero

  // This week: ISO week (Monday start). Monday of current week in EST.
  const dayOfWeek = todayAtESTNoon.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const mondayOffset = (dayOfWeek + 6) % 7;
  const weekStartAtEST = new Date(todayAtESTNoon);
  weekStartAtEST.setUTCDate(weekStartAtEST.getUTCDate() - mondayOffset);
  const weekStartStr = `${weekStartAtEST.getUTCFullYear()}-${String(weekStartAtEST.getUTCMonth() + 1).padStart(2, '0')}-${String(weekStartAtEST.getUTCDate()).padStart(2, '0')}`;

  const wosYear = new Set();
  const wosQuarter = new Set();
  const wosMonth = new Set();
  const wosWeek = new Set();
  const seenEntryIds = new Set(); // dedupe in case Proshop pagination returns same records
  let hoursThisWeek = 0;
  let totalHoursYTD = 0;

  for (const e of entries) {
    if (e.id && seenEntryIds.has(e.id)) continue;
    if (e.id) seenEntryIds.add(e.id);

    const estDate = getESTDateFromISO(e.timeIn);
    if (!estDate) continue;
    const labor = e.laborTime != null ? e.laborTime : 0;
    totalHoursYTD += labor;

    const [ey, em] = estDate.split('-').map(Number);
    const entryQuarter = Math.ceil(em / 3);

    if (ey === year) {
      if (e.workOrderNumber) wosYear.add(e.workOrderNumber);
      if (em === month) {
        if (e.workOrderNumber) wosMonth.add(e.workOrderNumber);
      }
      if (entryQuarter === quarter && e.workOrderNumber) wosQuarter.add(e.workOrderNumber);
    }
    if (estDate >= weekStartStr && estDate <= todayStr) {
      if (e.workOrderNumber) wosWeek.add(e.workOrderNumber);
      hoursThisWeek += labor;
    }
  }

  const averageWeeklyHoursYTD = totalHoursYTD / workWeeksYTD;

  return {
    uniqueWorkOrdersThisYear: wosYear.size,
    uniqueWorkOrdersThisQuarter: wosQuarter.size,
    uniqueWorkOrdersThisMonth: wosMonth.size,
    uniqueWorkOrdersThisWeek: wosWeek.size,
    hoursThisWeek: Math.round(hoursThisWeek * 100) / 100,
    totalHoursYTD: Math.round(totalHoursYTD * 100) / 100,
    averageWeeklyHoursYTD: Math.round(averageWeeklyHoursYTD * 100) / 100,
  };
}

/**
 * Build time-tracking stats response (shared for route and cache warming).
 */
async function buildStatsResponse() {
  const todayStr = getESTDate();
  const [y] = todayStr.split('-').map(Number);
  const startDateStr = `${y}-01-01`;
  const range = toESTRangeBetween(startDateStr, todayStr);
  const token = await getProshopToken();

  const results = await Promise.all(
    TRACKED_USERS.map(async (u) => {
      try {
        const entries = await fetchUserTimeTracking(token, u.proshopId, range);
        const stats = computeUserStats(entries, todayStr);
        return {
          userId: u.proshopId,
          firstName: u.firstName,
          lastName: u.lastName,
          displayName: `${u.firstName} ${u.lastName}`,
          ...stats,
          error: null,
        };
      } catch (err) {
        return {
          userId: u.proshopId,
          firstName: u.firstName,
          lastName: u.lastName,
          displayName: `${u.firstName} ${u.lastName}`,
          uniqueWorkOrdersThisYear: 0,
          uniqueWorkOrdersThisQuarter: 0,
          uniqueWorkOrdersThisMonth: 0,
          uniqueWorkOrdersThisWeek: 0,
          hoursThisWeek: 0,
          totalHoursYTD: 0,
          averageWeeklyHoursYTD: 0,
          error: err.message || 'Failed to fetch',
        };
      }
    })
  );

  return {
    success: true,
    data: { users: results },
  };
}

export function warmTimeTrackingStatsCache() {
  buildStatsResponse()
    .then((response) => {
      setCache('time-tracking-stats', response);
      clearCacheError('time-tracking');
      cacheLog.info('time-tracking', 'Stats cache warmed');
    })
    .catch((err) => {
      cacheLog.error('time-tracking', 'Stats warm failed:', err.message || err);
      if (isProshopRateLimitError(err)) {
        setCacheError('time-tracking', { reason: 'rate_limited' });
      } else {
        setCacheError('time-tracking', { reason: 'error', message: err.message || String(err) });
      }
    });
}

/**
 * GET /api/proshop/time-tracking/stats
 * Returns cached time-tracking stats only (never calls ProShop). Background job refreshes cache.
 */
router.get('/stats', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const cached = getCacheData('time-tracking-stats');
  if (cached) return res.json(cached);
  if (getCacheError('time-tracking')?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
  return res.status(200).json({ success: true, data: { users: [] } });
});

export default router;
