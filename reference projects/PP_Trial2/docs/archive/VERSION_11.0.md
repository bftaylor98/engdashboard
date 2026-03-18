# Version 11.0 - Release Notes

## Release Date
Current

## Status
⚠️ Production Ready with Known Issue - See Outstanding Issues Below

## Summary
Version 11.0 introduces tool autofill functionality, password masking for security, CTS water graphic banner, and user display indicator improvements. Key features include automatic tool data population from a standard 36-tool library, enhanced security with password input masking, and visual indicators for CTS cooling requirements.

## New Features & Changes

### Tool Autofill System

#### Standard Tool Library
- **36-Tool Library**: Complete library of standard tools with pre-populated data
- **Tool Data Structure**: Each tool includes:
  - Tool Description
  - Radius (corner)
  - Stickout (length)
  - Holder Type
  - Cooling Type
- **Data Source**: Tool library populated from CSV file (Book1.csv)

#### Autofill Functionality
- **Trigger**: Autofill activates on blur (Tab key or clicking away from Tool # field)
- **Automatic Population**: When a tool number (1-36) is entered, automatically fills:
  - Description
  - Radius (RAD)
  - Stickout (S.O.)
  - Holder Type
  - Cooling (dropdown)
- **Re-autofill Support**: Changing tool number and tabbing out will re-autofill with new tool data
- **Manual Override**: All autofilled fields can be manually edited after autofill

#### Complex Radius Handling
- **Complex Values**: Radius values containing "/" (e.g., ".06/.015") are left blank
- **Visual Indicator**: Complex radius fields are highlighted in red with error styling
- **Tooltip**: Shows the complex value that needs to be entered manually

### Password Security Enhancement

#### Password Input Masking
- **Custom Password Modal**: Replaced browser prompt() with custom modal dialog
- **Password Masking**: Password input field uses type="password" to hide input with dots
- **Keyboard Support**:
  - Enter key submits password
  - Escape key closes modal
  - Click outside modal to close
- **Theme-Aware Styling**: Modal matches application theme (Hurco blue / Mazak orange)

### CTS Water Graphic Banner

#### Visual Indicator
- **Banner Display**: Static blue banner at top of form showing "CTS Required"
- **Display Conditions**: Banner appears when:
  - Form is locked
  - Machine is set to "Hurco"
  - At least one tool has CTS cooling
- **Document Flow**: Banner is part of document flow (scrolls with page, not fixed)
- **Spacing**: 30px margin-bottom for proper spacing from header

### User Display Indicator Fix

#### Visual User Display
- **Fixed Display Issue**: User display indicator now properly appears when form is unlocked
- **Positioning**: Located between part description title and header buttons
- **Theme-Aware**: Blue for Hurco theme, orange for Mazak theme
- **Visibility**: Only visible when form is unlocked and user is logged in

### Cooling Types Update

#### Additional Cooling Options
- **New Options**: Added "Oil" and "Cutting Oil" to cooling dropdown
- **Complete List**: Flood, Air, CTS, ATS, Superflow, Oil, Cutting Oil

## Technical Changes

### Data Structure Updates
```javascript
// New toolLibrary object with 36 tools
const toolLibrary = {
  '1': { description: '...', corner: '...', stickout: '...', holderType: '...', cooling: '...' },
  // ... tools 2-36
};

// Updated referenceData
referenceData = {
  coolingTypes: ['Flood', 'Air', 'CTS', 'ATS', 'Superflow', 'Oil', 'Cutting Oil']
}
```

### New Functions
- `autofillToolData(opIndex, rowIndex, toolNumber)` - Autofills tool data based on tool number
- `showPasswordModal()` - Displays password input modal
- `closePasswordModal()` - Closes password modal
- `submitPassword()` - Validates and processes password submission
- `updateCTSBanner()` - Updates CTS water banner visibility based on cooling settings

### Updated Functions
- `toggleLock()` - Now uses custom password modal instead of browser prompt()
- `updateUserDisplay()` - Fixed to properly show/hide user indicator
- `updateTableData()` - Added call to updateCTS banner when cooling changes
- `renderTable()` - Added blur event listener for tool number autofill
- `setFormData()` - Added call to updateCTS banner after loading data
- `renderOperations()` - Added call to updateCTS banner after rendering

### CSS Updates
- Added `.password-modal` styles for password input dialog
- Added `.cts-water-banner` styles for CTS indicator banner
- Updated `.user-display` positioning and visibility
- Added error styling for complex radius fields

### HTML Structure Updates
- Added password modal HTML structure
- Added CTS water banner element at top of container
- Updated user display element (removed inline display:none)

## Outstanding Issues

### ⚠️ Known Issue: N/A Radius Not Autofilling
- **Issue**: Tool numbers with "N/A" radius values (e.g., tool 36) are not autofilling the Rad field
- **Expected Behavior**: When tool number with "N/A" radius is entered, Rad field should autofill with "N/A"
- **Current Behavior**: Rad field remains blank for tools with "N/A" radius
- **Affected Tools**: Tools 12, 14, 16, 18, 19, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 36
- **Workaround**: Manually enter "N/A" in Rad field for affected tools
- **Status**: Under investigation - logic appears correct but may have edge case issue

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, keyboard event support

## Migration from Version 10.0

### Data Compatibility
- Version 11.0 can load Version 10.0 files
- All existing data structures remain compatible
- No breaking changes to data format
- Tool autofill is additive feature (doesn't affect existing data)

### Visual Changes
- Password input now uses modal dialog with masked input
- CTS water banner appears at top when conditions are met
- User display indicator now properly visible when unlocked
- Tool autofill activates on blur (tab or click away)

### Breaking Changes
- **Password Input**: Changed from browser prompt() to custom modal (no breaking change for users)
- **Tool Autofill**: New feature - no breaking changes

## Known Issues
- See "Outstanding Issues" section above for N/A radius autofill issue

## Next Steps (Future Versions)
- Fix N/A radius autofill issue
- Additional tool library entries as needed
- Server integration for reference data (Phase 2)
- Additional validation or features as needed

## Backup Instructions

Before making changes for Version 12:
1. Save a copy of `index.html` as `index_v11.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version
4. Resolve outstanding N/A radius autofill issue

---

**This version is production-ready with one known issue. Use as baseline for Version 12 development.**




