# Version 26.0 - Tool Import Cooling Fix & Widget Improvements

**Release Date:** Current

## Status
✅ Stable

## Summary
Version 26.0 fixes critical issues with tool import cooling extraction from Excel files, adds auto-fill descriptions functionality to the TMS Tools widget, improves widget organization for locked forms, and fixes several widget collapse/expand issues.

## Major Features

### Auto-Fill Descriptions from C-IDs
A new "Auto-Fill Descriptions" nested widget in the TMS Tools widget allows users to automatically fill tool descriptions based on C-ID numbers found in the form.

**Features:**
- Scans all operations and their tooling tables
- Finds tools with C-ID values (normalizes format, e.g., "214" → "C-214")
- Queries the SQL database for each C-ID using the existing API endpoint
- Auto-fills the description field for tools that have descriptions in the database
- Updates both the data structure and the UI
- Displays a summary showing success, skipped, and error counts

**Usage:**
1. Unlock the form to see the TMS Tools widget
2. Expand the TMS Tools widget
3. Expand the "Auto-Fill Descriptions" nested widget
4. Click "Auto-Fill Descriptions from C-IDs"
5. The function processes all tools with C-IDs and updates descriptions automatically

### Tools Widget for Locked Forms
When the form is locked, calculators and converters are now nested under a unified "Tools" widget for better organization.

**Structure:**
- **Parent Widget**: "Tools" (visible only when form is locked)
- **Nested Sub-Widgets**:
  - **Milling Calculator**
  - **Drilling Calculator**
  - **Metric Converter**
- Individual calculator widgets are hidden when the form is locked
- When unlocked, individual calculator widgets are shown (Tools widget is hidden)

## Bug Fixes

### Tool Import Cooling Extraction
Fixed critical issue where cooling values were not being imported from Excel files.

**Improvements:**
- Enhanced header detection to recognize "COOL", "COOLANT", and "COOLING" column headers
- Added intelligent column detection that scans data rows to find coolant columns even when headers are missing
- Improved coolant value extraction to handle undefined/null values properly
- Enhanced normalization logic to handle more coolant value formats:
  - "Thru-Spindle" / "Thru Spindle" → "CTS"
  - "Air" → "Air"
  - "Flood" → "Flood"
  - "ATS" → "ATS"
  - "Superflow" → "Superflow"
  - "Oil" → "Oil"
  - "Off" → (blank)
- Added comprehensive debug logging to track coolant extraction and normalization

**Column Detection Logic:**
- First attempts to find coolant column by header name
- If not found, scans all data rows to identify columns containing coolant-like values
- Excludes known columns (tool number, name, rad, stickout, holder, runtime) from search
- Requires at least 2 matches before using a column (to avoid false positives)
- Falls back to default column 5 if no coolant column is detected

### Widget Collapse/Expand Issues

#### Import Widget
- Fixed widget ID mismatch: Changed `'toolImport'` to `'import'` in `allWidgetIds` arrays
- Widget now properly collapses and expands when clicked

#### TMS Tools Widget
- Added `'tmsTools'` to `allWidgetIds` arrays so it's properly managed with other widgets
- Fixed toggle logic to collapse widgets when clicked (previously only expanded)
- Widget now properly collapses and expands when clicked

### Widget Visibility
- Fixed Tools widget visibility: Only shows when form is locked
- Individual calculator widgets are hidden when locked (they're nested in Tools widget)
- Individual calculator widgets are shown when unlocked (Tools widget is hidden)

## Technical Details

### Auto-Fill Descriptions Implementation
- Function: `autoFillDescriptionsFromCids()`
- Scans `operations` array for tools with C-ID values
- Normalizes C-ID format (adds "C-" prefix if missing)
- Queries API endpoint: `${CID_API_BASE_URL}/cid/${encodedCid}`
- Updates both data structure (`operations[opIndex].tooling[toolIndex].description`) and UI
- Re-renders operations after all updates to ensure consistency
- Provides detailed console logging for debugging

### Cooling Extraction Improvements
- Enhanced `parseToolRowsFromExcel()` function with intelligent column detection
- Improved `confirmToolImport()` normalization logic
- Added comprehensive error handling and logging
- Handles edge cases: empty values, undefined values, various formats

### Widget Organization
- New `toolsLockedWidget` created with nested calculator widgets
- Updated `applyLockState()` function to show/hide widgets correctly
- Added `'toolsLocked'` to widget management arrays

## Files Modified

### Modified Files
- `index.html` - Fixed tool import cooling extraction, added auto-fill descriptions, improved widget organization, fixed widget collapse issues

## Migration Notes

No migration required. All changes are backward compatible.

## Usage

### Auto-Filling Tool Descriptions
1. Ensure tools in your form have C-ID values entered
2. Unlock the form (if locked)
3. Expand the TMS Tools widget
4. Expand the "Auto-Fill Descriptions" nested widget
5. Click "Auto-Fill Descriptions from C-IDs"
6. Review the summary showing how many descriptions were updated

### Using Tools Widget (Locked Form)
1. Lock the form
2. Expand the "Tools" widget in the sidebar
3. Expand individual calculator/converter sub-widgets as needed
4. All calculators and converters are now organized under one parent widget

### Importing Tools with Cooling
1. Ensure your Excel file has a "Coolant", "Cooling", or "Cool" column header, OR
2. Ensure your Excel file has coolant values (Flood, Air, CTS, etc.) in one of the data columns
3. Import tools as usual - cooling values will now be automatically detected and imported
4. Check browser console for detailed logging if issues occur

## Known Limitations

- Auto-fill descriptions requires C-IDs to be in the correct format (C-XXX or XXX)
- Cooling detection may not work if coolant values are in an unexpected format
- Tools widget is only visible when form is locked

## Future Enhancements

- Add ability to manually specify coolant column position if auto-detection fails
- Add preview of detected columns before import
- Support for more coolant value formats
- Batch C-ID description updates with progress indicator











