/**
 * Scratch script to verify ESPN API data before changing the app.
 * Run: node scripts/test-espn-scores.mjs
 * See .cursor/commands/api-process.md
 */

const EASTERN_TZ = 'America/New_York';
const SCOREBOARD_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const KENTUCKY_SCHEDULE_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/96/schedule';

function getTodayEasternYYYYMMDD() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}${m}${d}`;
}

/** Event date (ISO string) to Eastern YYYYMMDD */
function eventDateToEasternYYYYMMDD(isoDate) {
  const d = new Date(isoDate);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: EASTERN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}${m}${day}`;
}

async function main() {
  const today = getTodayEasternYYYYMMDD();
  console.log('=== ESPN Scores API test ===');
  console.log('Eastern today (YYYYMMDD):', today);
  console.log('');

  // 1) Scoreboard
  console.log('1) Scoreboard');
  const scoreboardUrl = `${SCOREBOARD_BASE}?dates=${today}`;
  console.log('   GET', scoreboardUrl);
  const boardRes = await fetch(scoreboardUrl);
  if (!boardRes.ok) {
    console.log('   Response:', boardRes.status, boardRes.statusText);
  } else {
    const board = await boardRes.json();
    const events = board?.events ?? [];
    const day = board?.day?.date ?? '?';
    console.log('   day.date:', day);
    console.log('   events.length:', events.length);
    if (events.length > 0) {
      events.forEach((e, i) => {
        const comp = e.competitions?.[0];
        const teams = (comp?.competitors ?? []).map((c) => c.team?.abbreviation ?? '?').join(' vs ');
        console.log(`   event[${i}]:`, e.shortName ?? e.name, '| abbrevs:', teams);
      });
      const hasUK = events.some((e) => {
        const comp = e.competitions?.[0];
        const abbrevs = new Set((comp?.competitors ?? []).map((c) => (c.team?.abbreviation || '').toUpperCase()));
        return (abbrevs.has('UK') || abbrevs.has('KY')) && abbrevs.has('LSU');
      });
      console.log('   Contains UK/KY vs LSU?', hasUK);
    }
  }
  console.log('');

  // 2) Kentucky schedule (season 2025 = 2024-25)
  console.log('2) Kentucky schedule (team 96)');
  for (const season of [2025, 2026]) {
    const scheduleUrl = `${KENTUCKY_SCHEDULE_BASE}?season=${season}`;
    console.log('   GET', scheduleUrl);
    const schedRes = await fetch(scheduleUrl);
    if (!schedRes.ok) {
      console.log('   Response:', schedRes.status, schedRes.statusText);
      continue;
    }
    const sched = await schedRes.json();
    const events = sched?.events ?? [];
    console.log('   events.length:', events.length);

    const todayEvents = events.filter((e) => eventDateToEasternYYYYMMDD(e.date) === today);
    console.log('   events on Eastern today:', todayEvents.length);

    const ukVsLsu = todayEvents.filter((e) => {
      const comp = e.competitions?.[0];
      const abbrevs = new Set((comp?.competitors ?? []).map((c) => (c.team?.abbreviation || '').toUpperCase()));
      return (abbrevs.has('UK') || abbrevs.has('KY')) && abbrevs.has('LSU');
    });

    if (ukVsLsu.length > 0) {
      console.log('   Found UK vs LSU today:', ukVsLsu.length);
      const ev = ukVsLsu[0];
      const comp = ev.competitions?.[0];
      const away = comp?.competitors?.find((c) => c.homeAway === 'away');
      const home = comp?.competitors?.find((c) => c.homeAway === 'home');
      console.log('   Sample event:');
      console.log('     id:', ev.id);
      console.log('     date:', ev.date);
      console.log('     name:', ev.name);
      console.log('     away:', away?.team?.abbreviation, away?.team?.displayName, 'score:', away?.score?.displayValue ?? '—');
      console.log('     home:', home?.team?.abbreviation, home?.team?.displayName, 'score:', home?.score?.displayValue ?? '—');
      console.log('     status:', comp?.status?.type?.state, comp?.status?.type?.description ?? '');
    }
    console.log('');
  }

  console.log('=== End test ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
