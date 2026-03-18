# Version 13.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 13.0 introduces Excel file support for the Tool Import widget, replacing the complex HTML parsing with a more reliable Excel-based parser. This version significantly improves the accuracy and reliability of tool data import by leveraging structured Excel table data instead of parsing HTML with absolute positioning.

## New Features & Changes

### Excel File Support for Tool Import

#### Major Improvement
- **Previous**: Tool import only supported HTML files with complex parsing logic for absolute-positioned elements
- **New**: Tool import now supports Excel files (.xls, .xlsx, .xlsm) with clean row/column parsing
- **Backward Compatibility**: HTML file import is still supported for existing workflows

#### Benefits
- **More Reliable**: No issues with absolute positioning, non-breaking spaces, or text encoding
- **Easier to Parse**: Clear table structure with explicit rows and columns
- **Better Header Detection**: Identifies header rows by column labels (#, Tool Name, Holder)
- **Simpler Logic**: Uses row/column indices instead of complex position calculations
- **Same Features**: All existing features work (consecutive duplicate combining, multi-operation import, etc.)

#### Implementation Details
- **Library**: Added SheetJS (xlsx.js) via CDN for Excel file parsing
- **File Input**: Updated to accept `.xls`, `.xlsx`, `.xlsm`, `.html`, and `.htm` files
- **Parser**: New `parseToolImportExcel()` function that:
  - Parses Excel files using SheetJS
  - Identifies header rows containing "#", "Tool Name", and "Holder"
  - Automatically detects column positions from header row
  - Groups tools by header rows (supports multiple tool groups)
  - Combines consecutive duplicate tool numbers (sums runtimes)
  - Handles missing headers (treats all rows as one group)

#### Column Detection
The parser automatically identifies columns by header labels:
- **#** or **Tool #** → Tool Number
- **Tool Name** → Tool Name
- **Rad.** or **Rad** or **Radius** → Radius
- **StickOut** or **Stick Out** → Stickout
- **Holder** → Holder Type
- **Coolant** or **Cooling** → Coolant
- **Run-Time** or **Runtime** or **Time** → Runtime

If headers aren't found, it uses default column positions (0-6).

### Tool Import Widget Updates

#### File Selection
- **Label**: Changed from "Select HTML File" to "Select Excel File (.xls or .xlsx)"
- **Accept Types**: Now accepts `.xls`, `.xlsx`, `.xlsm`, `.html`, `.htm`
- **User Experience**: Clear indication that Excel files are preferred

#### Parsing Logic
- **Excel Files**: Uses SheetJS to parse structured table data
- **HTML Files**: Continues to use existing HTML parser (backward compatibility)
- **Error Handling**: Improved error messages for unsupported file types

## Technical Changes

### New Dependencies
- **SheetJS (xlsx.js)**: Added via CDN (`https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js`)
  - Used for parsing Excel files
  - No build process required (CDN)
  - Lightweight and fast

### New Functions

#### `parseToolImportExcel(fileContent, fileName)`
- Parses Excel files using SheetJS
- Identifies header rows and groups tools accordingly
- Returns `{ toolGroups: [...] }` format (same as HTML parser)
- Handles consecutive duplicate tool number combining

#### `parseToolRowsFromExcel(data, startRow, endRow, headerRow)`
- Helper function to parse tool rows from Excel data
- Automatically detects column positions from header row
- Filters out empty rows and header-like rows
- Validates tool numbers (must be numeric)

### Modified Functions

#### `handleFileSelection()`
- Now detects file type (Excel vs HTML)
- Reads Excel files as ArrayBuffer
- Reads HTML files as text
- Routes to appropriate parser based on file type
- Improved user feedback messages

### File Structure
- No changes to data structure
- Tool import still stores data in `window.pendingToolImport`
- Import process unchanged (uses same `confirmToolImport()` function)

## User Experience Improvements

### Import Workflow
1. **Select File**: Choose Excel or HTML file
2. **Automatic Detection**: System detects file type automatically
3. **Parse & Group**: Tools are parsed and grouped by header rows
4. **Select Operations**: Choose which operations to import to (same as before)
5. **Import**: Tools are imported with all existing features (runtime combining, formatting, etc.)

### Error Messages
- Clear messages for unsupported file types
- Helpful feedback during file reading and parsing
- Detailed console logging for debugging

## Migration from Version 12.0

### Data Compatibility
- Version 13.0 can load Version 12.0 files (no data structure changes)
- All existing features continue to work
- HTML import still supported for backward compatibility

### Breaking Changes
- None - fully backward compatible

### Recommended Actions
- **For New Imports**: Use Excel files (.xls or .xlsx) for better reliability
- **For Existing Workflows**: HTML import still works, but Excel is recommended

## Known Issues
- None reported

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, internet connection for SheetJS CDN (first load only)

## Testing
- ✅ Excel file parsing with multiple tool groups
- ✅ Header row detection
- ✅ Column position auto-detection
- ✅ Consecutive duplicate tool combining
- ✅ Multi-operation import
- ✅ HTML file import (backward compatibility)
- ✅ Error handling for invalid files

## Next Steps (Future Versions)
- Consider caching SheetJS library locally for offline use
- Add support for CSV/TSV files
- Improve column detection for non-standard Excel formats
- Add preview of parsed tools before import



