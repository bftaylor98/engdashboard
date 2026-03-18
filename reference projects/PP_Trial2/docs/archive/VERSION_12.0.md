# Version 12.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 12.0 resolves the outstanding N/A radius autofill issue from Version 11.0, adds required field validation to tooling information fields, and fixes tab navigation after autofill. Key improvements include proper handling of "N/A" radius values, enhanced form validation, and improved user experience with preserved tab order.

## New Features & Changes

### Fixed N/A Radius Autofill Issue

#### Problem Resolution
- **Issue**: Tools with "N/A" radius values (tools 12, 14, 16, 18, 19, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 36) were not autofilling the Rad field when tool number was entered
- **Root Cause**: The UI update was not persisting after setting the value directly
- **Solution**: Implemented table re-render after autofill to ensure all values (especially corner/Rad) are displayed correctly, matching the behavior when adding a new row

#### Implementation
- **Data Structure Update**: Corner values (including "N/A") are correctly saved to the operations array
- **UI Update**: Table is re-rendered after autofill to ensure all fields display correctly
- **Focus Preservation**: Tab order is preserved by moving focus to the next field (corner/Rad) after re-render

### Required Field Validation

#### Tooling Information Required Fields
The following fields in the Tooling Information table are now required:
- **T#** (Tool Number)
- **Description**
- **Rad** (Radius/Corner)
- **SO** (Stickout)
- **Holder** (Holder Type)
- **Cooling**
- **Time** (Runtime)

#### Validation Behavior
- Browser's built-in HTML5 validation prevents form submission if required fields are empty
- Validation messages appear when users interact with empty required fields
- Required fields are marked with the `required` attribute

### Tab Navigation Fix

#### Improved User Experience
- **Problem**: After autofill, tabbing would reset focus back to the ID field instead of moving to the next field
- **Solution**: Focus is now preserved and moved to the corner/Rad field (next in tab order) after table re-render
- **Implementation**: Uses `requestAnimationFrame` to ensure DOM is fully updated before focusing, and selects text in the corner field if it has a value

## Technical Changes

### Data Structure Updates
No changes to embedded data structure. All existing data remains compatible.

### JavaScript Updates

#### Updated Functions
- `autofillToolData()` - Now re-renders table after autofill and preserves focus to next field
  - Added table re-render at end of function
  - Added focus restoration logic using `requestAnimationFrame`
  - Improved corner value handling for "N/A" values

#### New Functionality
- Required field validation for tooling table inputs
- Focus preservation after table re-render
- Text selection in corner field after autofill

### HTML Structure Updates
- Added `required` attribute to tooling table fields:
  - Tool Number input
  - Description input
  - Corner/Rad input
  - Stickout input
  - Holder Type input
  - Cooling select dropdown
  - Runtime/Time input

### CSS Updates
No CSS changes required. Browser's built-in validation styling handles required field indicators.

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, HTML5 form validation support

## Migration from Version 11.0

### Data Compatibility
- Version 12.0 can load Version 11.0 files
- All existing data structures remain compatible
- No breaking changes to data format
- Required fields are additive feature (doesn't affect existing data)

### Visual Changes
- Required fields now show browser validation messages when empty
- Tab navigation after autofill now moves to next field instead of resetting
- "N/A" values now properly display in Rad field after autofill

### Breaking Changes
- **Required Fields**: Tooling table fields are now required - users must fill them before form submission
- **Tab Behavior**: Tab order after autofill now moves forward instead of resetting (improved UX)

## Known Issues
- None reported

## Resolved Issues

### ✅ Fixed: N/A Radius Not Autofilling
- **Status**: Resolved
- **Solution**: Table re-render after autofill ensures all values display correctly
- **Affected Tools**: Tools 12, 14, 16, 18, 19, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 36 now properly autofill "N/A" in Rad field

## Next Steps (Future Versions)
- Additional tool library entries as needed
- Server integration for reference data (Phase 2)
- Additional validation or features as needed
- Additional calculator widgets as needed

## Backup Instructions

Before making changes for Version 13:
1. Save a copy of `index.html` as `index_v12.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version

---

**This version resolves the outstanding N/A radius autofill issue and adds required field validation. Production-ready and stable.**



