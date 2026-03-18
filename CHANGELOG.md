# Changelog

All notable changes to the Engineering Schedule Dashboard.

## [4.3.0] - 2026-03-11

### Documentation (onboarding for new agents)

- **AGENTS.md:** New “start here” doc for AI agents and new developers: run commands, reading order (README → ENGINEER_HANDOFF → BRAIN → docs/README), where-to-find-what table, conventions (branch bug-fix, ESM, auth, ProShop), quick backend↔frontend file map.
- **docs/README.md:** Documentation index: root-level docs, ProShop docs, feature-specific docs, other reference.
- **README.md:** “For AI agents & new developers” section at top linking to AGENTS.md and docs/README.md.
- **ENGINEER_HANDOFF.txt:** “New agent?” pointer to AGENTS.md; doc references updated to include AGENTS.md and docs/README.md.
- **BRAIN.txt:** Short “For a new agent” note at top pointing to AGENTS.md for reading order.

### Added

- **Machines page** (`/machines`): ProShop work center load for VMX 84-1, VMX 64-1, VMX 64-2; shows incomplete operations with remaining hours. Backend: `GET /api/machines` (cache-only), `server/routes/machines.js`; cache warmed on startup and on interval.
- **Cost Analysis page** (`/cost-analysis`): Per–work order material cost from DB plus estimated total minutes from ProShop ops (`totalCycleTime`). Backend: `GET /api/proshop/cost-analysis?woNumber=...`.

### Documentation

- **Proshop queries brain file:** Added `PROSHOP_QUERIES_BRAIN.txt` and `PROSHOP_QUERIES_BRAIN.md` documenting all `/api/proshop` routes, GraphQL operations used (workOrders, purchaseOrders, purchaseOrder, part, nonConformanceReports), per-route query details, pagination/limits, caching, and rate-limiting behavior. Use with `PROSHOP_API_BRAIN.txt` for auth and schema.
- **README:** Updated with Machines and Cost Analysis features and API endpoints; Proshop API section includes cost-analysis and machines; project structure and Last Updated 2026-03-11.
- **BRAIN.txt:** Updated to 4.3.0; project structure with Machines, Cost Analysis, machines route, versionManager, Proshop brain files; routes and nav; Last Updated 2026-03-11.
- **ENGINEER_HANDOFF.txt:** Updated with Machines and Cost Analysis in layout and API surface; version and date aligned.

---

## [4.2.0] - 2025-02-25

### Proshop import

- **Import only Engineering work center:** Import from Proshop now fetches Active work orders and keeps only those with at least one operation whose work center is ENGINEERING (via `ops(filter: { workCenter: ["ENGINEERING"] })`).
- **Part descriptions:** Part names are filled from Proshop by querying `Part(partNumber).partDescription` for each unique part after fetching work orders.
- **Part number formatting:**
  - Leading zeros removed from numeric segments (e.g. `SSP-0000541-NEW` → `SSP-541-NEW`, `0000541_NEW` → `541-NEW`).
  - Customer prefix is not duplicated when the part number already starts with that prefix (e.g. `AICHI-0000371` → `AICHI-371`, not `AICHI-AICHI-371`).
- **Work order notes vs engineering notes:** Proshop notes are stored in `work_order_notes` (shown only in the work order drawer). The schedule table Notes column is used for engineering internal notes only.
- **Notes cleanup:** HTML tags (e.g. `<p>`, `<b>`) are stripped from work order notes on import and when saving; notes are stored and displayed as plain text.
- **Work order notes in drawer:** Work order notes textarea in the drawer shows 10 lines and uses the stripped plain-text value.

### Other

- **Customer uniqueId lookup:** First-word and partial matching for customer names from `customer_abb.csv`; each missing customer is logged only once per process.
- **Login:** Safer handling of empty or non-JSON login responses with clearer error messages.

---

## [4.1.0] - (previous)

- Version management, Excel/CSV import/export, schedule and Kanban views, Proshop integration baseline, and related features.
