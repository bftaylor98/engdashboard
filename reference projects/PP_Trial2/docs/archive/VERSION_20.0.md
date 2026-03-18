# Version 20.0 - Text Formatting Tools

**Release Date:** Current

## Status
✅ Stable

## Summary
Version 20.0 adds comprehensive text formatting capabilities to multiple form fields through a new Text Formatting widget. Users can now apply rich text formatting (bold, italic, underline, colors, font sizes) to notes fields, axis fields, and tooling information fields.

## Major Features

### Text Formatting Widget

#### New Widget in Sidebar
- **Location**: Widget sidebar (visible when form is unlocked)
- **Features**:
  - Bold, Italic, Underline formatting buttons
  - Font size selector (10px, 12px, 14px, 16px, 18px, 20px, 24px)
  - Text color picker with 9 preset colors + custom color picker
  - Preset colors: Black, White, Red, Green, Blue, Yellow, Magenta, Cyan, Orange
  - Widget automatically appears when formatting-enabled fields are focused

#### Formatting Capabilities
- **Bold**: Apply bold formatting to selected text
- **Italic**: Apply italic formatting to selected text
- **Underline**: Apply underline formatting to selected text
- **Font Size**: Change font size of selected text (10px to 24px)
- **Text Colors**: Apply colors to selected text (9 presets + custom)

### Formattable Fields

#### Notes Fields
1. **Fixturing Notes** (`fixturingNotes`)
   - Location: Part Setup section
   - Converted from textarea to contentEditable div

2. **Part Setup View Notes** (`imageCaption` - labeled "FRONT")
   - Location: Part Setup View section
   - Converted from textarea to contentEditable div

3. **Secondary Process Description** (`description`)
   - Location: Secondary Process Information section
   - Converted from textarea to contentEditable div

#### Axis Fields
4. **X Axis** (`axisX`)
   - Location: Part Setup section
   - Converted from text input to contentEditable div

5. **Y Axis** (`axisY`)
   - Location: Part Setup section
   - Converted from text input to contentEditable div

6. **Z Axis** (`axisZ`)
   - Location: Part Setup section
   - Converted from text input to contentEditable div

7. **W Axis** (`axisW`) - HBM machines only
   - Location: Part Setup section
   - Converted from text input to contentEditable div

#### Tooling Table Fields
8. **Tool Description** (`description`)
   - Location: Tooling table
   - Converted from text input to contentEditable div
   - Required field

9. **Tool Notes** (`notes`)
   - Location: Tooling table
   - Converted from text input to contentEditable div

## Technical Details

### Implementation

#### Rich Text Editors
- All formattable fields use `contentEditable` divs with class `rich-text-editor`
- HTML content is stored directly in the data structure
- Formatting preserved when files are saved and reopened

#### CSS Styling
- `.rich-text-editor`: Base styling for all rich text fields
- `.rich-text-editor.axis-field`: Special styling for axis fields (compact, single-line)
- `.rich-text-editor.table-field`: Special styling for tooling table fields
- Placeholder support for empty fields with `data-placeholder` attribute

#### Data Storage
- HTML content stored in data structure (not plain text)
- Backward compatible: Existing plain text values continue to work
- HTML formatting preserved in embedded data script tag

#### Event Handling
- `setupRichTextEditors()`: Initializes all rich text editors on page load and after rendering
- `applyTextFormat()`: Applies formatting commands to selected text
- `syncRichTextData()`: Syncs HTML content from editors to data structure
- Automatic widget visibility when formatting-enabled fields are focused

### Functions Added/Modified

#### New Functions
- `setupRichTextEditors()`: Sets up event listeners and placeholder support for rich text editors
- `applyTextFormat(command, value)`: Applies formatting to selected text in active field
- `syncRichTextData(editor)`: Syncs HTML content from editor to operations array

#### Modified Functions
- `syncData()`: Enhanced to handle HTML content from contentEditable divs
- `renderOperations()`: Calls `setupRichTextEditors()` after rendering
- `renderTable()`: Creates contentEditable divs for description and notes fields in tooling table
- `applyLockState()`: Added text formatting widget visibility control

### Widget Integration

#### Widget Visibility
- **Visible when**: Form is unlocked
- **Hidden when**: Form is locked
- **Auto-shows**: When any formatting-enabled field receives focus

#### Widget Collapse System
- Added `textFormatting` to `allWidgetIds` array
- Follows standard widget collapse/expand behavior
- Only one widget expanded at a time

## Bug Fixes

### Fixed Tool Import Widget Collapse Issue
- **Issue**: Tool Import widget was not collapsing when collapse button clicked
- **Root Cause**: `toolImport` was missing from `allWidgetIds` array in `toggleWidget()` function
- **Fix**: Added `toolImport` to `allWidgetIds` array in both locations
- **Result**: Tool Import widget now collapses/expands correctly

## UI/UX Improvements

### Formatting Widget Design
- Clean, organized layout with grouped controls
- Color buttons with hover effects
- Font size dropdown for easy selection
- Custom color picker for advanced users
- Helpful instruction text: "Select text in a notes field, then apply formatting"

### Field Styling
- Consistent styling across all formattable fields
- Focus states with theme-aware colors (Hurco blue / Mazak orange)
- Proper placeholder handling for empty fields
- Responsive design maintains form layout

## Data Structure Changes

### HTML Content Storage
- Fields now store HTML instead of plain text:
  - `fixturingNotes`: HTML string
  - `imageCaption`: HTML string
  - `description` (secondary): HTML string
  - `axisX`, `axisY`, `axisZ`, `axisW`: HTML string
  - `tooling[].description`: HTML string
  - `tooling[].notes`: HTML string

### Backward Compatibility
- Existing files with plain text values continue to work
- HTML rendering handles both plain text and HTML content
- No data migration required

## Files Changed

- `index.html`: 
  - Added Text Formatting widget HTML (lines ~2586-2630)
  - Added CSS for formatting controls and rich text editors
  - Converted form fields to contentEditable divs
  - Added formatting functions
  - Updated data syncing functions
  - Fixed tool import widget collapse issue

## Migration Notes

### From Version 19.0
- No data migration required
- Existing files continue to work
- Plain text values in formattable fields will display as-is
- Formatting can be applied to existing text

### Backward Compatibility
- Fully backward compatible with Version 19.0
- Existing files work without modification
- All data structures preserved
- HTML content optional (plain text still works)

## Testing Checklist

When upgrading to Version 20.0, verify:
1. ✅ Text Formatting widget appears in sidebar when unlocked
2. ✅ Widget disappears when form is locked
3. ✅ Can format text in Fixturing Notes field
4. ✅ Can format text in Part Setup View Notes (FRONT) field
5. ✅ Can format text in Secondary Process Description field
6. ✅ Can format text in X, Y, Z axis fields
7. ✅ Can format text in Tool Description field (tooling table)
8. ✅ Can format text in Tool Notes field (tooling table)
9. ✅ Formatting persists after save/reload
10. ✅ Tool Import widget collapses/expands correctly
11. ✅ Widget appears when formatting-enabled field is focused
12. ✅ All formatting options work (bold, italic, underline, colors, sizes)

## Known Limitations

- Formatting is applied via `document.execCommand()` (browser-dependent)
- Some browsers may have slight differences in formatting behavior
- Complex formatting (nested styles) may not always render identically across browsers
- Font size implementation uses span elements with inline styles

## Future Enhancements

Potential improvements for future versions:
- Additional formatting options (strikethrough, superscript, subscript)
- Text alignment options
- Bullet/numbered lists
- Copy/paste formatting preservation
- Format painter tool

## Version History

### Version 20.0 (Current)
- ✅ Text Formatting widget with full formatting capabilities
- ✅ 9 formattable fields (notes, axis, tooling)
- ✅ HTML content storage and preservation
- ✅ Fixed Tool Import widget collapse issue
- ✅ Widget auto-visibility on field focus

### Version 19.0
- Server-based edit logging system
- Centralized logging server
- Client-side change tracking

### Version 18.0
- Fixed Insert Operation buttons
- Improved error handling
- Hidden Add Operation buttons when locked

---

**Version**: 20.0  
**Last Updated**: Current  
**Status**: ✅ Stable












