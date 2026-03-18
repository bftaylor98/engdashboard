# Process Packet - Version 33.0

## Overview

This is a self-contained, single-file HTML application for creating and managing CNC Program Process Sheets (Process Packets). It replaces Excel-based process packets with a modern, web-based solution that works entirely offline. Version 33.0 adds a Notes widget displaying tool runout specifications when the form is locked. The application supports Hurco (blue) and Mazak (orange) dynamic theming in both dark and light modes.

## Project Structure

```
PP_Trial2/
├── index.html              # Main application file (single self-contained HTML)
├── README.md               # This documentation file
├── .gitignore             # Git ignore rules
│
├── server/                 # Server-based logging system (Version 19.0+)
│   ├── server.js           # Node.js + Express logging server
│   ├── package.json        # Node.js dependencies
│   ├── README.md           # Server setup and API documentation
│   ├── SETUP_WINDOWS_SERVER_2022.md  # Windows Server deployment guide
│   ├── DEPLOYMENT_GUIDE.md # Central server deployment instructions
│   ├── QUICK_START.md      # Quick reference guide
│   ├── TROUBLESHOOTING.md  # Troubleshooting guide
│   ├── CHANGES_SUMMARY.md  # Summary of logging system changes
│   └── logs/               # Log files directory (auto-created)
│
├── docs/                  # Documentation
│   ├── VERSION_32.0.md    # Version 32.0 release notes (light mode)
│   ├── VERSION_33.0.md    # Version 33.0 release notes (notes widget)
│   └── archive/           # Archived version files (v1.0–v31.0)
│       ├── VERSION_1.0.md  ... VERSION_31.0.md
│
├── data/                  # Data files (CSV, XLS for tool import)
│   ├── Book1.csv
│   ├── import4.xls
│   └── SSP_5_Ops.xls
│
└── examples/              # Example HTML files
    ├── Import_example_3.html
    ├── import_Example-2.html
    ├── Import_Example.html
    └── import4.html
```

## Key Features

### Core Functionality
- **Single File Solution**: Everything is in one HTML file - no external dependencies
- **Embedded Data Storage**: All form data is saved within the HTML file itself using a `<script id="embeddedData">` tag
- **File System Access API**: Uses Chrome/Edge File System Access API for Save/Open operations
- **Fallback Support**: Provides download/upload buttons for browsers without File System Access API
- **Tool Import**: Import tool data from Excel files (.xls, .xlsx) or HTML files with automatic grouping and duplicate handling
- **Print-Friendly**: Clean print styles that hide UI elements and format for paper

### Form Sections

1. **Job Information** (formerly "Cover / Job Header")
   - Part Description (editable title field)
   - Part Number, WO Number
   - Last Reviewed By (autocomplete dropdown)
   - Review Date
   - Material (dropdown select with predefined materials)
   - Current Program Revision (read-only, auto-updates from revision log)
   - Total Runtime (always auto-calculated, formatted as 45m, 1hr 45m, 2hrs)
   - Total Tooling Value (read-only, auto-calculated sum of all operation tooling values when form is locked)
   - Programmed For (Machine/Cell) - dropdown select (Hurco, Mazak)

2. **Operations** (Multiple, collapsible)
   - Each operation is numbered: "Primary Operation 1", "Primary Operation 2", etc.
   - All operations start collapsed by default (including first operation)
   - Only one operation can be expanded at a time (expanding one collapses others)
   - Each operation contains:
     - Program Information (Programmer, Description, Machine Type [Mill/Lathe/HBM], Program Name [auto-filled as A-, B-, C-{PartNumber}], Runtime [read-only, auto-calculated from tool runtimes])
     - Part Setup Information:
       - Axis X/Y/Z with autocomplete suggestions and individual Machine Coord fields
       - Axis W (only appears when Machine Type is HBM)
       - Fixture dropdown
       - Fixturing Notes
     - Compensation Programs table (optional, show/hide button)
     - Tooling Information table (add/remove rows, drag-and-drop reordering, cooling dropdown) - optimized column widths and consistent styling
     - Part Setup View (multiple image upload/paste with base64 storage, navigation arrows, image counter, icon buttons, "FRONT" label)
     - General Notes

3. **Revision Log**
   - Table with Date, Programmer, WO Number, Description, New Revision #
   - Add/remove rows
   - Consistent styling with other tables

### Widget Sidebar

A collapsible widget sidebar on the right side provides additional tools:

1. **Milling Calculator**
   - Calculate RPM and IPM from SFM, Tool Diameter, IPT, and # of Teeth
   - Real-time calculations as you type
   - Results rounded to whole numbers

2. **Drilling Calculator**
   - Calculate RPM and Feed Rate from SFM, Tool Diameter, and IPR
   - Real-time calculations as you type
   - Results rounded to whole numbers

3. **Request Assistance**
   - Select programmer from dropdown
   - Enter location
   - Sends request to Power Automate workflow via HTTP POST
   - Shows success/error feedback

4. **Tool Import** (Version 13.0+)
   - Import tool data from Excel files (.xls, .xlsx) or HTML files
   - Automatically detects header rows and groups tools
   - Supports multi-operation import with sequential mapping
   - Only visible when form is unlocked

5. **Quick Links**
   - Proshop: Direct link to est.adionsystems.com
   - Engineering Schedule: Direct link to SharePoint document
   - Tool Catalogs: Dropdown with 6 manufacturer catalogs (Allied, Harvey Tool, Moldino, Mitsubishi, OSG, Sumitomo)
   - All links open in new tabs

6. **TMS Tools** (Version 22.0+)
   - Parent widget with two nested sub-widgets:
     - **C-ID Lookup**: Lookup individual C-IDs to get description, part number, unit price, stock, and circulation
     - **Stock Check**: Check stock levels for all C-IDs in the form with color-coded results
   - Only visible when form is unlocked
   - Requires Python FastAPI server running (see server setup)

**Widget Behavior**:
- All widgets start collapsed by default
- Only one widget can be expanded at a time
- Widgets are hidden when printing
- Shape Palette, Workholding Palette, Quick Links, and Tool Import widgets only visible when form is unlocked
- Milling Calculator, Drilling Calculator, and Request Assistance widgets only visible when form is locked
- Widget sidebar scrolls with the page (sticky positioning)

### Dynamic Theming

The application supports machine-based color themes:
- **Hurco** (default): Blue/black gradient background, blue accents throughout
- **Mazak**: Orange/black gradient background, orange accents throughout

The theme switches automatically when "Programmed For" field in Job Information changes. The `mazak-theme` CSS class is added to the body element when Mazak is selected.

**Note**: Machine Type in operations (Mill/Lathe/HBM) does not affect theming - only the "Programmed For" field in Job Information controls the theme.

### Light Mode (Version 32.0+)

A sun icon toggle button in the header toolbar switches between dark mode and light mode:
- **Dark mode** (default): Black-based gradients with white text
- **Light mode**: White-based gradients with black text

Light mode works with both Hurco and Mazak themes. It is a display preference only — it does not save with the form. Each time a form is opened it defaults to dark mode. The toggle is functional in both locked and unlocked states. The `light-mode` CSS class is added to the body element when active.

### Multi-User Authentication

- **Password-Only Login**: Users enter their password (no username required)
- **Automatic User Identification**: System identifies user based on password
- **User Display**: Logged-in user's name displayed in header when unlocked
- **Individual Passwords**:
  - Alex Vincent - LSU0109
  - Brad Taylor - falcon9
  - Damien McDaniel - EstDamien1!
  - Michael Wardlow - @MLW1994!
  - Thad Slone - EdgeCAM-86
- **Security Messages**: Messages suggest user activity is being tracked to discourage password sharing

### Keyboard Shortcuts

- **ALT+L**: Toggle form lock/unlock state
  - When locked: Prompts for password to unlock
  - When unlocked: Locks immediately (no password needed)
  - Works from anywhere on the page

### Autocomplete Fields

The following fields have autocomplete functionality with Tab-key completion:
- **Programmer** (Operations): Thad Slone, Brad Taylor, Alex Vincent, Damien McDaniel, Mike Wardlow
- **Last Reviewed By**: Same list as Programmer
- **Axis X**: Center of Stock, Center of Part
- **Axis Y**: Center of Stock, Center of Part
- **Axis Z**: Top of Part, Top after skimming flat, Top after decking to thickness

Autocomplete works by:
1. Showing suggestions as you type (via HTML5 datalist)
2. Auto-completing on Tab key press (finds first match that starts with typed text)
3. All autocomplete fields allow typing custom values (not restricted to suggestions)

## Data Storage

### Embedded Data Format

Data is stored in a JSON script tag at the bottom of the HTML:
```html
<script id="embeddedData" type="application/json">
{
  "header": { ... },
  "operations": [ ... ],
  "revisionLog": [ ... ],
  "shapes": [ ... ]
}
</script>
```

### Save/Load Process

1. **Save**: 
   - Extracts current form data
   - Updates or creates the embedded data script tag
   - Writes entire HTML to file (File System Access API or download)

2. **Load**:
   - Reads HTML file
   - Extracts JSON from embedded data script tag
   - Populates all form fields and operations

### Data Structure

```javascript
{
  header: {
    partDescription: string,
    partNumber: string,
    soNumber: string,
    material: string,
    lastReviewedBy: string,
    reviewDate: string,
    currentRevision: string (read-only, auto-updated),
    totalRuntime: string (auto-calculated),
    programmedFor: string
  },
  operations: [
    {
      id: string,
      title: string,
      collapsed: boolean,
      programInfo: { engineer, operationDescription, machineType, programName, operationRuntime (read-only, auto-calculated) },
      partSetup: { 
        axisX, axisY, axisZ, axisW,
        axisXMachineCoord, axisYMachineCoord, axisZMachineCoord, axisWMachineCoord,
        fixture, fixturingNotes
      },
      compensationPrograms: [ ... ],
      showCompensationPrograms: boolean,
      tooling: [ ... ],
      image: string (base64 data URL),
      imageCaption: string,
      generalNotes: string
    }
  ],
  revisionLog: [
    {
      date: string,
      engineer: string,
      soNumber: string,
      description: string,
      newRevision: string
    }
  ],
  shapes: [
    {
      id: string,
      type: 'circle' | 'arrow' | 'rectangle' | 'notebox' | 'toeclamp' | 'veeblock' | '123block',
      operationIndex: number, // Associates shape with specific operation
      x: number,
      y: number,
      width: number,
      height: number,
      rotation: number (0-360),
      text: string (only for notebox)
    }
  ]
}
```

## Technical Details

### Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, fetch API support (for Power Automate integration)

### Key Functions

All user-facing functions are attached to `window` object for inline onclick handlers:
- `newDocument()` - Clears form and resets to blank (including widgets)
- `openDocument()` - Opens saved HTML file
- `saveDocument()` - Saves to current file handle
- `saveAsDocument()` - Creates new HTML file with embedded data
- `downloadHTML()` - Fallback download method
- `addOperation()` - Creates new operation block (collapsed by default)
- `removeOperation(index)` - Removes operation (renumbers remaining)
- `toggleOperation(index)` - Collapses/expands operation (collapses others)
- `addCompensationRow(opIndex)`, `addToolingRow(opIndex)` - Add table rows
- `removeTableRow(opIndex, tableType, rowIndex)` - Remove table row
- `toggleCompensationPrograms(opIndex)` - Shows/hides compensation programs section
- `updateBackgroundColor()` - Updates theme based on machine selection
- `updateProgramNames()` - Auto-fills program names based on part number
- `updateCurrentRevision()` - Updates current revision from revision log
- `calculateOperationRuntime(opIndex)` - Calculates operation runtime from tool runtimes
- `updateOperationRuntime(opIndex)` - Updates operation runtime display
- `formatRuntime(minutes)` - Formats runtime to readable format
- `formatRuntimeInput(input)` - Formats runtime on input blur
- `setupAutocomplete(fieldId, options)` - Sets up Tab-key autocomplete for header fields
- `setupAutocompleteForField(field, options)` - Sets up Tab-key autocomplete for any field
- `toggleWidget(widgetId)` - Collapses/expands widget (collapses others)
- `calculateMilling()` - Calculates RPM and IPM for milling operations
- `calculateDrilling()` - Calculates RPM and Feed Rate for drilling operations
- `sendAssistanceRequest()` - Sends assistance request to Power Automate
- `toggleLock()` - Toggles form lock state with password authentication
- `updateUserDisplay()` - Updates visual user display indicator
- `openToolCatalog(url)` - Opens selected tool catalog in new tab
- `setupDragAndDrop(containerId, opIndex, tableType)` - Sets up drag-and-drop for tool rows
- `handleShapeDragStart(event)` - Initiates drag from shape palette
- `handleShapeDrop(event)` - Handles shape/workholding drop on operation image containers
- `renderShapes()` - Renders all placed shapes for expanded operations only
- `removeShape(shapeId)` - Removes a shape
- `startResize(shapeId, handle, e)` - Initiates shape resize
- `stopResize()` - Completes resize operation
- `startRotate(shapeId, e)` - Initiates shape rotation
- `stopRotate()` - Completes rotation operation
- `parseToolImportExcel(fileContent, fileName)` - Parses Excel files for tool import (Version 13.0+)
- `parseToolRowsFromExcel(data, startRow, endRow, headerRow)` - Helper function to parse tool rows from Excel data
- `handleFileSelection()` - Handles file selection for tool import (supports Excel and HTML files)
- `updateOperationCheckboxes()` - Updates operation selection checkboxes for tool import
- `confirmToolImport()` - Imports parsed tool data to selected operations

### Reference Data (Phase 2 Ready)

The `referenceData` object contains dropdown and autocomplete options:
```javascript
referenceData = {
  engineers: ['Thad Slone', 'Brad Taylor', 'Alex Vincent', 'Damien McDaniel', 'Mike Wardlow'],
  machineTypes: ['Hurco', 'Mazak'], // For "Programmed For" in header
  operationMachineTypes: ['Mill', 'Lathe', 'HBM'], // For "Machine Type" in operations
  axisSuggestions: {
    X: ['Center of Stock', 'Center of Part'],
    Y: ['Center of Stock', 'Center of Part'],
    Z: ['Top of Part', 'Top after skimming flat', 'Top after decking to thickness']
  },
  fixtureTypes: ['Vise', 'Chuck', 'Angle Plate', 'Magnet'],
  materials: ['4140 PH', 'F-Xtra T2', 'F-Xtra T1', 'H13 Tool Steel', 'S7 Tool Steel', 'A2 Tool Steel', 'D2 Tool Steel', 'CRS', 'HRS', '6061 Aluminum', 'Stainless Steel'],
  coolingTypes: ['Flood', 'Air', 'CTS', 'ATS', 'Superflow']
}
```

**For Phase 2**: Replace `loadReferenceData()` function with a fetch call to load from server. The structure is already isolated for easy replacement.

### CSS Architecture

- Default styles use blue color scheme (#4169E1, #003366)
- Mazak theme uses orange color scheme (#ff6600, #cc5500)
- Theme switching via `body.mazak-theme` class
- Light mode overrides via `body.light-mode` class (~480 rules)
- Dark mode throughout by default with light text on dark backgrounds
- Print styles hide UI elements and format for paper

## Usage Instructions

### Creating a New Setup Sheet
1. Open `index.html` in Chrome or Edge
2. Fill out the form
3. Click "Save As" to create a new file
4. The saved file contains all data embedded within it

### Opening an Existing Setup Sheet
1. Click "Open" button
2. Select the saved HTML file
3. All data loads automatically

### Adding Operations
1. Click "+ Add Operation" button
2. Operations are numbered sequentially
3. Click ▼ button to collapse/expand operations

### Image Upload
- Click "Upload Image" or "Paste Image"
- Images are stored as base64 data URLs within the HTML

### Tool Import (Version 13.0+)
1. **Unlock the form** (Tool Import widget is only visible when unlocked)
2. **Open Tool Import widget** in the widget sidebar
3. **Select Excel file** (.xls or .xlsx) - HTML files are also supported for backward compatibility
4. **Select operations** - Check the boxes next to the operations you want to import tools to (in order)
5. **Click "Import Tools"** - Tools will be imported to the selected operations sequentially
   - First tool group → First selected operation
   - Second tool group → Second selected operation
   - And so on...

**Features**:
- **Automatic Grouping**: Tools are automatically grouped by header rows in the Excel file
- **Consecutive Duplicate Handling**: If the same tool appears multiple times in a row, their runtimes are combined
- **Data Formatting**: 
  - Stickout values are rounded up to 2 decimal places
  - Radius values with leading zeros are cleaned (0.13 → .13)
  - Empty radius values become "N/A"
  - "Off" coolant values are left blank
  - Runtime values are converted from HH:MM:SS to readable format (3m, 1hr 45m)
- **Multi-Operation Support**: Import multiple tool groups to multiple operations at once
- Saved files are fully portable (no external image files needed)

## Known Limitations / Considerations

1. **File Size**: Large images stored as base64 can make HTML files large
2. **Browser Cache**: Hard refresh (Ctrl+Shift+R) may be needed after code changes
3. **Validation**: Missing required fields are highlighted but no banner warning (removed per user request)
4. **Single File**: All code is in one file - can be large but ensures portability

## For Next Agent / Version 15

### What to Preserve
- Single-file architecture
- Embedded data storage mechanism
- File System Access API with fallback
- All functionality (save, load, operations, tables, images)
- Autocomplete functionality with Tab-key completion
- Machine-based theming system
- 90% width layout for better space utilization
- Consistent table styling (Tooling Information, Revision Log, Compensation Programs)
- Widget sidebar system with collapsible widgets
- Power Automate integration for Request Assistance
- Auto-calculated operation runtimes from tool runtimes
- Drag-and-drop tool row reordering
- Data syncing before all render operations
- Cooling dropdown field with custom styling
- Optimized column widths based on character requirements
- Abbreviated headers (S.O., R.O., INIT, Set)
- Delete button tooltip in hamburger icon
- Enhanced operation preservation with backup/restore
- Shape Palette feature with all shape types and functionality
- Workholding Palette feature with all workholding items
- Operation-scoped shapes (collapse/expand with operations)
- Shape resize, rotation, and deletion features
- Note box text editing and centering
- Shape lock state integration (disabled when locked)
- Sticky widget sidebar that scrolls with page
- Editable part description title field
- Discreet Mastercam-style icon buttons in header
- WO Number hyperlink functionality when locked
- ALT+L keyboard shortcut for lock/unlock
- ISO-9001 form number footer
- Multi-user authentication system with individual passwords
- Visual user display indicator
- Quick Links widget with external resources
- Operations expandable/collapsible when locked
- Image upload restrictions when locked
- Operation removal confirmation dialog
- All Version 10.0 and 11.0 features and improvements
- Tool autofill system with 36-tool library
- Password masking modal
- CTS water graphic banner
- Complex radius handling
- N/A radius autofill fix (Version 12.0)
- Required field validation for tooling information
- Tab navigation preservation after autofill
- Multiple setup images with navigation (Version 14.0)
- Enhanced validation with red border highlighting
- Remove Operation button visibility control
- SET and INIT fields editable when locked

### Critical Issues to Resolve
- None - all outstanding issues resolved in Version 12.0

### Areas for Enhancement
- Additional calculator widgets as needed
- Widget state persistence (optional)
- Additional Power Automate integrations
- Server integration for reference data (Phase 2)
- Additional validation or features as needed
- Revision log collapsible functionality (if desired)
- Additional shape types
- Additional workholding items
- Shape grouping/alignment features
- Copy/paste shapes

### Reverting to Version 10.0

If you need to revert changes:
1. The current `index.html` represents Version 10.0
2. Save a backup before making changes
3. All functionality is documented above
4. Key functions are listed in "Key Functions" section
5. See VERSION_10.0.md for detailed change log

## Development Notes

### Adding New Fields
1. Add HTML input in appropriate section
2. Add to `getFormData()` function
3. Add to `setFormData()` function
4. Add to `syncData()` if needed for real-time updates

### Adding New Reference Data
1. Add to `referenceData` object
2. Add datalist population in `loadReferenceData()`
3. Add autocomplete setup if needed

### Modifying Colors
- Default (Hurco): Search for `#4169E1` and `#003366`
- Mazak theme: Search for `body.mazak-theme` and `#ff6600`
- Background gradient: See `updateBackgroundColor()` function

## Support

This is a self-contained application. No server or build process required. Simply open `index.html` in a browser.

---

**Version**: 33.0  
**Last Updated**: February 18, 2026  
**Status**: Production Ready

## Outstanding Issues

⚠️ **Endpoint Connectivity Issue**: When tested on endpoint (not localhost), data was not received by the server. This is expected to be resolved once the server is hosted on its final workstation. The issue is likely related to network configuration, firewall rules, or server URL configuration when server and clients are on different networks. This will be addressed during final deployment.

## Version History

### Version 33.0 (Current)
- **Notes Widget**: New widget displaying tool runout specifications when form is locked
- **Tool Runout Table**: 2x2 table showing maximum radial runouts for roughing tools (.005") and finish tools (.002")
- **Theme-Aware Styling**: Text color adapts to theme (white in dark mode, red in light mode)
- **Positioned Below Info Box**: Notes widget appears below the Info Box widget in the sidebar
- See `docs/VERSION_33.0.md` for complete details

### Version 32.0
- **Light Mode Toggle**: Sun icon button in header toolbar to switch between dark and light mode
- **Help Widget Update**: Added light mode instructions to the locked-state Help widget
- **Performance Fix**: Removed `renderShapes()` from `updateBackgroundColor()` to eliminate toggle lag
- **h2 Header Fix**: Section headers now properly convert backgrounds in light mode
- **Rebased on V31**: Ensures all V27–V31 features are intact (Help widget, Info Box, Tools Locked, IndexedDB, 8-min auto-lock)
- See `docs/VERSION_32.0.md` for complete details

### Version 31.0
- **State Snapshot**: Checkpoint capturing stable state of the application
- **Version Archive**: Moved VERSION_1.0–29.0 to `docs/archive/` for cleaner project organization
- See `docs/VERSION_31.0.md` for complete details

### Version 30.0
- **Ctrl+Click Multi-Expand**: Hold Ctrl/Cmd while clicking operation arrows to expand multiple operations simultaneously
- Default one-at-a-time accordion behavior unchanged
- See `docs/archive/VERSION_30.0.md` for complete details

### Version 29.0
- **Machinist Notes**: New editable notes field per operation (editable only in locked mode)
- **Column Scaling Fix**: Fixed column min-width issues on high-DPI monitors
- See `docs/archive/VERSION_29.0.md` for complete details

### Version 28.0
- **Tool Import Fixes**: Text formatting, tool import parsing, and form auto-lock timing fixes
- **8-Minute Auto-Lock**: Changed from 3-minute to 8-minute auto-lock timer
- See `docs/archive/VERSION_28.0.md` for complete details

### Version 27.0
- **Multi-Bug Fix Release**: 9 bug fixes spanning dropdown population, lock/unlock behavior, time parsing, and program name generation
- See `docs/archive/VERSION_27.0.md` for complete details

### Version 26.0
- **Tool Import Cooling Fix**: Fixed cooling extraction from Excel files
- **Auto-Fill Descriptions**: New TMS Tools auto-fill functionality
- **Widget Organization**: Improved widget visibility for locked forms
- See `docs/archive/VERSION_26.0.md` for complete details

### Version 25.0
- **Legacy Import**: Import data from legacy Excel (.xlsm) process packets
- **Import Widget Reorganization**: Unified parent widget structure
- See `docs/archive/VERSION_25.0.md` for complete details

### Version 24.0
- **Tooling Table Layout**: Removed SET column, increased ID and T# column widths
- See `docs/archive/VERSION_24.0.md` for complete details

### Version 23.0
- **Tooling Time Field Fix**: Fixed non-editable Time field in Tooling Information table
- See `docs/archive/VERSION_23.0.md` for complete details

### Version 22.0
- **TMS Tools Integration**: New widget with C-ID lookup and stock check capabilities
- **Python FastAPI Server**: New server component for database queries (see `server/cid_api_server.py`)
- **Tooling Value Calculation**: Auto-calculated tooling value per operation and total tooling value in Job Information
- **Connection Warmup**: Pre-establishes database connections when form unlocks for faster first use
- **Stock Check Widget**: Check all C-IDs in form with color-coded results (green/yellow/red)
- **C-ID Lookup Widget**: Individual C-ID lookup with description, part number, price, and stock info
- See `docs/archive/VERSION_22.0.md` for complete details

### Version 21.0
- ✅ Widget reorganization with parent/child structure
- ✅ Palette widget containing Shape and Workholding palettes
- ✅ Operations Functions widget containing Move and Insert operations
- ✅ Nested widget collapse/expand functionality
- ✅ Improved widget organization and visual hierarchy
- ✅ Fixed nested widget collapse bug

### Version 20.0
- ✅ Text Formatting widget with full formatting capabilities
- ✅ 9 formattable fields (notes, axis, tooling)
- ✅ Bold, italic, underline, colors, font sizes
- ✅ HTML content storage and preservation
- ✅ Fixed Tool Import widget collapse issue
- ✅ Widget auto-visibility on field focus

### Version 19.0
- ✅ Server-based edit logging system
- ✅ Centralized logging from multiple endpoints
- ✅ Human-readable text and JSON log formats
- ✅ Automatic change tracking (10-second flush interval)
- ✅ Client/endpoint identification
- ✅ Fixed CORS and null reference errors
- ⚠️ Known issue: Endpoint connectivity (see Outstanding Issues)

### Version 18.0
- ✅ Fixed Insert Operation buttons
- ✅ Improved error handling with secondary processes
- ✅ Hidden Add Operation buttons when locked
- ✅ Enhanced data synchronization
- ✅ All known issues from Version 17.0 resolved

### Version 17.0
- Secondary Processes feature (heat treat, grinding, welding, etc.)
- Red styling for secondary processes
- Add Secondary Process button
- Combined Insert Operation widget
- Independent operation numbering
- ⚠️ Known issue: Insert Operation buttons not working

### Version 16.0
- Move Operations widget for reordering operations
- Insert Operation widget for inserting new operations
- Automatic operation label and program name updates

### Version 15.0
- Professional directory structure reorganization (docs/, data/, examples/)
- Enhanced file naming: "(Part Number) Part Description - Process Packet.html"
- Browser tab title changed to "Process Packet"
- Form Feedback widget for locked state (sends to Power Automate)
- Metric Converter widget (mm ↔ inches conversion)
- Quick Links widget for locked state with FSWizard link
- Fixture field enhanced with typing support and "Clamps" option

### Version 14.0
- Multiple setup images per operation with navigation arrows
- Image counter display (Image 1 of 3)
- Enhanced form validation with red border highlighting for empty required fields
- Remove Operation buttons hidden when form is locked
- SET and INIT fields now properly editable when form is locked
- Added "Angle Plate & Magnet" to fixture dropdown
- Removed "Cutting Oil" from cooling dropdown (kept "Oil")
- Total Runtime formatting matches Operation Runtime (readonly, "Auto-calculated" placeholder)

### Version 13.0
- Excel file support for tool import (.xls, .xlsx, .xlsm)
- Improved tool import reliability with SheetJS library
- Backward compatible HTML file import still supported

### Version 12.0
- Fixed N/A radius autofill issue - tools with "N/A" radius now properly autofill Rad field
- Added required field validation to tooling information (T#, Description, Rad, SO, Holder, Cooling, Time)
- Fixed tab navigation after autofill - focus now moves to next field instead of resetting
- Improved user experience with preserved tab order

### Version 11.0
- Tool autofill system with 36-tool library
- Password input masking with custom modal
- CTS water graphic banner (when locked, Hurco, and CTS cooling present)
- User display indicator fix (now properly visible)
- Additional cooling types (Oil, Cutting Oil)
- Complex radius handling (leaves blank, highlights red)
- **Known Issue**: N/A radius values not autofilling (RESOLVED in Version 12.0)

### Version 10.0
- Multi-user authentication system with individual passwords
- Password-only login (no username required)
- Visual user display indicator showing logged-in user
- Quick Links widget with Proshop, Engineering Schedule, and Tool Catalogs
- Tool Catalogs dropdown with 6 manufacturers (Allied, Harvey Tool, Moldino, Mitsubishi, OSG, Sumitomo)
- Operations can be expanded/collapsed when form is locked
- Image upload/paste/remove disabled when form is locked
- Confirmation dialog when removing operations
- Enhanced security messages to discourage password sharing

### Version 9.0
- Editable part description title field (replaces "Program Process Sheet" heading)
- Discreet Mastercam-style icon buttons in header (New, Save, Save As, Lock)
- WO Number field becomes clickable hyperlink when form is locked
- ALT+L keyboard shortcut to toggle lock/unlock
- Changed "SO Number" to "WO Number" throughout application
- Updated Fixture dropdown (Vise, Chuck, Angle Plate, Magnet)
- Changed "Image Caption/Notes" to "FRONT" in Part Setup View
- Changed "Engineer" to "Programmer" in Revision Log
- Removed toolbar (buttons moved to header)
- Added ISO-9001 form number footer: "FRM-PRD-35 Trial Revision"
- Improved button styling with hover effects and tooltips

### Version 8.0
- Workholding Palette widget added with CNC workholding items (Toe Clamp, Vee Block, 1-2-3 Block)
- Workholding items are resizable, rotatable, and deletable
- Shapes and workholding items are scoped to operations (collapse/expand with operation)
- Shapes can only be placed in operation image containers (Part Setup View area)
- Shapes are disabled when form is locked (no move, resize, rotate, or edit)
- Widget sidebar scrolls with the page (sticky positioning)
- Custom SVG paths for workholding items with tight bounding boxes
- Operation-scoped shape persistence and positioning

### Version 7.0
- Shape Palette widget added with draggable shapes (Circle, Arrow, Rectangle, Note Box)
- Shapes are resizable, rotatable, and deletable
- Note boxes support editable text with white text on red background
- Text wrapping and vertical centering for note boxes
- Shapes persist with document (saved in embedded data)
- Shape Palette only visible when form is unlocked
- Shapes hidden when printing
- Rotation handle on NW corner, delete button on NE corner

### Version 6.0
- Cooling field changed to dropdown select (Flood, Air, CTS, ATS, Superflow)
- Optimized tooling table column widths based on character requirements
- Abbreviated headers: Stickout→S.O., Runout→R.O., Initials→INIT, Preset→Set
- Delete button moved to hamburger tooltip (discreet X appears on hover)
- Removed actions column from tooling table (saves 40px space)
- Enhanced operation preservation with deep backup/restore system
- Improved sync functions to handle collapsed operations gracefully
- Updated character limits for all tooling table fields

### Version 5.0
- Auto-calculated operation runtimes from tool runtimes (read-only field)
- Drag-and-drop reordering for tool rows with hamburger icon
- Fixed data persistence issues (image upload, theme restoration, dropdown restoration)
- Removed programmer field from Job Information
- Updated Material dropdown with new material list
- Rearranged Job Information fields (Last Reviewed By, Review Date, Material)
- All operations collapsed by default (including first operation)
- Fixed widget header styling (single line in both themes)
- Enhanced data syncing to prevent operation deletion when adding tool rows

### Version 4.0
- Widget sidebar system added on the right side of the form
- Milling Calculator widget: Calculate RPM and IPM from SFM, Tool Dia, IPT, and # of Teeth
- Drilling Calculator widget: Calculate RPM and Feed Rate from SFM, Tool Dia, and IPR
- Request Assistance widget: Power Automate-integrated assistance request system
- Widget collapse/expand functionality: Only one widget expanded at a time, all start collapsed
- Visual improvements: Headings and operation titles changed to white text (removed gradients)
- Layout updates: Flexbox layout to accommodate widget sidebar

### Version 3.0
- Form width increased to 90% for better space utilization
- Tooling Information table improvements:
  - Updated header text (C-ID→ID, Tool #→T#, Corner→Rad, Runout Req.→Runout, Holder Type→Holder, Runtime→Time)
  - Narrowed ID and Rad columns (55px), T# column (60px)
  - Increased Description column width (350px min-width)
  - Consistent input height (32px) and center-aligned text
  - Reduced cell padding (6px) and thinner header row (8px 10px)
  - Smaller X button in Actions column (24px min-width, centered)
  - Character limits for narrow columns (6 max)
- Applied consistent styling to Revision Log and Compensation Programs tables
- All tables now have unified, professional appearance

### Version 2.0
- Form width set to 80% (left-aligned) for 24" monitors
- Part Setup Information made smaller with image section on the right
- Removed Program Adjustments, Request Assistance, and Program Feedback sections
- Made Compensation Programs optional (show/hide)
- Changed Machine Type in operations to Mill/Lathe/HBM
- Added axis autocomplete suggestions with Tab-key completion
- Individual machine coordinate fields for each axis
- W axis only appears for HBM machine type
- Removed A and B axis fields
- Auto-fill program names based on part number (A-, B-, C- prefixes)
- Runtime always auto-calculates with enforced formatting (45m, 1hr 45m, 2hrs)
- Current Program Revision auto-updates from revision log
- Only one operation expanded at a time
- Reduced button prominence in image section
- Enhanced autocomplete functionality throughout

### Version 1.0
- Initial release
- Single-file self-contained solution
- Embedded data storage
- Collapsible operations
- Machine-based theming (Hurco blue / Mazak orange)
- Autocomplete fields
- Print-friendly styling
- Dark mode UI

