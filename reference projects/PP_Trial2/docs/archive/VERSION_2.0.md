# Version 2.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 2.0 includes significant UI/UX improvements, enhanced functionality, and streamlined form fields. The form is now optimized for 24" monitors with improved layout and autocomplete features.

## New Features & Changes

### Layout & Design
- **Form Width**: Changed to 80% of screen width, left-aligned (leaving 20% for future buttons)
- **Part Setup Information**: Made smaller (45% width) with Part Setup View moved to the right (50% width)
- **Image Section**: Reduced button prominence (icon buttons: ⬆ Upload, 📋 Paste, ✕ Remove)
- **Image Section Title**: Changed from "Tool Setup / Part Setup View" to "Part Setup View"

### Field Changes
- **Job Information Section**:
  - Changed "Cover / Job Header" to "Job Information"
  - Removed "SPECIFY (additional details)" field
  - Changed "Engineer / Programmer" to "Programmer"
  - Current Program Revision is now read-only, defaults to "A", and auto-updates from Revision Log

- **Operations**:
  - Changed "Engineer" to "Programmer" (capitalized)
  - Machine Type options changed from Hurco/Mazak to Mill/Lathe/HBM
  - W axis only appears when Machine Type is set to HBM
  - Removed A and B axis fields
  - Removed "Program Datum" field
  - Removed "Machine Coordinates" field (replaced with individual machine coord fields per axis)

### Runtime & Calculations
- **Auto-Calculate Runtime**: Always enabled (removed checkbox toggle)
- **Runtime Formatting**: Enforced format (45m, 1hr 45m, 2hrs) - no "45 mins" or "1.75hrs"
- **Program Name Auto-Fill**: Automatically generates based on part number:
  - Operation 1: A-{PartNumber}
  - Operation 2: B-{PartNumber}
  - Operation 3: C-{PartNumber}
  - etc.
  - Can be manually edited (auto-fill stops once edited)

### Autocomplete & Dropdowns
- **Programmer Fields**: Autocomplete with datalist (can type custom values or select from suggestions)
- **Axis Fields**: Autocomplete with suggestions:
  - X: "Center of Stock", "Center of Part"
  - Y: "Center of Stock", "Center of Part"
  - Z: "Top of Part", "Top after skimming flat", "Top after decking to thickness"
- **Tab-Key Autocomplete**: All autocomplete fields support Tab-key completion
- **Machine Type**: Dropdown select (Mill, Lathe, HBM)
- **Fixture**: Dropdown select
- **Programmed For**: Dropdown select (Hurco, Mazak) - still in header

### Axis & Machine Coordinates
- **Individual Machine Coordinate Fields**: Each axis (X, Y, Z, W) has its own "Machine Coord" field
- **Axis Layout**: 2-column grid layout for better space utilization
- **W Axis**: Only visible when Machine Type is HBM

### Removed Sections
- **Program Adjustments** table (removed from operations)
- **Request Assistance** section (removed from operations)
- **Program Feedback** section (removed from operations)

### Optional Sections
- **Compensation Programs**: Now optional with Show/Hide button (defaults to hidden)

### Operation Management
- **Single Expanded Operation**: Only one operation can be expanded at a time
- **Auto-Collapse**: Expanding an operation automatically collapses others
- **New Operations**: New operations are expanded, others collapse

### Revision Management
- **Auto-Update Current Revision**: Automatically updates from Revision Log
- **Read-Only**: Current Program Revision field is read-only
- **Default Value**: Defaults to "A" if no revisions exist

## Technical Changes

### Data Structure Updates
```javascript
// Removed fields:
- programAdjustments
- requestAssistance, assistanceNotes
- programFeedback, feedbackInitials, feedbackDate
- programDatum
- machineCoordinates
- axisA, axisB
- programmedForSpecify

// Added fields:
- axisXMachineCoord, axisYMachineCoord, axisZMachineCoord, axisWMachineCoord
- showCompensationPrograms (boolean)
```

### New Functions
- `formatRuntime()` - Formats minutes to readable format (45m, 1hr 45m, 2hrs)
- `formatRuntimeDisplay()` - Formats runtime for display
- `formatRuntimeInput()` - Formats runtime on input blur
- `parseRuntimeToMinutes()` - Parses runtime string to minutes
- `updateProgramNames()` - Auto-fills program names based on part number
- `updateCurrentRevision()` - Updates current revision from revision log
- `toggleCompensationPrograms()` - Shows/hides compensation programs section
- `setupAutocompleteForField()` - Sets up Tab-key autocomplete for any field

### Reference Data Updates
```javascript
referenceData = {
  engineers: [...], // Same as v1.0
  machineTypes: ['Hurco', 'Mazak'], // For header "Programmed For"
  operationMachineTypes: ['Mill', 'Lathe', 'HBM'], // For operations
  axisSuggestions: {
    X: ['Center of Stock', 'Center of Part'],
    Y: ['Center of Stock', 'Center of Part'],
    Z: ['Top of Part', 'Top after skimming flat', 'Top after decking to thickness']
  },
  fixtureTypes: [...], // Same as v1.0
  materials: [...], // Same as v1.0
  coolingTypes: [...] // Same as v1.0
}
```

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled

## Migration from Version 1.0

### Data Compatibility
- Version 2.0 can load Version 1.0 files
- Removed fields will be ignored
- New fields will default to empty/false
- Machine Type values (Hurco/Mazak) in operations will need to be updated to Mill/Lathe/HBM

### Breaking Changes
- Machine Type in operations changed from Hurco/Mazak to Mill/Lathe/HBM
- A and B axis fields removed (data will be lost)
- Program Adjustments, Request Assistance, and Program Feedback sections removed (data will be lost)

## Known Issues
- None reported

## Next Steps (Version 3)
- Additional features as requested
- Further UI/UX improvements
- Server integration for reference data (Phase 2)

## Backup Instructions

Before making changes for Version 3:
1. Save a copy of `index.html` as `index_v2.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version

---

**This version is stable and production-ready. Use as baseline for Version 3 development.**

