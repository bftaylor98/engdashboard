# Version 25.0 - Legacy Process Packet Import & Widget Organization

**Release Date:** Current

## Status
✅ Stable

## Summary
Version 25.0 adds comprehensive Legacy Process Packet import functionality, allowing users to import data from legacy Excel (.xlsm) files into the HTML form. This version also reorganizes import widgets into a unified parent widget structure and fixes widget visibility issues when the form is locked.

## Major Features

### Legacy Process Packet Import

A new "Legacy Packet" import widget allows users to import complete process packet data from legacy Excel files (.xlsm format). The import function automatically:

1. **Detects and Adds Operations**: Automatically adds primary operations based on "Primary Operation X" sheets found in the import file
2. **Imports Job Information**: Reads data from the "Cover" sheet
3. **Imports Operation Data**: Reads data from each "Primary Operation X" sheet
4. **Imports Compensation Programs**: Automatically expands and populates compensation programs when data exists
5. **Imports Tooling Information**: Reads tooling data for each operation
6. **Imports Secondary Processes**: Adds secondary processes in the correct order based on workbook position

#### Job Information Import (from "Cover" sheet)
- **A1** → Part Description
- **A6** → Part Number
- **U44** → Machine/Cell (only imports if value is "Mazak" or "Hurco", ignores numeric values like 1, 2, 3)

#### Primary Operation Import (from "Primary Operation X" sheets)
- **A5** → Programmer Name
- **C5** → Operation Description
- **G5** → Machine Type (converts "VMC" to "Mill")
- **I5** → Program Name
- **B8** → Axis X
- **B9** → Axis Y
- **B10** → Axis Z
- **B13** → Fixture
- **G13** → Fixturing Notes
- **A46** → General Notes

#### Compensation Programs Import
- **Detection**: Checks if B23 has data to determine if compensation programs exist
- **B23-B27** → Program Names
- **G23-G27** → Tool Numbers
- **H23-H27** → Per Side Comp
- Automatically expands compensation programs section when data is found

#### Tooling Information Import
- **A30-A44** → Tool Numbers (only imports rows where A cell has data)
- **B30-B44** → Tool Descriptions
- **G30-G44** → Rads (removes "r" and leading zeros before decimal)
- **H30-H44** → SO/Stickout (removes quotes)
- **I30-I44** → RO/Runout
- **K30-K44** → Holder Type
- **M30-M44** → Cooling
- **O30-O44** → Runtime (converts various formats including decimal hours like "2.25 hrs" → "2hrs 15m")

#### Secondary Processes Import
- **Detection**: Finds all "Secondary Operation" sheets (with optional number in parentheses)
- **A7** → Secondary Process Description
- **Ordering**: Inserts secondary processes in the correct position based on workbook order
- **Example**: If "Secondary Operation" appears between "Primary Operation 4" and "Primary Operation 5" in the workbook, it will be inserted between those operations in the HTML form

### Widget Organization Improvements

#### New Import Widget Structure
- **Parent Widget**: "Import" widget contains both import functions
- **Nested Sub-Widgets**:
  - **Tool List** (formerly "Tool Import")
  - **Legacy Packet** (formerly "Import Legacy Process Packet")
- Follows the same nested widget pattern as TMS Tools widget
- Both sub-widgets can be expanded/collapsed independently

### Bug Fixes

#### Widget Visibility When Locked
- Fixed issue where several widgets were not being hidden when the form was locked
- **Fixed Widgets**: paletteWidget, operationsFunctionsWidget, textFormattingWidget, tmsToolsWidget
- All widgets now properly hide/show based on lock state

#### Secondary Process Program Name Error
- Fixed error in `updateOperationTitlesAndProgramNames()` function
- Function now properly skips secondary processes when updating program names (they don't have `programInfo` object)
- Prevents "Cannot read properties of undefined" errors

## Technical Details

### Import Process Flow
1. User selects .xlsm file via file input
2. File is parsed using SheetJS (XLSX library)
3. Job Information is imported from "Cover" sheet
4. All "Primary Operation X" sheets are detected (excluding hidden sheets)
5. Primary operations are automatically added if needed
6. Each primary operation is imported with:
   - Program Information
   - Part Setup Information
   - Compensation Programs (if data exists)
   - Tooling Information
7. All "Secondary Operation" sheets are detected (excluding hidden sheets)
8. Secondary processes are imported and inserted in correct workbook order
9. Operations are re-rendered to display imported data
10. Success message shows summary of what was imported

### Runtime Formatting
The import function handles various runtime formats:
- **Decimal Hours**: "2.25 hrs" → "2hrs 15m" (2.25 × 60 = 135 minutes)
- **Decimal Hours (no suffix)**: ".75" → "45m" (0.75 × 60 = 45 minutes)
- **Standard Formats**: Uses existing `parseRuntimeToMinutes()` function for formats like "45m", "1hr 45m", "2hrs"

### Sheet Detection
- **Primary Operations**: Matches "Primary Operation X" where X is a number
- **Secondary Operations**: Matches "Secondary Operation" with optional number in parentheses
- **Hidden Sheets**: Automatically excludes hidden sheets from detection and import
- **Case Insensitive**: Sheet name matching is case-insensitive

### Data Processing
- **Corner (Rad)**: Removes "r" (case-insensitive) and leading zeros before decimal
- **Stickout (SO)**: Removes quotes from imported values
- **Machine Type**: Converts "VMC" to "Mill" for compatibility
- **Machine/Cell**: Only imports "Mazak" or "Hurco", ignores numeric values

## Files Modified

### Modified Files
- `index.html` - Added Legacy Process Packet import functionality, reorganized import widgets, fixed widget visibility issues

## Migration Notes

No migration required. The import functionality is additive and does not affect existing forms or data.

## Usage

### Importing Legacy Process Packet
1. Unlock the form (if locked)
2. Expand the "Import" widget in the sidebar
3. Expand the "Legacy Packet" nested widget
4. Click "Select Legacy Process Packet File (.xlsm)"
5. Browse to and select your .xlsm file
6. The import will automatically:
   - Add any missing primary operations
   - Import all data from the Cover sheet
   - Import data from each Primary Operation sheet
   - Import compensation programs and tooling for each operation
   - Add secondary processes in the correct order
7. Review the success message to see what was imported

### Importing Tool Lists
1. Unlock the form (if locked)
2. Expand the "Import" widget in the sidebar
3. Expand the "Tool List" nested widget
4. Select an Excel file (.xls, .xlsx, .xlsm) or HTML file
5. Select which operations to import tools into
6. Click "Import Tools"

## Known Limitations

- Import only processes visible sheets (hidden sheets are automatically excluded)
- Runtime formatting attempts to handle common formats but may not cover all edge cases
- Secondary processes must have a description in A7 to be imported
- Tooling rows are only imported if the A cell (tool number) has data

## Future Enhancements

- Add validation for imported data
- Support for importing images from legacy files
- Batch import from multiple files
- Import history/undo functionality
- More robust runtime format detection











