# Version 5.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 5.0 includes significant data integrity improvements, UI enhancements, and workflow optimizations. Key features include auto-calculated operation runtimes, drag-and-drop tool reordering, improved field organization, and enhanced data persistence when loading saved files.

## New Features & Changes

### Data Integrity & Persistence
- **Fixed Image Upload Data Loss**: Image upload/paste/remove now syncs all form data before re-rendering to prevent data loss
- **Fixed Theme Restoration**: Orange/blue theme now properly restores when loading saved files based on "Programmed For" field
- **Fixed Dropdown Restoration**: All dropdowns (Material, Programmed For, Fixture, etc.) now properly restore their values when loading saved files
- **Fixed Operation Deletion Bug**: Added data syncing and validation when adding tool rows to prevent operations from being deleted

### Operation Runtime Calculation
- **Auto-Calculated Operation Runtime**: Operation runtime is now automatically calculated from the sum of all tool runtimes in that operation
- **Read-Only Operation Runtime**: Operation runtime field is now read-only (grayed out) and cannot be manually edited
- **Real-Time Updates**: Operation runtime updates automatically when:
  - Tool runtimes are changed
  - Tool rows are added or removed
  - Tool rows are reordered via drag-and-drop

### Tool Row Management
- **Drag-and-Drop Reordering**: Tool rows can now be reordered by dragging the hamburger icon (☰) in the first column
- **Discrete Drag Handle**: Hamburger icon is subtle and only appears in tooling table
- **Visual Feedback**: Drag-over indicators show where the row will be dropped (blue for Hurco, orange for Mazak)
- **Data Preservation**: Reordering preserves all tool data and recalculates operation runtime

### Job Information Section Updates
- **Removed Programmer Field**: Programmer field removed from Job Information section (still available in operations)
- **Updated Material Dropdown**: Material field changed from text input to dropdown select with new material list:
  - 4140 PH
  - F-Xtra T2
  - F-Xtra T1
  - H13 Tool Steel
  - S7 Tool Steel
  - A2 Tool Steel
  - D2 Tool Steel
  - CRS
  - HRS
  - 6061 Aluminum
  - Stainless Steel
- **Field Rearrangement**: 
  - Last Reviewed By moved to position 3 (where Material was)
  - Review Date moved to position 4 (next to Last Reviewed By)
  - Material moved to position 5 (where Review Date was)

### Operation Management
- **All Operations Collapsed by Default**: All operations, including the first one, now start collapsed when creating a new file
- **Collapsed State Preserved**: When loading saved files, operations maintain their saved collapsed/expanded state

### UI Improvements
- **Fixed Widget Header Styling**: Removed double line in orange theme widget headers (now shows single line like blue theme)
- **Consistent Styling**: Widget headers now have consistent single-line styling across both themes

## Technical Changes

### Data Structure Updates
```javascript
// No changes to embedded data structure
// Operation runtime is calculated on-the-fly from tool runtimes
// Material field changed from text to select dropdown
```

### New Functions
- `calculateOperationRuntime(opIndex)` - Calculates operation runtime from tool runtimes
- `updateOperationRuntime(opIndex)` - Updates operation runtime display
- `setupDragAndDrop(containerId, opIndex, tableType)` - Sets up drag-and-drop for tool rows
- `syncOperationData(opIndex)` - Explicitly syncs all data for a specific operation

### Updated Functions
- `addToolingRow()` - Now syncs data before rendering and validates operation index
- `addCompensationRow()` - Now syncs data before rendering and validates operation index
- `removeTableRow()` - Now syncs data before rendering
- `handleImageUpload()` - Now syncs data before rendering
- `pasteImage()` - Now syncs data before rendering
- `removeImage()` - Now syncs data before rendering
- `setFormData()` - Now properly restores theme and dropdown values
- `loadReferenceData()` - Now handles Material dropdown population
- `renderOperations()` - Added validation for operations array
- `addOperation()` - Changed default collapsed state to `true`
- `getFormData()` - Removed engineer field from header
- `syncData()` - Removed engineer field from header sync

### CSS Updates
- Added drag handle column styling (30px width)
- Updated column width calculations for tooling table (accounting for drag handle)
- Added drag-and-drop visual feedback styles
- Fixed widget header h3 border-bottom override for Mazak theme
- Updated tooling table column references (shifted by 1 for drag handle)

### Reference Data Updates
```javascript
referenceData = {
  engineers: [...], // Same as v4.0
  machineTypes: ['Hurco', 'Mazak'], // Same as v4.0
  operationMachineTypes: ['Mill', 'Lathe', 'HBM'], // Same as v4.0
  axisSuggestions: {...}, // Same as v4.0
  fixtureTypes: [...], // Same as v4.0
  materials: [
    '4140 PH',
    'F-Xtra T2',
    'F-Xtra T1',
    'H13 Tool Steel',
    'S7 Tool Steel',
    'A2 Tool Steel',
    'D2 Tool Steel',
    'CRS',
    'HRS',
    '6061 Aluminum',
    'Stainless Steel'
  ], // Updated from v4.0
  coolingTypes: [...] // Same as v4.0
}
```

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, fetch API support for Power Automate integration

## Migration from Version 4.0

### Data Compatibility
- Version 5.0 can load Version 4.0 files
- Material values from old files will need to be reselected from new dropdown (old values may not match)
- Operation runtime values will be recalculated from tool runtimes (manual values ignored)
- All operations will be collapsed when loading old files (unless explicitly saved as expanded)
- Theme and dropdown values will now properly restore when loading saved files

### Breaking Changes
- **Material Field**: Changed from text input to dropdown select - old custom values may not be available
- **Programmer Field**: Removed from Job Information (still in operations)
- **Operation Runtime**: Now read-only and auto-calculated - manual values are ignored
- **Default Operation State**: All operations now start collapsed (including first one)

### Visual Changes
- Material field is now a dropdown instead of text input
- Operation runtime field is now read-only (grayed out)
- Tooling table has new drag handle column (first column)
- All operations collapsed by default
- Widget headers show single line in both themes

## Known Issues
- None reported

## Next Steps (Future Versions)
- Additional calculator widgets as needed
- Widget state persistence (optional)
- Additional Power Automate integrations
- Server integration for reference data (Phase 2)
- Additional validation or features as needed

## Backup Instructions

Before making changes for Version 6:
1. Save a copy of `index.html` as `index_v5.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version

---

**This version is stable and production-ready. Use as baseline for Version 6 development.**
