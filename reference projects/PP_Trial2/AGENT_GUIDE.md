# Agent Onboarding Guide - Process Packet Application

## Quick Start

This is a **single-file HTML application** for creating and managing CNC Program Process Sheets (Process Packets). Everything is contained in `index.html` - no build process, no external dependencies (except CDN libraries).

## Project Overview

### What It Does
- Replaces Excel-based process packets with a modern, web-based solution
- Works entirely offline (single HTML file)
- Stores all data embedded within the HTML file itself
- Supports multiple operations, tooling information, setup images, and revision tracking

### Current Version
- **Version**: 21.0
- **Status**: Stable
- **Main File**: `index.html` (9,149 lines)

## Project Structure

```
PP_Trial2/
├── index.html              # Main application (ALL code is here)
├── README.md               # Main documentation
├── AGENT_GUIDE.md         # This file
├── .gitignore             # Git ignore rules
│
├── docs/                   # Version documentation
│   ├── VERSION_1.0.md through VERSION_18.0.md
│
├── data/                   # Data files (CSV, XLS for tool import)
│
└── examples/               # Example HTML files
```

## Key Architecture Points

### Single-File Design
- **Everything is in `index.html`**: HTML, CSS, and JavaScript all in one file
- **No build process**: Just edit and open in browser
- **Embedded data storage**: Form data is saved in a `<script id="embeddedData">` tag at the bottom

### Data Storage
- Data is stored as JSON in a script tag: `<script id="embeddedData" type="application/json">`
- When saving: Extracts form data → Updates embedded script tag → Writes entire HTML
- When loading: Reads HTML → Extracts JSON from script tag → Populates form

### Lock/Unlock System
- **Locked state**: Form is read-only, certain widgets visible (calculators, feedback)
- **Unlocked state**: Form is editable, different widgets visible (shape palette, tool import)
- Toggle with ALT+L keyboard shortcut or lock button
- Password authentication for unlocking

## Important Functions & Patterns

### Core Functions (Attached to `window` for inline handlers)
```javascript
// File operations
newDocument()              // Clear form and start fresh
openDocument()             // Open saved HTML file
saveDocument()             // Save to current file handle
saveAsDocument()           // Save with new filename
generateSaveFileName()     // Creates: "(Part Number) Part Description - Process Packet.html"

// Operations
addOperation()             // Add new operation block
removeOperation(index)     // Remove operation
toggleOperation(index)     // Expand/collapse operation

// Data management
syncData()                 // Sync form data to operations array
getFormData()              // Extract all form data
setFormData(data)          // Populate form from data

// Widgets
toggleWidget(widgetId)     // Collapse/expand widget
calculateMilling()         // Milling calculator
calculateDrilling()        // Drilling calculator
convertMetric()            // Metric converter (mm ↔ inches)
sendAssistanceRequest()   // Request assistance (Power Automate)
sendFormFeedback()         // Form feedback (Power Automate)

// Lock system
toggleLock()               // Toggle lock/unlock with password
applyLockState()           // Show/hide widgets based on lock state
```

### Data Structure
```javascript
{
  header: {
    partDescription: string,
    partNumber: string,
    soNumber: string,        // WO Number
    material: string,
    lastReviewedBy: string,
    reviewDate: string,
    currentRevision: string,  // Read-only, auto-updated
    totalRuntime: string,      // Auto-calculated
    programmedFor: string     // Hurco or Mazak
  },
  operations: [
    {
      id: string,
      title: string,
      collapsed: boolean,
      programInfo: { ... },
      partSetup: { ... },
      compensationPrograms: [ ... ],
      tooling: [ ... ],
      images: [ ... ],         // Array of base64 images
      currentImageIndex: number,
      generalNotes: string
    }
  ],
  revisionLog: [ ... ],
  shapes: [ ... ]
}
```

## Widget System

### Widget Visibility Rules

**Visible when UNLOCKED:**
- Shape Palette
- Workholding Palette
- Tool Import
- Quick Links (unlocked version)

**Visible when LOCKED:**
- Milling Calculator
- Drilling Calculator
- Metric Converter
- Request Assistance
- Form Feedback
- Quick Links (locked version with FSWizard)

### Widget Structure
```html
<div class="widget">
  <div class="widget-header">
    <h3>Widget Name</h3>
    <button onclick="toggleWidget('widgetId')" class="widget-collapse-btn">
      <span class="widget-collapse-icon" id="widgetIdIcon">▼</span>
    </button>
  </div>
  <div class="widget-content collapsed" id="widgetIdContent">
    <!-- Widget content -->
  </div>
</div>
```

## Common Tasks & How-To

### Adding a New Field
1. Add HTML input in appropriate section
2. Add to `getFormData()` function
3. Add to `setFormData()` function
4. Add to `syncData()` if needed for real-time updates
5. Add data attribute: `data-section="sectionName" data-field="fieldName"`

### Adding a New Widget
1. Add widget HTML in widget sidebar
2. Add visibility logic in `applyLockState()` function
3. Add to widget collapse lists: `allWidgetIds` array
4. Add function to `window` object if needed for inline handlers
5. Add CSS styling if needed

### Adding Reference Data (Dropdown Options)
1. Add to `referenceData` object
2. Add datalist population in `loadReferenceData()` or operation render
3. Add autocomplete setup if needed: `setupAutocompleteForField()`

### Modifying Colors/Themes
- **Hurco (default)**: Search for `#4169E1` and `#003366`
- **Mazak theme**: Search for `body.mazak-theme` and `#ff6600`
- **Light mode**: Search for `body.light-mode` — ~480 CSS override rules
- Theme switches based on "Programmed For" field in Job Information
- Light mode toggled via sun icon button; uses `body.light-mode` class on `<body>`

### Adding Autocomplete Field
```javascript
// 1. Change <select> to <input> with <datalist>
<input type="text" id="fieldId" list="fieldIdList">
<datalist id="fieldIdList"></datalist>

// 2. Populate datalist
populateDatalist('fieldIdList', referenceData.options);

// 3. Setup Tab-key autocomplete
setupAutocompleteForField(fieldElement, referenceData.options);
```

## Key Code Locations

### File Operations
- **Save/Load**: Lines ~5011-5066
- **Filename generation**: `generateSaveFileName()` function
- **Embedded data**: `generateHTMLWithData()` function

### Form Rendering
- **Operations render**: `renderOperations()` function (~3200-3600)
- **Tables render**: `renderTable()` function
- **Data syncing**: `syncData()` function

### Lock System
- **Lock toggle**: `toggleLock()` function
- **Visibility control**: `applyLockState()` function (~2848-2950)
- **Password authentication**: User passwords in code

### Widgets
- **Widget HTML**: Lines ~2129-2455 (widget sidebar)
- **Widget functions**: Various locations (calculators, converters, etc.)

### Reference Data
- **Definition**: `referenceData` object (~2460)
- **Loading**: `loadReferenceData()` function
- **Autocomplete setup**: `setupAutocompleteForField()` function

## Important Patterns

### Operation Data Attributes
Fields use data attributes for identification:
```html
<input data-op="${index}" data-section="partSetup" data-field="axisX">
```
- `data-op`: Operation index
- `data-section`: Section name (programInfo, partSetup, etc.)
- `data-field`: Field name

### Event Listeners
- Many fields use inline `oninput` handlers
- Tab-key autocomplete uses `addEventListener('keydown')`
- Data syncing happens on input events

### Widget Collapse System
- Only one widget expanded at a time
- Uses `toggleWidget()` function
- Widgets start collapsed by default

## Power Automate Integration

### Request Assistance
- URL: (see code for current URL)
- Payload: `{ requestedPerson: string, location: string }`
- Function: `sendAssistanceRequest()`

### Form Feedback
- URL: (see code for current URL)
- Payload: `{ name: string, message: string }`
- Function: `sendFormFeedback()`

## Browser Support

- **Primary**: Chrome 86+, Edge 86+ (File System Access API)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, fetch API support

## Testing Checklist

When making changes, test:
1. ✅ Create new document
2. ✅ Add/remove operations
3. ✅ Fill out form fields
4. ✅ Save file
5. ✅ Open saved file
6. ✅ Lock/unlock form
7. ✅ Widget visibility (locked vs unlocked)
8. ✅ Tool import functionality
9. ✅ Image upload/paste
10. ✅ Print preview

## Common Issues & Solutions

### Data Not Saving
- Check `syncData()` is called before save
- Verify data attributes on inputs
- Check `getFormData()` includes the field

### Widget Not Showing
- Check `applyLockState()` visibility logic
- Verify widget ID matches
- Check if widget is in correct lock state

### Autocomplete Not Working
- Verify datalist is populated
- Check `setupAutocompleteForField()` is called
- Ensure field has correct data attributes

### Theme Not Switching
- Check `updateBackgroundColor()` function
- Verify "Programmed For" field value
- Check CSS for `body.mazak-theme` class

### Light Mode Not Working
- Verify `toggleLightMode()` function exists and is called by the sun button's `onclick`
- Check that `body.light-mode` class is being toggled on `<body>`
- Verify `updateBackgroundColor()` checks for `light-mode` class and uses `#ffffff` base
- Check that light mode CSS overrides use `!important` to beat inline styles
- Ensure `generateHTMLWithData()` strips `light-mode` before saving

## Version History

- **Version 33.0** (Current): Notes widget with tool runout specifications
- **Version 32.0**: Light mode toggle, h2 header fix, performance fix, rebased on V31
- **Version 31.0**: State snapshot, version archive reorganization
- **Version 30.0**: Ctrl+Click multi-expand for operations
- **Version 29.0**: Machinist Notes, column scaling fix
- **Version 28.0**: Tool import fixes, 8-minute auto-lock
- **Version 27.0**: Multi-bug fix release (9 bugs)
- **Version 26.0**: Tool import cooling fix, auto-fill descriptions, widget improvements
- **Version 25.0**: Legacy process packet import, import widget reorganization
- **Version 24.0**: Tooling table layout improvements
- **Version 23.0**: Tooling time field fix
- **Version 22.0**: TMS Tools integration, tooling value calculation
- **Version 21.0**: Widget reorganization with parent/child structure
- **Version 20.0**: Text Formatting widget
- **Version 19.0**: Server-based edit logging system
- **Version 18.0**: Fixed Insert Operation buttons, improved error handling
- See `docs/VERSION_*.md` and `docs/archive/VERSION_*.md` for detailed change logs

## Next Steps for New Features

1. **Read the current version docs**: `docs/VERSION_33.0.md`
2. **Understand the data structure**: Check `getFormData()` and `setFormData()`
3. **Find similar features**: Search for similar functionality to understand patterns
4. **Test thoroughly**: Single-file apps can be tricky - test all scenarios
5. **Update documentation**: Add to version docs and README when done

## Important Notes

- **Single-file architecture**: All code must stay in `index.html`
- **Backward compatibility**: Old saved files must still open
- **Data migration**: If changing data structure, add migration code
- **No external dependencies**: Only CDN libraries allowed (SheetJS for Excel)
- **Offline-first**: Must work without internet connection

## Quick Reference

### Find Functions
- Search for function name in code
- Functions attached to `window` are accessible from inline handlers
- Check function comments for usage

### Find Widgets
- Search for widget name in HTML
- Check `applyLockState()` for visibility rules
- Look for widget ID in `toggleWidget()` calls

### Find Fields
- Search for field name or label
- Check data attributes: `data-section` and `data-field`
- Look in `getFormData()` and `setFormData()` functions

---

**Last Updated**: Version 33.0  
**For Questions**: Refer to README.md and version documentation in `docs/` and `docs/archive/`

