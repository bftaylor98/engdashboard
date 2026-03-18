---
description: 
alwaysApply: true
---

# Start Here — For AI Agents & New Developers

**Purpose:** This repo is the **Engineering Schedule Dashboard**: a browser app for a manufacturing shop that tracks engineering work orders, schedules, material status, NCRs, time tracking, and integrates with ProShop ERP. Frontend: React (TypeScript) + Vite. Backend: Node.js + Express + SQLite. Real-time via SSE.

**Current version:** 4.3.0 (see `package.json`). Default branch for ongoing work: **bug-fix** (not `main`).

---

## 1. Run the project (no context needed)

```bash
npm install
npm run dev
```

- Backend: **http://localhost:3001**
- Frontend: **http://localhost:5173** (proxies `/api/*` to 3001)
- Login: any of `rob`, `damien`, `thad`, `alex`, `phillip`, `brad`, `mike`, `admin` with password **changeme**

Production: `npm run build` then `npm start` (serves from port 3001).

---

## 2. Reading order (pick up context quickly)

Read in this order so a new agent can work without prior context:

| Order | Document | What you get |
|-------|----------|--------------|
| 1 | **This file (AGENTS.md)** | Run commands, reading order, where things live |
| 2 | **README.md** | Overview, features, API list, project structure, version history |
| 3 | **ENGINEER_HANDOFF.txt** | Short summary: stack, repo layout, data model, API surface, known issues, useful file paths |
| 4 | **BRAIN.txt** | Deep reference: full project structure, schema, all API endpoints, auth, SSE, frontend routes, styling, design decisions |
| 5 | **docs/README.md** | Index of all other docs (ProShop, material tracking, NCR, etc.) |

Then, **by topic**:

- **ProShop API (auth, routes, GraphQL):** `PROSHOP_API_BRAIN.txt`, then `PROSHOP_QUERIES_BRAIN.txt` or `PROSHOP_QUERIES_BRAIN.md`
- **ProShop 429 rate limiting / NCR spinning:** `docs/PROSHOP_429_HANDOFF.md`
- **Material tracking (Schedule column, popover):** `docs/MATERIAL_TRACKING_DOCUMENTATION.md`
- **Changelog:** `CHANGELOG.md`

---

## 3. Where to find what

| If you need… | Look here |
|---------------|-----------|
| Run / build / install | This file (§1), README “Getting Started” |
| High-level summary | README “Overview”, ENGINEER_HANDOFF §1–2 |
| Full folder & file map | BRAIN.txt §3 (structure), ENGINEER_HANDOFF §2 |
| Database schema & migrations | BRAIN.txt §4, ENGINEER_HANDOFF §3.1, `server/database/init.js` |
| API endpoints (list) | README “API Endpoints”, BRAIN.txt §5, ENGINEER_HANDOFF §4 |
| ProShop routes & GraphQL | PROSHOP_QUERIES_BRAIN.txt (or .md), PROSHOP_API_BRAIN.txt |
| Auth (login, session, tokens) | BRAIN.txt §6, `server/middleware/auth.js`, `server/routes/auth.js` |
| Real-time (SSE) | BRAIN.txt §7, `server/lib/eventBus.js`, `server/routes/events.js`, `src/hooks/useSSE.ts` |
| Frontend routes & pages | BRAIN.txt §8 (ROUTING, LAYOUT), `src/App.tsx`, `src/components/Layout.tsx` |
| Work order CRUD & filters | `server/routes/workOrders.js`, `src/pages/Schedule.tsx`, `src/types/index.ts` |
| ProShop 429 / NCR issues | `docs/PROSHOP_429_HANDOFF.md`, `server/lib/proshopClient.js`, `server/routes/proshop.js` |
| Version snapshots (backup/restore) | BRAIN.txt, `server/lib/versionManager.js`, `server/routes/versions.js` |
| Import/export (Excel/CSV) | `server/routes/import.js`, `server/routes/export.js`, README “Import/Export” |

---

## 4. Conventions & gotchas

- **Branch:** Active work is on **bug-fix**. `main` may be behind; prefer working from bug-fix and merging when ready.
- **ESM:** Project uses ES modules (`"type": "module"` in package.json). Use `import`/`export`, not `require`.
- **Auth:** Almost all `/api/*` routes require a session token (Bearer or `?token=` for SSE/export). Only `/api/health`, `/api/auth/login`, and `/api/tv` are public.
- **ProShop:** Many features (NCR, material status, machines, tooling) call an external ProShop API. It can rate-limit (429). See `docs/PROSHOP_429_HANDOFF.md`.
- **DB:** SQLite at `database/engineering_schedule.db`. After schema changes or version restore, restart the server.
- **Config:** `customer_abb.csv` is loaded at startup; restart after editing.

---

## 5. Quick file map (backend ↔ frontend)

| Area | Backend | Frontend |
|------|---------|----------|
| Work orders | `server/routes/workOrders.js` | `src/pages/Schedule.tsx`, `src/pages/Dashboard.tsx` |
| ProShop (NCR, material, tooling, cost) | `server/routes/proshop.js`, `server/lib/proshopClient.js` | `src/pages/NonConformances.tsx`, Schedule material column, Analytics, `src/pages/CostAnalysis.tsx` |
| Machines (work center load) | `server/routes/machines.js` | `src/pages/Machines.tsx` |
| Auth | `server/routes/auth.js`, `server/middleware/auth.js` | `src/contexts/AuthContext.tsx` |
| API client | — | `src/services/api.ts` (all API calls, timeout, auth headers) |
| Types & constants | — | `src/types/index.ts` |

---

**Last updated:** 2026-03-11
