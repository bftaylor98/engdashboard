# Material Tracking — Documentation (Archived)

This document describes the **Material Tracking** feature that was formerly a standalone page in the dashboard. Its functionality has been **integrated into the Schedule page** (inline Material column and Material Due column). The standalone Material page has been removed from the navigation and routing but the code is preserved for reference.

---

## 1. Overview

### What it did

The Material Tracking feature showed **Proshop ERP material status** for work orders on the engineering schedule:

- **Status**: Not Ordered, Requested, Ordered, Arrived, Not Applicable (or Unknown)
- **Stock details** per WO: material, PO number, due at dock, received date, supplier, dimensions
- **BOM (Bill of Materials)** details when present: POs and line items
- Filtering by status, search by WO/part/customer, expandable rows for full details

Data was **live from the Proshop API** (not stored in the dashboard DB).

### Where it lives now

- **Schedule page** (`/schedule`): Each row has a **Material** column (Proshop status badge + info icon for details popover) and a **Material Due** column (first stock line’s Due at Dock).
- The same Proshop API and types power this inline experience.

---

## 2. Frontend (Where to Find Things)

### Pages

| File | Purpose |
|------|--------|
| `src/pages/MaterialTracking.tsx` | **Archived.** Former standalone “Material Tracking” page. Now a thin wrapper around `MaterialTrackingContent`. Not linked in the app; kept for reference. |
| `src/pages/Schedule.tsx` | **Active.** Renders the schedule table and fetches Proshop material; shows Material and Material Due columns and `ProshopMaterialCell` (badge + popover). |

### Components

| File | Purpose |
|------|--------|
| `src/components/MaterialTrackingContent.tsx` | Reusable full Material Tracking UI: status cards, search, filters, table with expandable rows. Used by `MaterialTracking.tsx`. Exports `MaterialStatusBadge` and `ProshopMaterialDetailPanel` for use in Schedule. |
| Schedule uses `ProshopMaterialCell` (defined in `Schedule.tsx`) which uses `MaterialStatusBadge` and `ProshopMaterialDetailPanel` from `MaterialTrackingContent`. |

### API (client)

| Function | File | Purpose |
|----------|------|--------|
| `getProshopMaterialStatus(woNumbers?: string)` | `src/services/api.ts` | Calls `GET /api/proshop/material-status`. Optional `woNumbers` = comma-separated WO list; if omitted, backend uses all non-completed WOs from DB. Returns `ProshopMaterialStatus[]`. |

### Types

All in `src/types/index.ts`:

- **`ProshopMaterialStatus`** — Per-WO material status: `workOrderNumber`, `materialStatus`, `stockDetails[]`, `bomOrdered`, `bomArrived`, `bomDetails`, `partNumber`, `customer`, `partstockNote`, etc.
- **`ProshopStockDetail`** — One stock line: `material`, `materialGrade`, `stockType`, `poNumber`, `dueAtDock`, `receivedDate`, `supplier`, `dimensions`, etc.
- **`ProshopBomDetails`** — `poNumbers[]`, `lines[]` (each line: `poNumber`, `description`, `partNumber`, `orderNumber`).
- **`ProshopBomLine`** — Single BOM line (same fields as above).

### Status values (Proshop)

`materialStatus` is one of:

- `not-ordered` — Needs to be ordered
- `requested` — Released/requested, not yet on a real PO
- `ordered` — On a PO
- `arrived` — Received / at dock
- `not-applicable` — No material needed (e.g. all stock is “/na”, no real BOM POs)
- `unknown` — Could not determine

---

## 3. Backend API

### Endpoint

- **`GET /api/proshop/material-status`**
- Optional query: `woNumbers` — comma-separated work order numbers. If omitted, the server uses all non-completed work orders from `engineering_work_orders`.

### Implementation

- **File:** `server/routes/proshop.js` (handler for `/material-status`).
- **Flow:**
  1. Resolve list of WO numbers (from query or DB: `current_status != 'completed'`).
  2. Call Proshop GraphQL for those WOs: work orders with `partStockStatuses`, `ops` → `billOfMaterials`.
  3. Collect all PO IDs from part stock and BOM; fetch each PO with `purchaseOrder(id)` to get `estimatedArrival` (Due at Dock) and `receivedDate` (and related fields).
  4. For each WO, build:
     - **stockDetails**: from `partStockStatuses` + PO data (due at dock, received date, etc.).
     - **materialStatus**: derived from WO status, stock received/PO state, and “released” vs real PO number logic.
     - **BOM**: from `ops` → `billOfMaterials`; `bomOrdered` / `bomArrived` from PO/line received state.
  5. Return JSON: `{ success: true, data: result }` where `result` is an array of objects matching `ProshopMaterialStatus`.

### Status derivation (server)

- WO status in completed list (e.g. Invoiced, Shipped, Complete, Closed) → `arrived`.
- Any stock line with `receivedDate` or `actualArrived` → `arrived`.
- Any stock line with a “real” PO number (numeric) → `ordered`.
- Stock line with “released”/“requested”-style text (no real PO) → `requested`.
- Otherwise if there are stock lines → `not-ordered`.
- If all stock is “/na” and no real BOM POs → `not-applicable`; else `unknown`.
- BOM can upgrade: e.g. `not-ordered` + BOM with POs → `ordered`; if BOM POs received → `arrived` and `bomArrived`.

---

## 4. How to Restore the Standalone Material Page (If Ever Needed)

1. **Route:** In `src/App.tsx`, add back:
   - `import MaterialTracking from '@/pages/MaterialTracking';`
   - `<Route path="/material-tracking" element={<MaterialTracking />} />`
2. **Nav:** In `src/components/Layout.tsx`, add back to `NAV_ITEMS`:
   - `{ path: '/material-tracking', label: 'Material', icon: Package }`
   - Ensure `Package` is imported from `lucide-react`.

The page and `MaterialTrackingContent` are unchanged; only routing and nav were removed.

---

## 5. Proshop / ERP Notes

- Data is **read-only** from the dashboard; no writes to Proshop from this feature.
- “Due at Dock” in the UI comes from PO line `estimatedArrival` (and fallbacks) in the backend.
- BOM and part stock statuses are merged so a WO can show “Ordered (BOM)” or “Arrived (BOM)” when BOM POs are in the right state.

---

## 6. File Reference Summary

| Area | Path |
|------|------|
| Standalone page (archived) | `src/pages/MaterialTracking.tsx` |
| Reusable content + exports | `src/components/MaterialTrackingContent.tsx` |
| Schedule inline material | `src/pages/Schedule.tsx` (Material column, Material Due, ProshopMaterialCell, proshopByWo, getProshopMaterialStatus) |
| API client | `src/services/api.ts` → `getProshopMaterialStatus` |
| Types | `src/types/index.ts` → ProshopMaterialStatus, ProshopStockDetail, ProshopBomDetails, ProshopBomLine |
| Backend | `server/routes/proshop.js` → GET `/material-status` |

This documentation was written when the Material page was removed from the dashboard and its behavior was fully integrated into the Schedule page (Material + Material Due columns).
