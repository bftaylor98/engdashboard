import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

const ESPN_SCOREBOARD_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard';
const KENTUCKY_SCHEDULE_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams/96/schedule';
const ESPN_SUMMARY_BASE =
  'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary';
const POLL_INTERVAL_MS = 60 * 1000;
const EASTERN_TZ = 'America/New_York';

/** Today's date in Eastern as YYYYMMDD for ESPN scoreboard */
function getTodayEasternYYYYMMDD(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: EASTERN_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}${m}${d}`;
}

/** Event date (ISO) to Eastern YYYYMMDD for filtering "today" */
function eventDateToEasternYYYYMMDD(isoDate: string): string {
  try {
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
  } catch {
    return '';
  }
}

/** Format event date as tip time in Eastern (e.g. "12:30 PM ET"). Uses Eastern timezone so TV and PC show the same time. */
function formatTipTimeEt(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    const timeStr = new Intl.DateTimeFormat('en-US', {
      timeZone: EASTERN_TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
    return `${timeStr} ET`;
  } catch {
    return 'TBD';
  }
}

interface GameTeam {
  name: string;
  shortName: string;
  logo: string | null;
  score: string;
}

interface GameState {
  away: GameTeam;
  home: GameTeam;
  status: 'pre' | 'in' | 'post';
  statusLabel: string;
  displayClock: string;
  period: number;
  tipTimeEt: string | null;
}

/** Match UK or KY for Kentucky; teamAbbrevs is e.g. ['UK', 'LSU'] */
const KENTUCKY_ABBREVS = new Set(['UK', 'KY']);

function findMatchingGame(
  events: Array<{
    date: string;
    competitions?: Array<{
      competitors?: Array<{
        homeAway: string;
        score?: string;
        team?: { abbreviation?: string; displayName?: string; shortDisplayName?: string; logo?: string };
      }>;
      status?: {
        type?: { state?: string; description?: string };
        displayClock?: string;
        period?: number;
      };
    }>;
  }>,
  teamAbbrevs: [string, string]
): GameState | null {
  const want0 = teamAbbrevs[0].toUpperCase();
  const want1 = teamAbbrevs[1].toUpperCase();
  const isKentuckyVs = KENTUCKY_ABBREVS.has(want0) && want1 === 'LSU';

  for (const event of events || []) {
    const comp = event.competitions?.[0];
    const competitors = comp?.competitors || [];
    if (competitors.length !== 2) continue;
    const abbrevs = new Set(competitors.map((c) => (c.team?.abbreviation || '').toUpperCase()));
    if (abbrevs.size !== 2) continue;
    const [a, b] = [...abbrevs];
    const matches =
      (a === want0 && b === want1) ||
      (a === want1 && b === want0) ||
      (isKentuckyVs && ((KENTUCKY_ABBREVS.has(a) && b === 'LSU') || (KENTUCKY_ABBREVS.has(b) && a === 'LSU')));
    if (!matches) continue;

    const away = competitors.find((c) => c.homeAway === 'away');
    const home = competitors.find((c) => c.homeAway === 'home');
    if (!away?.team || !home?.team) continue;

    const status = comp.status?.type?.state ?? 'pre';
    const period = comp.status?.period ?? 0;
    const displayClock = comp.status?.displayClock ?? '';

    const statusLabel =
      status === 'pre'
        ? 'Pre-game'
        : status === 'post'
          ? (comp.status?.type?.description ?? 'Final')
          : `${displayClock || '—'} · ${period === 1 ? '1st' : period === 2 ? '2nd' : `${period}`}`;

    return {
      away: {
        name: away.team.displayName ?? away.team.shortDisplayName ?? '—',
        shortName: away.team.shortDisplayName ?? away.team.displayName ?? '—',
        logo: away.team.logo ?? null,
        score: String(away.score ?? 0),
      },
      home: {
        name: home.team.displayName ?? home.team.shortDisplayName ?? '—',
        shortName: home.team.shortDisplayName ?? home.team.displayName ?? '—',
        logo: home.team.logo ?? null,
        score: String(home.score ?? 0),
      },
      status: status === 'pre' ? 'pre' : status === 'post' ? 'post' : 'in',
      statusLabel,
      displayClock,
      period,
      tipTimeEt: status === 'pre' ? formatTipTimeEt(event.date) : null,
    };
  }
  return null;
}

/** Schedule API competitor (score may be { displayValue } or undefined) */
type ScheduleCompetitor = {
  homeAway: string;
  score?: string | { displayValue?: string };
  team?: {
    abbreviation?: string;
    displayName?: string;
    shortDisplayName?: string;
    logo?: string;
    logos?: Array<{ href?: string }>;
  };
};

/** Map a schedule API event (UK vs LSU) to GameState */
function scheduleEventToGameState(
  event: {
    date: string;
    competitions?: Array<{
      competitors?: ScheduleCompetitor[];
      status?: {
        type?: { state?: string; description?: string };
        displayClock?: string;
        period?: number;
      };
    }>;
  }
): GameState | null {
  const comp = event.competitions?.[0];
  const competitors = comp?.competitors ?? [];
  if (competitors.length !== 2) return null;
  const away = competitors.find((c) => c.homeAway === 'away');
  const home = competitors.find((c) => c.homeAway === 'home');
  if (!away?.team || !home?.team) return null;

  const scoreStr = (c: ScheduleCompetitor): string => {
    const s = c.score;
    if (s == null) return '0';
    if (typeof s === 'number') return String(s);
    if (typeof s === 'string') return s;
    return s.displayValue ?? '0';
  };
  const logoUrl = (c: ScheduleCompetitor): string | null => {
    const t = c.team;
    if (t?.logo) return t.logo;
    const href = t?.logos?.[0]?.href;
    return href ?? null;
  };

  const status = comp.status?.type?.state ?? 'pre';
  const period = comp.status?.period ?? 0;
  const displayClock = comp.status?.displayClock ?? '';
  const statusLabel =
    status === 'pre'
      ? 'Pre-game'
      : status === 'post'
        ? (comp.status?.type?.description ?? 'Final')
        : `${displayClock || '—'} · ${period === 1 ? '1st' : period === 2 ? '2nd' : `${period}`}`;

  return {
    away: {
      name: away.team.displayName ?? away.team.shortDisplayName ?? '—',
      shortName: away.team.shortDisplayName ?? away.team.displayName ?? '—',
      logo: logoUrl(away),
      score: scoreStr(away),
    },
    home: {
      name: home.team.displayName ?? home.team.shortDisplayName ?? '—',
      shortName: home.team.shortDisplayName ?? home.team.displayName ?? '—',
      logo: logoUrl(home),
      score: scoreStr(home),
    },
    status: status === 'pre' ? 'pre' : status === 'post' ? 'post' : 'in',
    statusLabel,
    displayClock,
    period,
    tipTimeEt: status === 'pre' ? formatTipTimeEt(event.date) : null,
  };
}

/** Fetch Kentucky schedule for a season and return today's UK vs LSU game if any, plus eventId for live score lookup */
async function fetchKentuckyScheduleFallback(
  todayEastern: string,
  teamAbbrevs: [string, string]
): Promise<{ game: GameState | null; eventId: string | null }> {
  const want0 = teamAbbrevs[0].toUpperCase();
  const want1 = teamAbbrevs[1].toUpperCase();
  const isKentuckyVsLsu =
    KENTUCKY_ABBREVS.has(want0) && want1 === 'LSU';

  for (const season of [2025, 2026]) {
    const url = `${KENTUCKY_SCHEDULE_BASE}?season=${season}`;
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) continue;
    const data = await res.json();
    const events: Array<{ id?: string; date: string; competitions?: unknown[] }> = data?.events ?? [];
    const todayEvents = events.filter((e) => eventDateToEasternYYYYMMDD(e.date) === todayEastern);
    for (const ev of todayEvents) {
      const comp = ev.competitions?.[0] as { competitors?: ScheduleCompetitor[] } | undefined;
      const competitors = comp?.competitors ?? [];
      if (competitors.length !== 2) continue;
      const abbrevs = new Set(competitors.map((c) => (c.team?.abbreviation || '').toUpperCase()));
      const hasKentucky = [...abbrevs].some((a) => KENTUCKY_ABBREVS.has(a));
      const hasLsu = abbrevs.has('LSU');
      if (isKentuckyVsLsu && hasKentucky && hasLsu) {
        const game = scheduleEventToGameState(ev);
        if (game) return { game, eventId: ev.id ?? null };
      }
    }
  }
  return { game: null, eventId: null };
}

/** Fetch live score from ESPN event summary (header.competitions[0].competitors) and merge into game */
async function fetchLiveScoreFromSummary(eventId: string): Promise<{ awayScore: string; homeScore: string } | null> {
  try {
    const res = await fetch(`${ESPN_SUMMARY_BASE}?event=${eventId}`, { credentials: 'omit' });
    if (!res.ok) return null;
    const data = await res.json();
    const competitors = data?.header?.competitions?.[0]?.competitors;
    if (!Array.isArray(competitors) || competitors.length !== 2) return null;
    const away = competitors.find((c: { homeAway?: string }) => c.homeAway === 'away');
    const home = competitors.find((c: { homeAway?: string }) => c.homeAway === 'home');
    if (!away || !home) return null;
    return {
      awayScore: String(away.score ?? 0),
      homeScore: String(home.score ?? 0),
    };
  } catch {
    return null;
  }
}

interface BasketballScoreWidgetProps {
  /** Team abbreviations to filter for (e.g. UK vs LSU). Default: Kentucky vs LSU. */
  teamAbbrevs?: [string, string];
}

export default function BasketballScoreWidget({ teamAbbrevs = ['UK', 'LSU'] }: BasketballScoreWidgetProps) {
  const [game, setGame] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchScore = useCallback(async () => {
    try {
      const dates = getTodayEasternYYYYMMDD();
      // 1) Try scoreboard (Eastern today, then default)
      const urls = [
        `${ESPN_SCOREBOARD_BASE}?dates=${dates}`,
        ESPN_SCOREBOARD_BASE,
      ];
      let match: GameState | null = null;
      for (const url of urls) {
        const res = await fetch(url, { credentials: 'omit' });
        if (!res.ok) continue;
        const data = await res.json();
        const events = data?.events ?? [];
        match = findMatchingGame(events, teamAbbrevs);
        if (match) break;
      }
      // 2) If no match, try Kentucky team schedule (for UK vs LSU)
      let eventId: string | null = null;
      if (!match) {
        const fallback = await fetchKentuckyScheduleFallback(dates, teamAbbrevs);
        match = fallback.game;
        eventId = fallback.eventId;
      }
      // 3) When game is in progress and we have eventId (from schedule), get live score from summary API
      if (match && match.status === 'in' && eventId) {
        const live = await fetchLiveScoreFromSummary(eventId);
        if (live) {
          match = {
            ...match,
            away: { ...match.away, score: live.awayScore },
            home: { ...match.home, score: live.homeScore },
          };
        }
      }
      setGame(match);
      setError(match ? null : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
      setGame(null);
    } finally {
      setLoading(false);
    }
  }, [teamAbbrevs]);

  useEffect(() => {
    fetchScore();
    const id = setInterval(fetchScore, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchScore]);

  if (loading && !game) {
    return (
      <div className="rounded-xl bg-zinc-900/80 border border-white/10 p-6 flex items-center justify-center min-h-[120px]">
        <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-zinc-900/80 border border-white/10 p-4 flex flex-col justify-center min-h-[100px]">
        <p className="text-sm text-zinc-400">Scores</p>
        <p className="text-zinc-500 text-sm mt-1">{error}</p>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="rounded-xl bg-zinc-900/80 border border-white/10 p-4 flex flex-col justify-center min-h-[100px]">
        <p className="text-sm text-zinc-400">Scores</p>
        <p className="text-zinc-500 text-sm mt-1">No game today</p>
      </div>
    );
  }

  const TeamLogo = ({ team }: { team: GameTeam }) =>
    team.logo ? (
      <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center shrink-0 overflow-hidden">
        <img
          src={team.logo}
          alt=""
          className="w-11 h-11 object-contain"
          referrerPolicy="no-referrer"
          loading="eager"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      </div>
    ) : (
      <div className="w-12 h-12 rounded-lg bg-zinc-700 shrink-0 flex items-center justify-center text-sm font-bold text-zinc-400">
        {team.shortName.slice(0, 2)}
      </div>
    );

  return (
    <div className="rounded-xl bg-zinc-900/80 border border-white/10 p-4 flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-center flex-1 min-h-0">
        {/* Away: logo + name */}
        <div className="flex flex-col items-center gap-1 w-20 shrink-0">
          <TeamLogo team={game.away} />
          <span className="text-white font-semibold text-sm truncate w-full text-center" title={game.away.name}>
            {game.away.shortName}
          </span>
        </div>
        {/* Score line: away score – home score, all same font, spaced with em dashes */}
        <div className="flex items-center justify-center mx-4 shrink-0" style={{ gap: '0.5em' }}>
          <span className="text-4xl md:text-5xl font-bold text-white tabular-nums text-right" style={{ minWidth: '1.5em' }}>
            {game.away.score}
          </span>
          <span className="text-4xl md:text-5xl font-bold text-zinc-500 tabular-nums">
            –
          </span>
          <span className="text-4xl md:text-5xl font-bold text-white tabular-nums text-left" style={{ minWidth: '1.5em' }}>
            {game.home.score}
          </span>
        </div>
        {/* Home: logo + name */}
        <div className="flex flex-col items-center gap-1 w-20 shrink-0">
          <TeamLogo team={game.home} />
          <span className="text-white font-semibold text-sm truncate w-full text-center" title={game.home.name}>
            {game.home.shortName}
          </span>
        </div>
      </div>
      <div className="text-center text-sm text-zinc-400 mt-2 pt-2 border-t border-white/10">
        {game.status === 'pre' && game.tipTimeEt
          ? `Tip ${game.tipTimeEt}`
          : game.statusLabel}
      </div>
    </div>
  );
}
