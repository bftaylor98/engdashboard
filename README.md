# Engineering Schedule Dashboard

A browser-based dashboard application for tracking engineering work orders, schedules, and project status in a manufacturing/machining shop environment.

---

### For AI agents & new developers

**Start with [AGENTS.md](AGENTS.md).** It gives you run commands, a reading order for all docs, and a map of where to find everything (APIs, schema, auth, ProShop, etc.) so you can pick up the project with no prior context. Use [docs/README.md](docs/README.md) as the index for the rest of the documentation.

---

## Overview

This application serves as a centralized hub for:
- Viewing and managing engineering work orders
- Tracking part programming assignments
- Monitoring material status (ordered, arrived, not ordered)
- Linking to EST/Adion Systems ERP
- Kanban board for visual work order management
- Analytics with workload, assignee breakdown, and construction metrics
- Revision alert tracking
- Excel/CSV import/export for bulk data management
- Calendar view of work orders by due date
- Real-time updates across all connected clients via Server-Sent Events (SSE)
- **Version management system for database snapshots and rollback**
- **Machines view** – ProShop work center load (VMX 84-1, VMX 64-1, VMX 64-2) with remaining hours
- **Cost Analysis** – Per–work order material cost (DB) and estimated total minutes (ProShop ops)

## Technology Stack

### Frontend
- React 18.2 (TypeScript)
- Vite 5.0.12
- React Router DOM 6.22.0
- Tailwind CSS 3.4.1
- Lucide React (icons)
- Recharts (charts)
- @dnd-kit (drag-and-drop)
- @radix-ui (UI components)

### Backend
- Node.js with Express 4.21.0
- SQLite3 (better-sqlite3 11.7.0)
- Server-Sent Events (SSE) for real-time updates
- Session-based authentication (bcryptjs 3.0.3)
- Multer for file uploads
- XLSX for Excel/CSV processing

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Start the development servers:
```bash
npm run dev
```

This starts both the backend server (port 3001) and frontend dev server (port 5173).

4. Open your browser to `http://localhost:5173`

### Default Login Credentials

The following users are seeded by default (password: `changeme`):
- rob, damien, thad, alex, phillip, brad, mike, admin

**Important:** Change default passwords in production!

## Project Structure

```
Dashboard_4/
├── AGENTS.md               # Start here: onboarding for AI agents & new developers
├── README.md               # This file: overview, features, API, version history
├── docs/
│   ├── README.md           # Documentation index (all docs listed)
│   ├── MATERIAL_TRACKING_DOCUMENTATION.md
│   └── PROSHOP_429_HANDOFF.md
├── server/                 # Backend source
│   ├── database/
│   │   └── init.js        # Database initialization & schema
│   ├── lib/
│   │   ├── eventBus.js    # SSE event broadcasting
│   │   ├── versionManager.js  # Version management service
│   │   └── proshopClient.js  # ProShop auth & GraphQL
│   ├── middleware/
│   │   └── auth.js        # Authentication middleware
│   ├── routes/            # API route handlers (proshop, machines, timeTracking, tv, etc.)
│   └── index.js           # Express app setup
├── src/                    # Frontend source
│   ├── components/        # React components
│   ├── contexts/          # React contexts (Auth)
│   ├── hooks/            # Custom hooks (useSSE)
│   ├── pages/            # Page components
│   ├── services/         # API service layer
│   └── types/            # TypeScript types
├── database/              # SQLite database files
│   ├── engineering_schedule.db
│   └── versions/         # Version snapshots
├── customer_abb.csv      # Customer abbreviations mapping
└── package.json
```

## Key Features

### Schedule Tab
- **Editable Work Orders** - All identification fields (WO Number, Part Number, Part Name, Customer, Project, Quote Number) can be edited after creation
- **Bulk Copy/Paste** - Copy any property value and paste it to multiple selected work orders
- **Shift-Click Selection** - Select ranges of work orders by clicking a checkbox, holding Shift, and clicking another
- **Always Visible Filters** - Quick access to filter by Customer, Assignee, Status, and Material Status
- **New Status System** - Engineering, Eng. Comp., Programming, Prog. Comp., Hold
- **Conditional Assignee** - Assignee field only appears for Engineering and Programming statuses

### Admin Features
- **Admin Completion** - Admins (admin, brad) can mark work orders as "Completed" to archive them
- **Completed Tab** - Admin-only view of all completed work orders for throughput metrics
- **Admin-Only UI** - Completed status option and Completed tab only visible to admins

### Version Management System

The application includes a robust versioning system that allows you to:
- Create snapshots of the current database state
- Store customer abbreviations with each version
- Restore to any previous version
- View version history with metadata
- Delete old versions

**Access:** Navigate to "Versions" in the sidebar menu.

**Creating a Version:**
1. Click "Create Version"
2. Enter a name (required) and optional description
3. The system creates a snapshot of:
   - All database tables (work orders, revision alerts, construction metrics, etc.)
   - Customer abbreviations CSV file

**Restoring a Version:**
1. Click "Restore" on any version
2. Confirm the restore action
3. A safety backup is automatically created before restore
4. **Note:** Server restart required after restore

### Import/Export

- **Import:** Supports Excel (.xlsx, .xlsm, .xls) and CSV files
  - Auto-detects header rows
  - Maps columns to database fields
  - Transforms part numbers with customer prefixes
  - Uses customer abbreviations from `customer_abb.csv`
  
- **Export:** Download data as Excel or CSV
  - Includes Schedule, Revisions, and Construction sheets

### Real-Time Updates

All pages automatically refresh when data changes via Server-Sent Events (SSE). No manual refresh needed!

## API Endpoints

All endpoints except `/api/auth/login`, `/api/health`, and `/api/tv` (TV dashboard) require authentication.

### Authentication
- `POST /api/auth/login` - Login with username/password
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Work Orders
- `GET /api/work-orders` - List work orders (with filters)
- `POST /api/work-orders` - Create work order
- `PATCH /api/work-orders/:id` - Update work order
- `DELETE /api/work-orders/:id` - Delete work order

### Versions
- `GET /api/versions` - List all versions
- `GET /api/versions/:versionNumber` - Get version details
- `POST /api/versions` - Create new version
- `POST /api/versions/:versionNumber/restore` - Restore to version
- `DELETE /api/versions/:versionNumber` - Delete version

### Import/Export
- `POST /api/import/upload` - Upload file for import
- `POST /api/import/confirm` - Confirm and execute import
- `GET /api/export/xlsx` - Download Excel export
- `GET /api/export/csv` - Download CSV export

### TV Dashboard (public, no auth)
- `GET /api/tv` - Combined dashboard stats, workload, and this week's calendar for TV display. Weather is loaded client-side from Open-Meteo (no API key).

### Real-Time Events
- `GET /api/events?token=...` - SSE stream for real-time updates

### Proshop API Integration
- `GET /api/proshop/tooling-expenses` - Get tooling expense statistics for Rocket Supply purchase orders
- `GET /api/proshop/material-status` - Get material status for work orders (cache-only)
- `GET /api/proshop/open-pos` - Get open Rocket Supply purchase orders with line items
- `GET /api/proshop/ncrs/recent` - Recent NCRs; `GET /api/proshop/ncrs/last24h`, `GET /api/proshop/ncrs/by-assignee`
- `GET /api/proshop/cost-analysis?woNumber=26-0310` - Material cost (DB) + estimated total minutes (ProShop ops)
- `POST /api/proshop/import-work-orders` - Import active Engineering work orders from Proshop

See **PROSHOP_QUERIES_BRAIN.txt** / **PROSHOP_QUERIES_BRAIN.md** for route details and GraphQL usage; **PROSHOP_API_BRAIN.txt** for auth and schema.

### Machines (ProShop work center load)
- `GET /api/machines` - Incomplete operations by machine (VMX 84-1, VMX 64-1, VMX 64-2) with remaining hours (cache-only)

## Database Schema

### Main Tables
- `engineering_work_orders` - Work order data
- `revision_alerts` - Parts needing revision updates
- `construction_metrics` - Construction box metrics
- `import_history` - Import operation history
- `users` - User accounts
- `sessions` - Active user sessions
- `versions` - Version snapshots metadata

## Version History

This section documents each version of the application with key changes, features, and important notes for future developers.

---

### Version 4.3.0 - Material "Requested" & Proshop API Brain
**Date:** 2026-02-26  
**Status:** Current

#### Changes
- **Material Tracking**: Work orders with a date in `psPONumberPlainText` (e.g. "2/27/2026") or released-for-order keywords/colors are now shown as **Requested** instead of Not ordered.
- **Proshop API brain file**: `PROSHOP_API_BRAIN.txt` — auth, schema, query patterns, field gotchas.
- **Proshop queries brain file**: `PROSHOP_QUERIES_BRAIN.txt` and `PROSHOP_QUERIES_BRAIN.md` — all `/api/proshop` routes, GraphQL operations used, caching, and pagination.

---

### Version 4.2.0 - Proshop API Integration & Analytics Enhancements
**Date:** 2026-02-26  
**Status:** Superseded by 4.3.0

#### Features Implemented
- ✅ **Tooling Expenses Widget** - Pulls Rocket Supply purchase orders from Proshop API and displays monthly spending with budget tracking
- ✅ **Open Purchase Orders Table** - Displays open Rocket Supply POs with collapsible line items, sorting, and status tracking
- ✅ **Work Order Tooltips** - Hover over "Overdue" and "Due This Week" widgets to see work order details with clickable navigation
- ✅ **Analytics Page Enhancements**:
  - Tooling expenses widget with current month focus, budget tracking ($25,000/month), and 6-month history
  - PO type breakdown (Inserts, Zoller Replenishment, Regrinds, General)
  - PO type verification for current month
  - Open POs section (collapsed by default)
  - Interactive tooltips on workload stats
- ✅ **C-ID Lookup Tool** - Component lookup by C-ID or description search (from PP_Trial2 reference project)

#### Technical Details

##### Proshop API Integration
- **Authentication**: Session-based via `/api/beginsession` endpoint
- **GraphQL API**: All queries use GraphQL at `/api/graphql`
- **Required Scope**: `nonconformancereports:r workorders:r parts:r users:r toolpots:r purchaseorders:r contacts:r`
- **Caching**: 5-minute TTL in-memory cache for tooling expenses to improve performance

##### GraphQL Query Structure

The Proshop API uses GraphQL with specific field names and structures. Key learnings:

**Purchase Orders Collection (`purchaseOrders`)**:
- **Pagination**: Required `pageSize` and `pageStart` variables
- **Response Structure**:
  ```graphql
  purchaseOrders(pageSize: Int!, pageStart: Int!) {
    totalRecords: Int
    records: [PurchaseOrder]
  }
  ```
- **Valid Fields on `purchaseOrders.records`**:
  - `id` (String) - PO ID (also used as PO number)
  - `cost` (Float) - Total PO cost (NOT `total`)
  - `date` (String) - PO date (formats: ISO, M/D/YYYY, M/D/YY)
  - `orderStatus` (String) - Status like "Outstanding", "Partially Released", etc.
  - `poType` (String) - PO type classification
  - `supplier` (Object) - Requires `contacts:r` scope
    - `supplier.name` (String) - Supplier name
  - **Invalid Fields** (will cause errors):
    - `poNumber` - Use `id` instead
    - `total` - Use `cost` instead
    - `vendor` - Use `supplier.name` instead
    - `lineItems` - Not available on collection query

**Individual Purchase Order (`purchaseOrder`)**:
- **Query by ID**: `purchaseOrder(id: String!)`
- **Line Items**: Available via `poItems` (paginated field)
  ```graphql
  purchaseOrder(id: $id) {
    id
    cost
    date
    orderStatus
    poType
    supplier { name }
    poItems(pageSize: Int!, pageStart: Int!) {
      totalRecords: Int
      records: [PurchaseOrderItem]
    }
  }
  ```
- **Valid Fields on `poItems.records`**:
  - `description` (String)
  - `quantity` (String/Number)
  - `costPer` (Float) - Unit price
  - `total` (Float) - Line item total
  - `itemNumber` (String)
  - `orderNumber` (String)
  - `statusStatus` (String) - Status description
  - `statusQty` (Number) - Status quantity
  - `statusDate` (String) - Status date
  - `releasedQty` (String/Number) - Released quantity
  - `releasedDate` (String) - Release date
  - `releasedBy` (String) - Who released it
  - `receivedQty` (Number) - Received quantity
  - `receivedDate` (String) - Receive date

**Date Parsing**:
- Proshop returns dates in multiple formats:
  - ISO format: `"2026-02-26T00:00:00"`
  - US format: `"2/26/2026"` or `"2/26/26"` (2-digit years)
- The `parseProshopDate()` function handles all formats
- 2-digit years are assumed to be 2000s (e.g., "26" = 2026)

**Query Optimization**:
- Limit date ranges to reduce data fetched (e.g., last 6 months for expenses)
- Filter records early in memory to reduce processing
- Use pagination with reasonable limits (200 records/page, max 20 pages = 4000 records)
- Cache expensive queries (5-minute TTL for tooling expenses)

**Error Handling**:
- GraphQL errors are returned in `body.errors` array
- Field name errors: "Unexpected field X in selection list"
- Scope errors: "This session's scope does not grant read access to module X"
- Always check `body.errors` before using `body.data`

#### Database Changes
- No schema changes required

#### Files Changed in This Version
- Added `server/routes/proshop.js` - Proshop API integration routes
- Updated `server/index.js` - Mounted proshop routes at `/api/proshop`
- Updated `src/pages/Analytics.tsx` - Added tooling expenses widget, open POs table, work order tooltips
- Updated `src/pages/Tools.tsx` - Added C-ID lookup component
- Updated `src/services/api.ts` - Added Proshop API functions (`getToolingExpenses`, `getOpenPurchaseOrders`, `getWorkOrder`)
- Updated `src/types/index.ts` - Added `ToolingExpenses`, `OpenPurchaseOrder`, `PurchaseOrderLineItem`, `TypeBreakdown`, `TypeVerification` interfaces

#### API Endpoints Added
- `GET /api/proshop/tooling-expenses` - Get tooling expense stats for Rocket Supply POs
- `GET /api/proshop/open-pos` - Get open Rocket Supply purchase orders with line items
- `GET /api/work-orders/:id` - Get single work order (for tooltip navigation)

#### Known Issues & Notes
- Proshop API requires `contacts:r` scope to access `supplier.name` field
- Date formats vary - always use `parseProshopDate()` helper
- PO numbers in Proshop are stored in the `id` field, not a separate `poNumber` field
- Line items must be queried separately for each PO (not available in collection query)
- Tooling expenses query is cached for 5 minutes to reduce API load
- Open POs section is collapsed by default on Analytics page
- Tooltips have 1-second delay before disappearing for better UX

#### Migration Notes
- No database migration needed
- Ensure Proshop API credentials are configured in `server/routes/proshop.js`
- Verify API scope includes all required permissions

---

### Version 4.1.0 - Dashboard Enhancements & User Experience Improvements
**Date:** 2026-02-17  
**Status:** Current

#### Features Implemented
- ✅ **Light/Dark Mode** - User preferences stored in database, accessible via Settings page (click account name)
- ✅ **My Assignments View** - Non-admin users see only their assigned work orders on Dashboard with filtered statistics
- ✅ **Role-Based Navigation** - Versions tab (admin-only), Import tab (admin + Rob only), Kanban (admin-only)
- ✅ **Dashboard Enhancements**:
  - Editable assignee field directly from dashboard table
  - Material status column with inline editing
  - Sort controls (Priority default, Work Order # option)
  - Material status filter
  - Default sort by priority (descending - highest first)
- ✅ **Kanban Improvements**:
  - Shift-click multi-select for bulk card operations
  - View switching between Status and Assignment views
  - Assignment view allows changing assignee via drag-and-drop
- ✅ **Schedule Page Improvements**:
  - Removed "LATE" tag (red text sufficient for overdue items)
  - Continuous scroll (no pagination)
  - "Mark Completed" button for admins when rows are selected
  - Unassigned filter option
  - Status sorting option
  - Natural sorting for work order numbers (26-0222 before 26-1222)
- ✅ **Auto-Assignment Logic** - Jobs assigned to Rob automatically get "Engineering" status
- ✅ **Added Damien** to assignees list

#### Technical Details
- Added preferences column to users table (JSON format)
- Created ThemeContext for centralized theme management
- Enhanced Dashboard with assignee editing, material status display, and filtering
- Improved Kanban with multi-select state management and view switching
- Natural work order number sorting using SQL CAST for numeric comparison
- Auto-status logic: Assigning to Rob sets status to "Engineering"

#### Database Changes
- Added `preferences` column to `users` table (TEXT, JSON format, default '{}')
- Migration logic included to add column to existing databases

#### Files Changed in This Version
- Added `src/contexts/ThemeContext.tsx` - Theme management context
- Added `src/pages/Settings.tsx` - User settings page
- Updated `server/database/init.js` - Added preferences column
- Updated `server/routes/auth.js` - Added preferences endpoints
- Updated `server/routes/workOrders.js` - Rob auto-status, natural WO sorting, unassigned filter
- Updated `server/routes/stats.js` - Assignee filtering for non-admins
- Updated `src/App.tsx` - ThemeProvider, Settings route
- Updated `src/components/Layout.tsx` - Settings link, role-based navigation
- Updated `src/pages/Dashboard.tsx` - Major enhancements (assignee editing, material status, sorting, filtering)
- Updated `src/pages/Schedule.tsx` - Removed LATE tag, continuous scroll, mark completed, filters
- Updated `src/pages/Kanban.tsx` - Multi-select, view switching
- Updated `src/services/api.ts` - Preferences functions, assignee parameter
- Updated `src/types/index.ts` - Added Damien to ASSIGNEES
- Updated `src/index.css` - Comprehensive light mode styling

#### Known Issues & Notes
- Light mode styling may need further refinement based on user feedback
- Completed work orders excluded from non-admin dashboards
- Kanban view switching clears selection
- Server restart may be needed after database schema changes

---

### Version 1.1.0 - Schedule Tab Improvements & Admin Features
**Date:** 2026-02-16  
**Status:** Current

#### Features Implemented
- ✅ **Editable work order fields** - WO Number, Part Number, Part Name, Customer, Project, and Quote Number can now be edited after creation
- ✅ **Improved table layout** - Wider Part Number and Part Name columns, improved Notes column visibility
- ✅ **New status system** - Replaced old status values with: Engineering, Eng. Comp., Programming, Prog. Comp., Hold
- ✅ **Updated assignees** - Reduced to only: Brad, Alex, Rob, Thad
- ✅ **Conditional assignee field** - Assignee dropdown only appears when status is Engineering or Programming
- ✅ **Admin completion feature** - Admins (admin, brad) can mark work orders as "Completed" and view them in a separate Completed tab
- ✅ **Bulk copy/paste** - Copy property values (Project, Customer, Notes, Quote Number, Machine Scheduled, Due Date, Status, Assignee) from one work order and paste to multiple selected work orders
- ✅ **Shift-click selection** - Click a checkbox, hold Shift, click another to select all rows in between
- ✅ **Always visible filters** - Filters bar is always visible (no toggle needed)
- ✅ **Simplified filters** - Removed priority filter, kept only Customer, Assignee, Status, Material Status
- ✅ **Removed Prog Hrs column** - Est. Programming Hours removed from table (still available in drawer)
- ✅ **UI improvements** - Alternating row shading, improved column spacing, white text for notes field

#### Technical Details
- Admin detection: Username-based (`admin` or `brad`)
- Status filtering: Completed items excluded from Schedule, Kanban, and Analytics by default
- Backend API: Added support for excluding status with `!status` syntax
- Optimistic updates: Table updates immediately on paste operations

#### Database Changes
- No schema changes required - status stored as TEXT, supports new values
- Default status changed from 'assigned' to 'engineering'

#### Files Changed in This Version
- Updated `src/pages/Schedule.tsx` - Major improvements: editable fields, copy/paste, shift-click, filters
- Updated `src/components/WorkOrderDrawer.tsx` - Made fields editable, added copy buttons, conditional assignee, admin completion button
- Updated `src/types/index.ts` - New status types, updated ASSIGNEES, added 'completed' status
- Updated `src/lib/utils.ts` - Added isAdmin() function, updated status utilities
- Updated `src/pages/Kanban.tsx` - Updated status columns and colors
- Updated `src/pages/Analytics.tsx` - Updated status handling and colors
- Added `src/pages/Completed.tsx` - New admin-only page for completed work orders
- Updated `src/App.tsx` - Added Completed route with admin check
- Updated `src/components/Layout.tsx` - Added Completed nav item (admin-only)
- Updated `server/routes/workOrders.js` - Updated default status, added status exclusion support
- Updated `server/routes/stats.js` - Exclude completed items from active stats
- Updated `server/routes/import.js` - Updated default status
- Updated `server/database/init.js` - Updated default status

#### Known Issues & Notes
- Completed work orders are hidden from non-admin users
- Admin users see "Completed" status option and Completed tab
- Shift-click selection works for range selection between two clicked checkboxes
- Copy/paste requires selecting work orders first, then clicking paste button
- Status and Assignee can be copied/pasted like other fields

#### Migration Notes
- Existing work orders with old status values will still display (backward compatible)
- No database migration needed - status is stored as TEXT
- Admins should mark completed work orders using the new "Mark as Complete" button

---

### Version 1.0.0 - Initial Release
**Date:** 2026-02-16  
**Status:** Previous

#### Features Implemented
- ✅ Complete authentication system with session management
- ✅ Work order CRUD operations with real-time updates via SSE
- ✅ Schedule page with filtering, sorting, and inline editing
- ✅ Kanban board with drag-and-drop functionality
- ✅ Analytics dashboard with charts and statistics
- ✅ Revision alerts tracking
- ✅ Import/Export functionality (Excel and CSV)
- ✅ Calendar view of work orders
- ✅ Customer abbreviation system for part number transformation
- ✅ **Version management system** - Create, list, restore, and delete database snapshots
- ✅ Mass delete functionality for work orders
- ✅ Single work order delete from drawer
- ✅ CSV import with header row detection and skipping
- ✅ Customer field uses Abbreviation column from customer_abb.csv

#### Technical Details
- Database: SQLite3 with WAL mode
- Authentication: Session tokens (not JWT)
- Real-time: Server-Sent Events (SSE)
- Frontend: React 18 + TypeScript + Vite
- Backend: Express.js + better-sqlite3

#### Database Tables
- `engineering_work_orders` - Main work order data
- `revision_alerts` - Revision tracking
- `construction_metrics` - Construction metrics
- `import_history` - Import logs
- `users` - User accounts (default: rob, damien, thad, alex, phillip, brad, mike, admin)
- `sessions` - Active sessions
- `versions` - Version snapshots metadata

#### Known Issues & Notes
- Server restart required after version restore (database connection is closed)
- Customer abbreviations loaded on server startup (restart needed after CSV changes)
- CSV import skips header rows automatically
- Part number transformation uses Unique Id for prefix, Abbreviation for Customer field

#### Files Changed in This Version
- Added `server/lib/versionManager.js` - Version management service
- Added `server/routes/versions.js` - Version API routes
- Added `src/pages/Versions.tsx` - Version management UI
- Added `src/types/index.ts` - Version interface
- Updated `server/database/init.js` - Added versions table
- Updated `server/index.js` - Mounted version routes
- Updated `server/routes/events.js` - Added version:restored event
- Updated `src/services/api.ts` - Added version API functions
- Updated `src/components/Layout.tsx` - Added Versions nav item
- Updated `src/App.tsx` - Added Versions route
- Updated `src/hooks/useSSE.ts` - Added version:restored event type
- Updated `server/routes/import.js` - Improved header detection, customer abbreviation handling

#### Migration Notes
- If upgrading from a previous version, run database initialization to create `versions` table
- Create initial Version 1 snapshot after deployment
- Ensure `customer_abb.csv` exists in project root

#### Next Steps for Future Versions
- Consider automatic versioning on major imports
- Add version comparison/diff view
- Implement version size limits and cleanup policies
- Add version tags/labels for better organization

---

## Development

### Running in Development
```bash
npm run dev
```

### Building for Production
```bash
npm run build
```

### Starting Production Server
```bash
npm start
```

## Configuration

### Customer Abbreviations
Edit `customer_abb.csv` to manage customer name mappings:
- **Company Name** - Full customer name
- **Unique Id** - Used for part number prefixes
- **Abbreviation** - Used for Customer field in database

After editing, restart the server to reload abbreviations.

## Troubleshooting

### Database Issues
- If database is corrupted, restore from a version snapshot
- Check `database/` directory for backup files
- WAL files (`.db-wal`, `.db-shm`) are normal and safe to delete if needed

### Import Issues
- Ensure CSV files have proper headers
- Check that customer names match entries in `customer_abb.csv`
- Header rows are automatically detected and skipped

### Version Restore Issues
- Always restart server after restore
- Safety backups are created in `database/` directory
- Check server logs for detailed error messages

## License

Internal use only.

## Documentation

- **New to the project (or an AI agent with no context)?** Start with **[AGENTS.md](AGENTS.md)** for run commands, reading order, and where to find everything.
- **Full doc index:** [docs/README.md](docs/README.md).

## Support

For issues or questions, contact the development team.

---

**Last Updated:** 2026-03-11  
**Current Version:** 4.3.0

