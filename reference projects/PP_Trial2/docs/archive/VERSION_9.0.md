# Version 9.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 9.0 includes significant UI/UX improvements, field label updates, and workflow enhancements. Key features include an editable part description title, discreet Mastercam-style icon buttons, WO Number hyperlink functionality when locked, keyboard shortcuts, and ISO-9001 document control footer.

## New Features & Changes

### UI/UX Improvements

#### Editable Part Description Title
- **Title Field**: The "Program Process Sheet" title is now an editable input field for part description
- **Styling**: Maintains original h1 appearance (2.5em font, white color, same spacing)
- **Width**: Limited to 75% width to avoid collision with lock button
- **Locked State**: Border/box disappears when form is locked (appears as plain text)
- **Data Persistence**: Part description is saved and loaded with document data

#### Discreet Icon Buttons (Mastercam Style)
- **Button Location**: New, Save, and Save As buttons moved from toolbar to header (left of lock button)
- **Icon Design**: All buttons now use discreet icon-only design matching Mastercam interface
- **Button Size**: 42px × 42px buttons with 26px icons
- **Styling**: 
  - Transparent background with subtle border
  - 70% opacity by default, 100% on hover
  - White icons (not grey)
  - Hover effects with theme colors (blue for Hurco, orange for Mazak)
- **Tooltips**: All buttons have descriptive tooltips on hover
- **Icons**:
  - New: Document icon
  - Save: Floppy disk icon
  - Save As: Document with arrow icon
  - Lock: Padlock icon (existing)

#### Toolbar Simplification
- **Removed Buttons**: Download HTML, Print, and Open buttons removed from toolbar
- **Button Text**: Changed "New / Clear" to "New"
- **Toolbar Removed**: Toolbar section completely removed (buttons moved to header)

### Field Label Updates

#### WO Number (formerly SO Number)
- **Job Information**: Changed "SO Number" to "WO Number"
- **Revision Log**: Changed "SO Number" header to "WO Number"
- **Validation**: Updated error message to "WO Number is required"
- **Hyperlink Feature**: WO Number becomes clickable hyperlink when form is locked
  - Link format: `https://est.adionsystems.com/procnc/workorders/2026/{WO_NUMBER}`
  - Opens in new tab
  - Styled to match input field appearance
  - Converts back to input field when unlocked

#### Fixture Dropdown Updates
- **New Options**: Updated fixture dropdown to include:
  - Vise
  - Chuck
  - Angle Plate
  - Magnet
- **Removed Options**: Removed "Fixture Plate" and "Custom Fixture"

#### Part Setup View Label
- **Label Change**: Changed "Image Caption/Notes" to "FRONT" in Part Setup View section

#### Revision Log Header
- **Field Change**: Changed "Engineer" header to "Programmer" in Revision Log table

### Keyboard Shortcuts

#### ALT+L Hotkey
- **Function**: Toggles form lock/unlock state
- **Behavior**:
  - When locked: Prompts for password (123) to unlock
  - When unlocked: Locks immediately (no password needed)
- **Accessibility**: Works from anywhere on the page

### ISO-9001 Document Control

#### Form Number Footer
- **Location**: Bottom left corner of the form
- **Text**: "FRM-PRD-35 Trial Revision"
- **Styling**: Small grey text (12px), positioned absolutely
- **Print Support**: Displays in black text when printing

## Technical Changes

### Data Structure Updates
```javascript
{
  header: {
    partDescription: string, // NEW: Editable part description
    partNumber: string,
    soNumber: string, // Field name unchanged for backward compatibility
    // ... other fields
  },
  // ... other data unchanged
}
```

### CSS Updates
- Added `.title-input` styles for editable title field
- Added `.header-buttons` container for icon buttons
- Added `.header-button` styles for discreet icon buttons
- Added `.wo-number-link` styles for hyperlink when locked
- Added `.form-number-footer` styles for ISO footer
- Updated `.unlock-button` to match new button styling
- Removed `.toolbar` styles (toolbar removed)

### JavaScript Updates
- Updated `getFormData()` to include `partDescription`
- Updated `setFormData()` to restore `partDescription`
- Updated `newDocument()` to clear `partDescription`
- Updated `applyLockState()` to:
  - Convert WO Number input to hyperlink when locked
  - Restore WO Number input when unlocked
  - Set title input to readonly when locked
- Added keyboard event listener for ALT+L hotkey
- Updated `toggleLock()` to work with keyboard shortcut

### HTML Structure Updates
- Replaced `<h1>Program Process Sheet</h1>` with editable input
- Moved toolbar buttons to header-container
- Added form number footer before closing container div
- Removed toolbar div

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, keyboard event support

## Migration from Version 8.0

### Data Compatibility
- Version 9.0 can load Version 8.0 files
- `partDescription` will be empty for old files (new feature)
- `soNumber` field name unchanged (only display labels changed)
- All existing data structures remain compatible
- No breaking changes to data format

### Visual Changes
- Title is now editable input field
- Buttons moved to header (discreet icon style)
- Toolbar removed
- WO Number becomes hyperlink when locked
- Form number footer added at bottom
- Field labels updated throughout

### Breaking Changes
- **Toolbar**: Toolbar section removed (buttons moved to header)
- **Open Button**: Removed (functionality still available via File System Access API)
- **Download HTML Button**: Removed (functionality still available via Save As)
- **Print Button**: Removed (users can use browser print: Ctrl+P)
- **Fixture Options**: Changed - old custom values may not match new options

## Known Issues
- None reported

## Next Steps (Future Versions)
- Additional keyboard shortcuts as needed
- Additional fixture options as needed
- Server integration for reference data (Phase 2)
- Additional validation or features as needed

## Backup Instructions

Before making changes for Version 10:
1. Save a copy of `index.html` as `index_v9.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version

---

**This version is stable and production-ready. Use as baseline for Version 10 development.**




