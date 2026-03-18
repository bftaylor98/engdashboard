# Version 33.0 - Notes Widget

**Release Date:** February 18, 2026

## Status
✅ Stable

## Summary
Version 33.0 adds a new Notes widget that displays tool runout specifications when the form is locked. This widget appears below the Info Box widget and provides important manufacturing specifications in a clear, easy-to-read format.

## New Features

### Notes Widget
**Description:** A new widget that displays tool runout specifications in a table format. The widget is only visible when the form is locked, appearing below the Info Box widget in the widget sidebar.

**Key Features:**
- Displays the text: "Unless otherwise specified, maximum radial runouts are listed below:"
- Shows a 2x2 table with tool types and their maximum runout specifications:
  - Roughing Tools: .005"
  - Finish Tools: .002"
- Text color adapts to theme:
  - Dark mode: White text (#ffffff)
  - Light mode: Red text (#dc2626) for emphasis
- Table styling matches the application theme with proper dark/light mode support

**Visibility:**
- Only visible when form is locked
- Hidden when form is unlocked
- Automatically shows/hides based on form lock state

## Technical Details

### HTML Changes
- Added new Notes widget HTML structure below Info Box widget
- Added table with tool type and max runout data
- Widget ID: `notesLockedWidget`
- Content ID: `notesLockedContent`

### CSS Changes
- Added `.notes-text` styling (white in dark mode, red in light mode)
- Added `.notes-table` styling with full dark/light mode support
- Table cells styled with alternating row colors for readability
- Responsive table design matching widget sidebar width

### JavaScript Changes
- Added `notesLockedWidget` variable to `applyLockState()` function
- Widget shows when `isLocked === true`
- Widget hides when `isLocked === false`

## Files Modified

### Modified Files
- `index.html` — Notes widget HTML, CSS, JavaScript, version bump

## Migration Notes

No migration required. This is a purely additive feature with no data structure changes. The widget is automatically available in all existing and new forms when locked.


