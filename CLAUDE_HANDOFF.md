# Claude Handoff — Engineering Schedule Dashboard

> This file exists to give Claude full context on the codebase, what's been done, what's broken, and what's next. Brad should paste the contents of this file (or upload it) at the start of any new Claude chat about this project.

## Project Overview

Engineering Schedule Dashboard v4.3.0 — an intranet app for EST Tool and Machine (Brodhead, KY). Tracks engineering work orders, machine queues, time tracking, tooling expenses, NCRs, material status, and more. Data comes from ProShop ERP (via GraphQL API), a LAN SQL Server (EST100 for stock/vending data), and a local SQLite database.

**Tech Stack:**
- Frontend: React 18, TypeScript, Vite, Tailwind CSS 3, Radix UI, Framer Motion, Recharts, Lucide icons, Sonner toasts
- Backend: Node/Express (ES modules), better-sqlite3 for local data, ProShop ERP via GraphQL, mssql for EST100 SQL Server
- Dev: `start-servers.bat` → PowerShell launcher → `concurrently` runs backend (port 3001) + Vite frontend (port 5173)

**GitHub:** https://github.com/bftaylor98/engdashboard  
**Branches:** `main` (current), `ui-modernization` (merged into main)

## File Structure

```
├── src/                          # React frontend
│   ├── App.tsx                   # Router, auth gates
│   ├── index.css                 # CSS variable token system, component classes, type scale
│   ├── components/
│   │   ├── Layout.tsx            # Sidebar nav + header shell
│   │   ├── WorkOrderDrawer.tsx   # Detail/edit drawer for work orders
│   │   ├── MaterialTrackingContent.tsx
│   │   └── widgets/              # TV dashboard widgets (BasketballScoreWidget, etc.)
│   ├── pages/                    # All route pages (~22 pages)
│   ├── contexts/                 # AuthContext, ThemeContext
│   ├── hooks/                    # useSSE (Server-Sent Events)
│   ├── lib/                      # utils.ts (cn, formatDate, color helpers, etc.)
│   ├── services/                 # api.ts (all frontend fetch calls)
│   ├── types/                    # index.ts (interfaces, constants, ASSIGNEES, STATUS_OPTIONS, etc.)
│   └── constants/                # tvWidgets.ts
├── server/
│   ├── index.js                  # Express server, middleware, route mounting, cache scheduler
│   ├── database/                 # init.js (SQLite schema), gitignored .db files
│   ├── lib/
│   │   ├── proshopClient.js      # ProShop auth, GraphQL execution, throttle queue (300ms gap)
│   │   ├── cacheStore.js         # Centralized in-memory cache (Map-based, get/set/error)
│   │   ├── cacheScheduler.js     # Job scheduler (independent intervals, waits for completion)
│   │   ├── cacheLogger.js        # Writes to logs/cache.log instead of console
│   │   ├── eventBus.js           # SSE event emitter
│   │   └── versionManager.js     # DB snapshot/restore
│   ├── middleware/
│   │   └── auth.js               # Bearer token validation, session lookup
│   ├── routes/
│   │   ├── proshop.js            # 2500+ lines — tooling expenses, material status, open POs, NCRs
│   │   ├── timeTracking.js       # Time tracking caches (per-user from ProShop)
│   │   ├── machines.js           # VMC machine queue data from ProShop
│   │   ├── stockGrid.js          # Matrix vending stock from EST100 SQL Server
│   │   ├── workOrders.js         # CRUD for local work orders (SQLite)
│   │   ├── knowledge.js          # Knowledge base articles (SQLite)
│   │   ├── auth.js               # Login, logout, preferences
│   │   └── ... (calendar, events, export, import, projects, stats, tv, versions)
│   └── test_*.js                 # One-off ProShop API test scripts
├── .env                          # Credentials (gitignored): PROSHOP_*, EST100_*
├── .env.example                  # Template for .env
├── logs/                         # cache.log (gitignored)
├── start-servers.bat             # Calls start-servers.ps1
├── start-servers.ps1             # PowerShell launcher with port cleanup
├── UI_MODERNIZATION_PLAN.md      # Completed UI refactor plan (10 phases)
├── CACHE_REFACTOR_PLAN.md        # Completed cache architecture plan (4 phases)
└── BRAIN.txt, *_BRAIN.txt        # Context/reference docs for Cursor
```

## What's Been Done

### UI Modernization (Complete)
- **CSS Token System**: Replaced ~500 lines of brittle `.light` class overrides with CSS custom properties. Both dark and light themes work via variable swapping in `:root` / `.light` blocks in `index.css`.
- **Tailwind Config**: Extended with token-based colors (`bg-primary`, `text-secondary`, etc.), border radius, shadows, transitions.
- **Type Scale**: `.text-display`, `.text-title`, `.text-heading`, `.text-body`, `.text-caption`, `.text-mono` classes in index.css.
- **All Pages Migrated**: Every page and component migrated from hardcoded `bg-zinc-*`/`text-zinc-*` to CSS variable classes. Only 12 old-style references remain in `BasketballScoreWidget.tsx` (TV-only, dark-mode-only — intentionally left).
- **Shared Dropdown Styles**: `.dropdown-menu`, `.dropdown-item` classes with entrance animations.
- **Page Transitions**: CSS `page-enter` animation on `<main>` keyed to `location.pathname`.
- **Sidebar**: UniFi-style with left accent bar for active state.

### Cache Architecture Refactor (Complete)
- **cacheLogger.js**: All cache warming logs write to `logs/cache.log` instead of console. `CACHE_LOG_CONSOLE=1` env var to also print to console for debugging.
- **cacheStore.js**: Centralized `Map`-based store. `setCache(key, data)`, `getCacheData(key)`, `setCacheError(key, error)`, `getCacheStatus()`. All module-level `let xxxCache = null` variables removed from route files.
- **cacheScheduler.js**: `registerJob(name, fn, { intervalMs, initialDelayMs })`. Each job waits for completion before scheduling next run. `getSchedulerStatus()` for debug endpoint.
- **Debug Endpoint**: `GET /api/debug/caches` returns cache status + scheduler status (requires auth).
- **Graceful Shutdown**: `stopAll()` clears all timers on SIGINT/SIGTERM.
- **No more setInterval**: All replaced with completion-based setTimeout in the scheduler.

### Credential Cleanup (Complete)
- ProShop credentials (`proshopClient.js`) → `.env` via `process.env`
- EST100 SQL credentials (`stockGrid.js`) → `.env` via `process.env`
- Reference project files scrubbed of passwords
- `.env.example` has safe templates
- `dotenv/config` imported first in `server/index.js`

### Start Script (Complete)
- `start-servers.ps1` kills processes on ports 3001, 5173-5177 using `taskkill /F /PID /T` + `taskkill /F /IM node.exe /T` fallback
- Verifies all ports are clear before starting (5 retries with 1s waits)
- `try/finally` block cleans up on Ctrl+C exit
- `start-servers.bat` just calls the PowerShell script

## Known Issues / Open Items

### CRITICAL: Initial Cache Warm Needs Sequential Execution
**Status: NOT YET FIXED**

The cache scheduler launches all warm jobs independently on staggered delays (2s, 7s, 12s, 17s, 22s, 27s). But early ones aren't done when later ones start, causing 4-5 warm functions to all queue API calls through the ProShop throttle simultaneously. ProShop gets overwhelmed and returns 502 Bad Gateway / 504 Gateway Timeout errors.

**Fix needed:** The INITIAL warm (on server startup) should run sequentially — one cache fully completes before the next starts, with a 3-second gap. After all caches are populated, THEN register the recurring interval jobs. This is how the old code worked (`runProshopWarmsSequentially()`) and the new scheduler broke it.

The fix should be in `server/index.js`: create an `async function runInitialWarm()` that awaits each warm function in sequence, then calls `registerJob()` for ongoing refreshes after all initial warms complete.

### cacheLog.error() Still Prints to Console
The `cacheLogger.js` error method intentionally writes to both the log file AND stderr. When ProShop returns 502/504 errors, this spams the CLI. Consider removing the stderr write and making ALL cache logs file-only (console only when `CACHE_LOG_CONSOLE=1`).

### proshop.js is 2500+ Lines
This single route file handles tooling expenses, material status, open POs, NCRs, part lookups, and more. It works but is hard to maintain. A future refactor could split it into `routes/proshop/tooling.js`, `routes/proshop/material.js`, `routes/proshop/ncrs.js`, etc.

### Open POs Warm is Expensive
`buildOpenPOsResponse()` fetches ALL purchase orders (paginated, up to 20 pages), filters for Rocket Supply, then fires an individual detail query for EACH open PO. With N open POs, that's `(pages) + N` API calls. Could be optimized if ProShop's GraphQL supports supplier filtering.

### Session Cleanup
Expired sessions are only deleted when someone tries to use an expired token. No background cleanup. A simple `DELETE FROM sessions WHERE expires_at < datetime('now')` on an interval would prevent table growth.

### BasketballScoreWidget Still Uses Old Zinc Classes
12 old-style class references in `src/components/widgets/BasketballScoreWidget.tsx`. Intentionally left since it's a TV-only dark-mode widget, but could be cleaned up for consistency.

## Architecture Patterns to Preserve

1. **Routes NEVER call ProShop directly.** All ProShop data is served from in-memory caches. Warm functions run in the background on intervals. This is critical for staying under ProShop's rate limits.

2. **The ProShop throttle queue** (`proshopClient.js`) serializes ALL API calls — one at a time, 300ms gap. Both `getProshopToken()` and `executeGraphQLQuery()` go through it. Never bypass this.

3. **CSS variables for theming.** All colors use `var(--bg-primary)`, `var(--text-secondary)`, etc. Never hardcode zinc/gray colors in components. The `.light` class on the root element swaps all variables automatically.

4. **Standing rule from Brad:** Never modify `server/lib/proshopClient.js` when working on UI features. Never modify ProShop cache logic when working on UI. Keep frontend and backend changes separate.

## Key Files to Read First

If you need to understand the app, read in this order:
1. `server/index.js` — server setup, route mounting, cache scheduling
2. `server/lib/proshopClient.js` — how ProShop API calls work (auth, throttle, retry)
3. `server/lib/cacheStore.js` — how cached data is stored and accessed
4. `server/lib/cacheScheduler.js` — how warm jobs are scheduled
5. `src/App.tsx` — frontend routing and auth flow
6. `src/components/Layout.tsx` — sidebar nav and page shell
7. `src/services/api.ts` — how the frontend fetches data
8. `src/index.css` — design token system and component classes
9. `src/types/index.ts` — all TypeScript interfaces and constants

## ProShop API Details

- **Base URL**: `https://est.adionsystems.com`
- **Auth**: POST `/api/beginsession` with username/password/scope → returns token
- **Data**: POST `/api/graphql` with Bearer token
- **Rate limits**: Aggressive. Returns 429 or 400 when exceeded. Token cached for 5 min. All calls throttled to 300ms gaps with retry logic (3 attempts, 12s wait on 429).
- **Schema**: Full GraphQL schema in `PS-API-Schema.gql` (792K). Readable summary in `PROSHOP_GRAPHQL_SCHEMA_READABLE.md` and `PROSHOP_GRAPHQL_REFERENCE.md`.

## Brad's Preferences

- Concise, casual responses — like talking to a knowledgeable friend
- No coding knowledge — can't debug or fix broken code himself. Uses Cursor for implementation.
- Windows only (W10/W11). PowerShell scripts, not bash.
- Prefers sequential Cursor agent runs with Git branches for isolation.
- For IT topics: moderately savvy (~5/10), skip basics but don't assume deep expertise.
