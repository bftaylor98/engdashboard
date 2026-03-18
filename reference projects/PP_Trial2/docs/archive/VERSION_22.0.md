# Version 22.0 - TMS Tools Integration & Tooling Value Calculation

**Release Date:** Current

## Status
✅ Stable

## Summary
Version 22.0 adds comprehensive TMS (Tool Management System) integration with C-ID lookup capabilities, stock checking, and automatic tooling value calculation. This version introduces a new Python FastAPI server for database queries and adds tooling value fields that automatically calculate the total cost of tooling for each operation.

## Major Features

### TMS Tools Widget

#### New Parent Widget
A new "TMS Tools" widget has been added to the widget sidebar, following the nested widget pattern established in Version 21.0. This widget contains two sub-widgets:

1. **C-ID Lookup** (nested sub-widget)
   - Input field to lookup individual C-IDs
   - Accepts C-ID format with or without "C-" prefix (e.g., "C-214" or "214")
   - Enter key support for quick lookup
   - Displays:
     - C-ID
     - Description
     - Part Number
     - Unit Price
     - Stock Quantity
     - Circulation Quantity

2. **Stock Check** (nested sub-widget)
   - "Check All C-IDs" button to scan all C-IDs in the form
   - Results displayed in a clean table format with:
     - C-ID (center-aligned)
     - Stock (center-aligned)
     - Circulation (abbreviated as "Circ", center-aligned)
   - Color-coded rows:
     - **Green**: Has stock (regardless of circulation)
     - **Yellow**: No stock but has circulation
     - **Red**: No stock and no circulation
   - Handles both "C-214" and "214" formats automatically

### Python FastAPI Server

#### New Server Component
A new Python FastAPI server (`server/cid_api_server.py`) provides database connectivity for C-ID lookups:

- **Endpoint**: `GET /cid/{cid}` - Lookup component information by C-ID
- **Health Check**: `GET /health` - Database connection health check
- **Database**: Connects to ZOLLERDB3 on `ESTSS01\ZOLLERSQLEXPRESS`
- **Features**:
  - Read-only database access (SELECT queries only)
  - Supports multiple credential attempts (SA/Zollerdb3, Brad Taylor/Falcon 9)
  - Returns component details including:
    - Description
    - Part Number (OrderNo)
    - Unit Price
    - Stock Quantity (Status = 0 only)
    - Circulation Quantity (Status != 0)
    - Min/Max Stock
    - Storage Location
  - CORS enabled for HTML form integration
  - Handles multiple concurrent requests safely

#### Server Setup
- **Port**: 5055 (configurable via PORT environment variable)
- **Dependencies**: See `server/requirements.txt`
  - fastapi==0.104.1
  - uvicorn[standard]==0.24.0
  - pyodbc==5.0.1
  - pydantic==2.5.0
- **Documentation**: See `server/CID_API_README.md`

### Tooling Value Calculation

#### Per-Operation Tooling Value
Each primary operation now displays a "Tooling Value" field in the Program Information section:

- **Location**: Right next to "Operation Runtime" field
- **Auto-calculated**: Sums unit prices of all C-IDs in the operation's tooling table
- **Display**: Currency format (e.g., "$125.50")
- **Calculation**: Only runs when form is locked
- **Background Processing**: Calculates asynchronously without blocking UI
- **Status Indicator**: Shows "Calculating..." while processing

#### Total Tooling Value
A new "Total Tooling Value" field has been added to the Job Information section:

- **Location**: Right after "Total Runtime" field
- **Auto-calculated**: Sums tooling values from all primary operations
- **Display**: Currency format (e.g., "$1,250.75")
- **Updates**: Automatically updates when individual operation tooling values change

### Performance Optimizations

#### Connection Warmup
The system now pre-establishes database connections when the form is unlocked:

- **Background Health Check**: Makes a lightweight `/health` API call when form unlocks
- **Faster First Use**: Eliminates connection delay on first C-ID lookup or stock check
- **Silent Failure**: If warmup fails, connection is established on first actual use
- **Non-blocking**: Runs asynchronously without affecting UI responsiveness

## Technical Details

### API Configuration
- **Base URL**: Configurable via `CID_API_BASE_URL` constant
  - Local testing: `http://localhost:5055`
  - Production: `http://192.168.1.193:5055`
- **Auto-formatting**: C-ID inputs automatically normalize (e.g., "214" → "C-214")

### Database Queries
The server implements the exact query patterns from the Brain File architecture:

- **Component Lookup**: `ObjData.ObjType=11 AND ObjData.ObjTxt = cid`
- **Stock Calculation**: `SUM(Quantity) WHERE Status = 0` (in stock only)
- **Circulation Calculation**: `SUM(Quantity) WHERE Status != 0` (checked out)
- **EAV Pattern**: Joins `ValData` with `FieldInfo` for OrderNo and UnitPrice
- **Min/Max Stock**: From `StorageBooking.StorageQuantityMin/Max`

### Widget Visibility
- **TMS Tools Widget**: Only visible when form is unlocked
- **Nested Widgets**: Can be expanded/collapsed independently
- **Follows Palette Pattern**: Uses same nested widget structure as Palette widget

## Files Added/Modified

### New Files
- `server/cid_api_server.py` - Python FastAPI server for C-ID lookups
- `server/requirements.txt` - Python dependencies
- `server/CID_API_README.md` - Server setup and API documentation
- `docs/VERSION_22.0.md` - This file

### Modified Files
- `index.html` - Added TMS Tools widget, tooling value fields, and calculation functions

## Migration Notes

### Server Setup Required
To use the C-ID lookup features, the Python FastAPI server must be running:

1. Install Python dependencies: `pip install -r server/requirements.txt`
2. Start server: `python server/cid_api_server.py`
3. Server runs on port 5055 by default

### Configuration
Update `CID_API_BASE_URL` in `index.html` based on deployment:
- Local: `http://localhost:5055`
- Production: `http://192.168.1.193:5055`

## Known Limitations

- Tooling Value calculation only runs when form is locked
- Requires Python server to be running for C-ID lookups
- Database connection requires ODBC Driver 17+ for SQL Server
- Stock check may take time for forms with many C-IDs

## Future Enhancements

- Cache C-ID lookups to reduce database queries
- Add bulk C-ID lookup endpoint for faster stock checks
- Add tooling value calculation when form is unlocked (optional)
- Add export of tooling values to reports


