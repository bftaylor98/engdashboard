# Version 6.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 6.0 focuses on tooling table improvements, enhanced data integrity, and UI refinements. Key features include a cooling dropdown field, optimized column widths based on character requirements, abbreviated headers for space efficiency, and an improved delete button interface with hover tooltip.

## New Features & Changes

### Tooling Table Enhancements

#### Cooling Field Dropdown
- **Cooling Field**: Changed from text input to dropdown select
- **Cooling Options**: 
  - Flood
  - Air
  - CTS
  - ATS
  - Superflow
- **Centered Text**: Dropdown text is centered to match other table inputs
- **Custom Styling**: Dropdown styled with custom arrow icon and appearance

#### Column Width Optimizations
- **Optimized for Character Requirements**: All columns adjusted to fit required character counts:
  - ID: 45px → 50px (4 chars)
  - T#: 45px → 50px (4 chars)
  - Description: 320px → 420px min (54 chars)
  - Rad: 50px (4 chars)
  - S.O. (Stickout): 50px (4 chars)
  - R.O. (Runout): 60px (5 chars)
  - Holder: 120px → 190px (25 chars)
  - Cooling: 110px (10 chars)
  - Time: 90px (8 chars)
  - Notes: 250px min (30 chars)
  - Set (Preset): 55px (checkbox)
  - INIT (Initials): 45px (2 chars)

#### Header Abbreviations
- **Stickout** → **S.O.**
- **Runout** → **R.O.**
- **Initials** → **INIT**
- **Preset** → **Set**

#### Delete Button Improvements
- **Hover Tooltip**: Delete button (X) now appears as a small, discreet tooltip in the corner of the hamburger icon on hover
- **No Background**: X appears as subtle gray text, turns red on hover
- **Removed Actions Column**: Actions column removed from tooling table (X is now in hamburger tooltip)
- **Space Savings**: Eliminated 40px reserved space for actions column

### Data Integrity Improvements

#### Enhanced Operation Preservation
- **Deep Backup System**: Operations are now backed up before any sync operation
- **Error Recovery**: If sync fails, operations are automatically restored from backup
- **Property Preservation**: All operation properties (programInfo, partSetup, compensationPrograms) are explicitly preserved
- **Collapsed Operation Handling**: Sync gracefully handles collapsed operations (skips if DOM elements unavailable)
- **Validation**: Multiple validation checks ensure operations aren't lost during data operations

#### Improved Sync Functions
- **syncOperationData()**: Enhanced to skip syncing if operation is collapsed (no DOM elements)
- **addToolingRow()**: Now includes comprehensive backup/restore mechanism
- **addCompensationRow()**: Includes same backup/restore protection
- **removeTableRow()**: Enhanced with validation and error handling

### UI/UX Improvements

#### Table Styling
- **Centered Headers**: "Set" header is now centered
- **Consistent Spacing**: All columns optimized for their content requirements
- **Better Space Utilization**: Removed unnecessary actions column space

#### Input Field Constraints
- **Character Limits**: MaxLength constraints updated to match column requirements:
  - ID (cId): 4 chars
  - T# (toolNumber): 4 chars
  - Rad (corner): 4 chars
  - S.O. (stickout): 4 chars
  - R.O. (runoutReq): 5 chars
  - INIT (initials): 2 chars

## Technical Changes

### CSS Updates

#### New Styles
- `.cooling-select`: Custom styling for cooling dropdown with centered text
- `.drag-handle-delete-tooltip`: Tooltip styling for delete button in hamburger corner
- Column width adjustments for all tooling table columns
- Actions column hidden for tooling tables (`display: none`)

#### Updated Styles
- Preset column header centering with `!important` flag
- Input padding adjustments for narrow columns
- Drag handle positioning for tooltip overlay

### JavaScript Updates

#### New Functions
- None (enhanced existing functions)

#### Updated Functions
- `addToolingRow()`: Enhanced with deep backup and restore mechanism
- `addCompensationRow()`: Enhanced with backup/restore protection
- `removeTableRow()`: Enhanced with validation
- `syncOperationData()`: Enhanced to handle collapsed operations gracefully
- `renderTable()`: Updated to render cooling as dropdown, add delete tooltip to hamburger

### Reference Data Updates
```javascript
referenceData = {
  coolingTypes: ['Flood', 'Air', 'CTS', 'ATS', 'Superflow'], // Updated from v5.0
  // ... other reference data unchanged
}
```

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, fetch API support for Power Automate integration

## Migration from Version 5.0

### Data Compatibility
- Version 6.0 can load Version 5.0 files
- Cooling values from old files will need to be reselected from new dropdown (old values may not match new options)
- All other data structures remain compatible
- No breaking changes to data format

### Visual Changes
- Cooling field is now a dropdown instead of text input
- Headers abbreviated (S.O., R.O., INIT, Set)
- Delete button moved to hamburger tooltip (no longer in actions column)
- Column widths adjusted for better fit
- Actions column removed from tooling table

### Breaking Changes
- **Cooling Field**: Changed from text input to dropdown - old custom values may not be available
- **Header Text**: Abbreviated headers may require user familiarization
- **Delete Button**: Moved from actions column to hamburger tooltip

## Known Issues
- None reported

## Next Steps (Future Versions)
- Additional calculator widgets as needed
- Widget state persistence (optional)
- Additional Power Automate integrations
- Server integration for reference data (Phase 2)
- Additional validation or features as needed

## Backup Instructions

Before making changes for Version 7:
1. Save a copy of `index.html` as `index_v6.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version

---

**This version is stable and production-ready. Use as baseline for Version 7 development.**





