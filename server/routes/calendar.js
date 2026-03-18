import { Router } from 'express';
import ical from 'node-ical';

const router = Router();

const GOOGLE_CALENDAR_ID = 'm7djc00ldihm2f16d4vaenpopk@group.calendar.google.com';
const ICAL_URL = `https://calendar.google.com/calendar/ical/${encodeURIComponent(GOOGLE_CALENDAR_ID)}/public/basic.ics`;

const CACHE_MS = 3 * 60 * 1000; // 3 minutes
let cache = null;
let cacheTime = 0;

function parseQueryDate(str, fallback) {
  if (!str) return fallback;
  const d = new Date(str);
  return isNaN(d.getTime()) ? fallback : d;
}

function toDate(v) {
  return v instanceof Date ? v : new Date(v);
}

function eventToItem(ev, id) {
  const start = toDate(ev.start);
  const end = toDate(ev.end);
  const allDay = ev.dateOnly === true || (ev.start && ev.start.dateOnly);
  return {
    id,
    title: ev.summary || '(No title)',
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: !!allDay,
    description: ev.description || null,
  };
}

/**
 * Fetch and return calendar events between startDate and endDate (Date objects).
 * Uses shared iCal cache. Returns [] on error.
 */
export async function getEvents(startDate, endDate) {
  const now = new Date();
  try {
    let data = cache;
    if (!cache || now - cacheTime > CACHE_MS) {
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), 15000);
      try {
        data = await ical.async.fromURL(ICAL_URL, { signal: ac.signal });
      } finally {
        clearTimeout(timeout);
      }
      cache = data;
      cacheTime = now;
    }

    const events = [];
    for (const key of Object.keys(data)) {
      const ev = data[key];
      if (!ev || ev.type !== 'VEVENT') continue;
      if (ev.rrule) {
        const instances = ical.expandRecurringEvent(ev, { from: startDate, to: endDate });
        for (const inst of instances) {
          const instStart = toDate(inst.start);
          const instEnd = toDate(inst.end);
          if (instEnd < startDate || instStart > endDate) continue;
          events.push(eventToItem(inst, `${key}-${instStart.getTime()}`));
        }
      } else {
        const start = toDate(ev.start);
        const end = toDate(ev.end);
        if (end < startDate || start > endDate) continue;
        events.push(eventToItem(ev, ev.uid || key));
      }
    }

    events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
    return events;
  } catch (err) {
    console.error('[calendar] Failed to fetch or parse iCal:', err.message);
    return [];
  }
}

router.get('/events', async (req, res) => {
  const now = new Date();
  const startParam = req.query.start;
  const endParam = req.query.end;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const startDate = parseQueryDate(startParam, new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1));
  const endDate = parseQueryDate(endParam, new Date(monthEnd.getFullYear(), monthEnd.getMonth() + 2, 0, 23, 59, 59, 999));

  try {
    const events = await getEvents(startDate, endDate);
    res.json({ success: true, data: events });
  } catch (err) {
    console.error('[calendar] Failed to load calendar:', err.message);
    res.status(502).json({ success: false, error: 'Failed to load calendar' });
  }
});

export default router;
