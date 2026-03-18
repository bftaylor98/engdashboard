# Version 31.0 - State Snapshot & Version Archive

**Release Date:** February 18, 2026

## Status
✅ Stable

## Summary
Version 31.0 is a state checkpoint capturing the current stable state of the Process Packet form and all supporting infrastructure. All version history files older than the last two releases have been archived to `docs/archive/` for cleaner project organization.

## Current State Overview

### Process Packet Form (`index.html`)
- Full-featured CNC process packet form with dark mode UI
- Hurco (blue) and Mazak (orange) dynamic theming
- Operations management with add, remove, move, insert, and Ctrl+Click multi-expand (v30.0)
- Secondary processes support (heat treat, grinding, welding) with red styling
- Machinist Notes field per operation with inverted editability model (v29.0)
- Tool import from Excel (.xls, .xlsx, .xlsm) and HTML files
- Image management with paste, upload, navigation, and FRONT labeling
- Shape/annotation tools (circles, arrows, rectangles, note boxes) and workholding palette
- Widget sidebar with calculators (milling, drilling, metric converter), text formatting, TMS tools (C-ID lookup, stock check)
- Form locking with password protection, multi-user support, and 3-minute auto-lock
- Revision tracking, auto-fill features, autocomplete fields
- CTS Water banner detection, WO number hyperlink
- Power Automate integration for assistance requests and feedback
- Centralized edit logging to server with client identification
- Column min-width scaling fix for high-DPI monitors (v29.0)

### Logging Server (`server/`)
- Node.js/Express server on port 3001
- Human-readable text logs (`.txt`) and pretty-formatted JSON logs (`.json`)
- Client/endpoint identification via `X-Client-ID` header
- Concurrent write handling with queue system
- CORS support for cross-origin form instances
- Python CID API server for tool database lookups (`cid_api_server.py`)

### Documentation
- `FEATURE_LIST.md` — Complete feature catalog
- `AGENT_GUIDE.md` — AI agent development guide
- `HOW_IT_WORKS.md` — Technical architecture
- `BRAIN_FILE_SQL_QUERY_ARCHITECTURE.md` — SQL query reference
- Server docs: `DEPLOYMENT_GUIDE.md`, `QUICK_START.md`, `STARTUP_INSTRUCTIONS.md`, `TROUBLESHOOTING.md`, `CID_API_README.md`

### Data & Examples
- Sample data files in `data/` (Book1.csv, import4.xls, SSP_5_Ops.xls)
- Import examples in `examples/` (4 HTML example files)
- Tool import templates: `tool_import.xls`, `cooling_tool.xls`, `import_test.xlsm`

## Housekeeping

### Version Archive
- Moved `VERSION_1.0.md` through `VERSION_29.0.md` to `docs/archive/`
- Active version files retained in `docs/`: `VERSION_30.0.md`, `VERSION_31.0.md`

## Files Modified

### New Files
- `docs/VERSION_31.0.md` — This version file

### Organizational Changes
- `docs/archive/` — New directory containing archived version files (v1.0–v29.0)

## Migration Notes

No migration required. This is a state checkpoint with no functional changes to the application.

