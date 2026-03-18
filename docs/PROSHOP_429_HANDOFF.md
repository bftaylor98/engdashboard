# ProShop 429 / NCR Page Spinning – Handoff Description

## 1. What’s happening (symptoms)

- **NCR (Non-Conformances) page** (and likely other ProShop-backed pages) often **spin and never load** or load only after a long time.
- **Server logs** show **429 Too Many Requests** from ProShop (`est.adionsystems.com`). ProShop returns an HTML “Too Many Requests” page that says “Your request is being processed. Please do not refresh this page.” and sometimes **400** as well.
- When 429/400 happen, the **frontend keeps loading** because the API either fails or never returns usable data, so the NCR page (and similar pages) never get the data they need.

## 2. Root cause

- **ProShop is rate-limiting** the app. Too many requests are sent to ProShop in a short time, so ProShop responds with **429** (and sometimes **400**).
- ProShop is used for:
  - **NCR (non-conformance reports):** recent NCRs, last-24h, by-assignee (each can call `fetchAllNcrs`, which does a large GraphQL fetch).
  - **Time tracking:** today’s data, stats, latest date.
  - **Material status:** work-order material status (and per-PO lookups).
  - **Tooling expenses:** purchase orders for “Rocket Supply”.
  - **Open POs.**
- These are triggered by:
  - **Server startup:** staggered cache warming (stock grid, tooling, open POs, shared NCR, material status, time-tracking, latest date, time-tracking stats, **machines**) with 5s between each.
  - **Periodic refresh:** same warming sequence runs on an interval; machines cache has its own interval (see `server/index.js`).
  - **User traffic:** opening Dashboard, NCR page, Schedule, Analytics, TV, etc., each of which can trigger one or more ProShop-backed API calls (and sometimes multiple internal ProShop calls, e.g. material status for many POs).
- Even with staggering, **total volume** or **bursts from user traffic** can still push ProShop over its limit, so 429s continue and the NCR page (and others) spin when their ProShop-dependent requests fail or hang.

## 3. What’s already been done (for context)

- **Staggered cache warming** in `server/index.js`: ProShop-related warms run one after another with 5s delay (`PROSHOP_WARM_DELAY_MS = 5000`). Stock grid runs first (no ProShop); then tooling, open POs, NCR recent, NCR last24h, NCR by-assignee, material status, time-tracking caches.
- **TV route** in `server/routes/tv.js`: the three ProShop helpers (NCR count last 30 days, tooling current month, material arrived count) are called **sequentially with 1.5s delay** between each instead of in parallel.
- **ProShop client** in `server/lib/proshopClient.js`: on **429**, retry delay was increased to **12s** (`RETRY_DELAY_429_MS`); `beginsession` errors set `err.status` so 429 gets that longer backoff. **4xx (except 429)** do not retry.
- **Verbose NCR logging** in `server/routes/proshop.js`: the repeated “NCRs first record keys” / “NCRs totalRecords” / “NCRs first createdTime” logs were removed to reduce log noise.
- **Frontend API client** in `src/services/api.ts`: a **25s timeout** was added for `fetchJSON` so the app doesn’t spin forever when the backend doesn’t respond; the user sees an error instead.
- **Dashboard** in `src/pages/Dashboard.tsx`: initial load error is shown (e.g. timeout or “Failed to load dashboard”) when the first stats request fails.

Despite this, **429s still occur** and the **NCR page (and likely other ProShop-backed pages) still spin** when their ProShop-dependent requests are rate-limited or fail.

## 4. Architecture / where ProShop is used

- **Backend:** Node/Express in `server/`. ProShop is called from:
  - `server/lib/proshopClient.js`: `getProshopToken()` (POST to ProShop `/api/beginsession`), `executeGraphQLQuery()` (POST to ProShop `/api/graphql`). Used by proshop and time-tracking routes.
  - `server/routes/proshop.js`: NCR (recent, last24h, by-assignee), material status, tooling expenses, open POs, etc. Many of these call `getProshopToken()` then one or more GraphQL requests; material status can trigger **many** GraphQL calls (e.g. per work order or per PO).
  - `server/routes/timeTracking.js`: time-tracking data and stats (ProShop).
  - `server/routes/tv.js`: calls `getNcrCountLast30Days()`, `getToolingExpensesCurrentMonth()`, `getMaterialArrivedCount(db)` (all in proshop.js); these are already sequential with 1.5s delay.
- **Frontend:** React app. The **NCR page** is `src/pages/NonConformances.tsx`; it loads data via API calls that ultimately hit the ProShop-backed endpoints (e.g. NCR by-assignee, recent, last24h). If those return 429/400 or hang, the page keeps spinning.
- **Caching:** ProShop routes use in-memory caches (e.g. NCR by-assignee, recent, last24h, material status, tooling expenses) with TTLs (e.g. 5 minutes). When cache is cold or expired, the next request triggers ProShop; if many caches are cold at once or traffic is high, that can cause bursts and 429s.

## 5. What likely still needs to be done

- **Reduce ProShop request volume and burst size**
  - **Single token/session reuse:** Reuse one ProShop token for multiple requests instead of calling `getProshopToken()` for every logical operation (if not already shared).
  - **Throttle or queue ProShop calls:** Limit concurrency (e.g. one or two ProShop requests at a time app-wide) or queue ProShop calls and drain them with a delay so ProShop never sees a large burst.
  - **Reduce NCR fetches:** `fetchAllNcrs` is heavy (e.g. 621 records). It’s used by NCR recent, last24h, by-assignee, and TV NCR count. Consider:
    - One shared “fetch all NCRs” result that is cached and then filtered/sliced for recent, last24h, by-assignee, and TV 30-day count, instead of calling `fetchAllNcrs` separately for each.
    - Or less frequent / longer TTL for NCR caches to reduce how often we hit ProShop.
  - **Material status:** This flow can issue many GraphQL requests (e.g. per PO). Batching or reducing the number of calls (or caching more aggressively) would help avoid 429s.
- **Better behavior when ProShop returns 429/400**
  - **NCR page (and similar):** If the NCR API returns 429/400, the frontend should **stop spinning** and show a clear message (e.g. “ProShop rate limit – try again in a minute” or “Data temporarily unavailable”) and optionally a retry button. Right now the page can spin because the request may hang, fail without clearing loading state, or the UI may not handle error state.
  - **Backend:** Ensure ProShop-backed routes **always respond** to the client (e.g. 503 or 200 with an error payload) when ProShop returns 429/400, so the frontend can show an error instead of spinning.
- **Optional: respect Retry-After**  
  If ProShop sends a `Retry-After` header with 429, the backend could wait that long before retrying and/or surface “retry after X seconds” to the user.

## 6. Relevant files (for another agent)

- **ProShop client (auth, GraphQL, retries):** `server/lib/proshopClient.js`
- **ProShop routes (NCR, material status, tooling, POs):** `server/routes/proshop.js`  
  - NCR: e.g. `fetchAllNcrs`, `getNcrCountLast30Days`, routes for recent, last24h, by-assignee.  
  - Material status: `buildMaterialStatusResponse`, `getMaterialArrivedCount`.  
  - Tooling: `buildToolingExpensesResponse`, `getToolingExpensesCurrentMonth`.
- **ProShop queries reference:** `PROSHOP_QUERIES_BRAIN.txt` / `PROSHOP_QUERIES_BRAIN.md` – all routes, GraphQL operations, caching; `PROSHOP_API_BRAIN.txt` – auth and schema.
- **Cache warming (staggered):** `server/index.js` – `runProshopWarmsSequentially()`, `PROSHOP_WARM_DELAY_MS`, interval refresh. Machines: `server/routes/machines.js` – `warmMachinesCache()`.
- **TV route (sequential ProShop calls):** `server/routes/tv.js` – NCR count, tooling month, material arrived.
- **Time tracking (ProShop):** `server/routes/timeTracking.js`
- **NCR page (spinning when data doesn’t load):** `src/pages/NonConformances.tsx` – loading/error state and API usage.
- **API client (timeout):** `src/services/api.ts` – `fetchJSON` timeout.

## 7. Short summary for handoff

**Issue:** ProShop rate-limits the app (429 Too Many Requests), so ProShop-backed data often doesn’t load. The NCR page (and likely others) spin because requests fail or hang and the UI doesn’t reliably show an error.

**Already done:** Staggered cache warming (5s between warms), TV ProShop calls made sequential with 1.5s delay, 12s retry delay on 429 in ProShop client, 25s timeout and error display on dashboard load, verbose NCR logs removed.

**Still needed:** Further reduce ProShop request volume and burst (shared NCR fetch/cache, throttling/queue, fewer material-status calls); ensure NCR (and similar) pages stop spinning and show a clear error when ProShop returns 429/400; ensure backend always returns a proper response to the client when ProShop fails so the frontend can show “rate limited / try again” instead of infinite loading.
