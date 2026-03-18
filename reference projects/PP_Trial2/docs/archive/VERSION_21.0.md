# Version 21.0 - Widget Reorganization

**Release Date:** Current

## Status
✅ Stable

## Summary
Version 21.0 reorganizes the widget sidebar to improve organization and reduce clutter. Related widgets are now grouped into parent widgets with nested sub-widgets that can be expanded/collapsed independently.

## Major Features

### Widget Reorganization

#### New Widget Structure
The unlocked widgets have been reorganized into a cleaner, more logical structure:

1. **Palette Widget** (new parent widget)
   - Contains Shape Palette and Workholding Palette as nested sub-widgets
   - Both sub-widgets start collapsed
   - Only one sub-widget expanded at a time

2. **Text Formatting Widget** (standalone)
   - Positioned between Palette and Operations Functions
   - Remains as a standalone widget

3. **Operations Functions Widget** (new parent widget)
   - Contains Move Operations and Insert Operation as nested sub-widgets
   - Both sub-widgets start collapsed
   - Only one sub-widget expanded at a time

4. **Tool Import Widget** (unchanged)
   - Remains as standalone widget

5. **Quick Links Widget** (unchanged)
   - Remains as standalone widget

### Nested Widget System

#### New Nested Widget Functionality
- **Independent Collapse/Expand**: Each nested widget can be collapsed/expanded independently
- **Single Active Sub-Widget**: When expanding a nested widget, others in the same parent automatically collapse
- **Visual Hierarchy**: Nested widgets have distinct styling to show they're sub-items
- **Smooth Transitions**: Collapse/expand animations work for both parent and nested widgets

#### Nested Widget Styling
- Nested widgets have a darker background (`#2a2a2a`) to distinguish from parent
- Smaller header with h4 instead of h3
- Border styling to show containment within parent widget
- Proper spacing and padding for visual separation

## Technical Details

### New Functions

#### `toggleNestedWidget(widgetId)`
- Handles collapse/expand for nested widgets within parent widgets
- Collapses other nested widgets in the same parent when expanding one
- Properly handles both expand and collapse actions
- Updates dropdowns when Insert Operation is expanded

### Modified Functions

#### `toggleWidget(widgetId)`
- Updated `allWidgetIds` array to reflect new widget structure
- Removed individual widget IDs: `shapePalette`, `workholdingPalette`, `moveOperations`, `insertOperation`
- Added new parent widget IDs: `palette`, `operationsFunctions`

#### `applyLockState()`
- Updated to show/hide new parent widgets instead of individual widgets
- `paletteWidget` replaces `shapePaletteWidget` and `workholdingPaletteWidget`
- `operationsFunctionsWidget` replaces `moveOperationsWidget` and `insertOperationWidget`
- Maintains all existing functionality for locked/unlocked states

### CSS Additions

#### Nested Widget Styles
```css
.nested-widget {
    margin-bottom: 12px;
    padding: 12px;
    background: #2a2a2a;
    border: 1px solid #36454F;
    border-radius: 8px;
}

.nested-widget-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    padding-bottom: 6px;
    border-bottom: 1px solid #36454F;
}

.nested-widget-content {
    display: block;
}

.nested-widget-content.collapsed {
    display: none;
}
```

### HTML Structure Changes

#### Before (Version 20.0)
- Shape Palette (standalone widget)
- Workholding Palette (standalone widget)
- Text Formatting (standalone widget)
- Move Operations (standalone widget)
- Insert Operation (standalone widget)

#### After (Version 21.0)
- **Palette** (parent widget)
  - Shape Palette (nested)
  - Workholding Palette (nested)
- Text Formatting (standalone)
- **Operations Functions** (parent widget)
  - Move Operations (nested)
  - Insert Operation (nested)

## Bug Fixes

### Fixed Nested Widget Collapse Issue
- **Issue**: Nested widgets (sub-widgets) weren't collapsing when collapse button was clicked
- **Root Cause**: `toggleNestedWidget()` function only handled expansion, not collapse
- **Fix**: Added else clause to handle collapse action when widget is already expanded
- **Result**: Nested widgets now properly collapse and expand on button click

## UI/UX Improvements

### Better Organization
- Related widgets grouped together logically
- Reduced visual clutter in widget sidebar
- Clearer hierarchy with parent/child widget structure
- Easier to find related functionality

### Improved User Experience
- Fewer top-level widgets to scroll through
- Related tools grouped together (palettes together, operations together)
- Text Formatting positioned between palettes and operations for logical flow
- Consistent collapse/expand behavior across all widget levels

## Widget Visibility Matrix

| Widget | Unlocked | Locked |
|--------|----------|--------|
| Palette (parent) | ✅ | ❌ |
| - Shape Palette (nested) | ✅ | ❌ |
| - Workholding Palette (nested) | ✅ | ❌ |
| Text Formatting | ✅ | ❌ |
| Operations Functions (parent) | ✅ | ❌ |
| - Move Operations (nested) | ✅ | ❌ |
| - Insert Operation (nested) | ✅ | ❌ |
| Tool Import | ✅ | ❌ |
| Quick Links (Unlocked) | ✅ | ❌ |
| Milling Calculator | ❌ | ✅ |
| Drilling Calculator | ❌ | ✅ |
| Metric Converter | ❌ | ✅ |
| Request Assistance | ❌ | ✅ |
| Form Feedback | ❌ | ✅ |
| Quick Links (Locked) | ❌ | ✅ |

## Files Changed

- `index.html`:
  - Reorganized widget HTML structure (lines ~2487-2722)
  - Added nested widget CSS styles
  - Created `toggleNestedWidget()` function
  - Updated `toggleWidget()` function
  - Updated `applyLockState()` function
  - Updated `allWidgetIds` arrays
  - Exposed `toggleNestedWidget` on window object

## Migration Notes

### From Version 20.0
- No data migration required
- Existing files continue to work
- Widget functionality unchanged, only organization improved
- All features remain accessible, just in new locations

### Backward Compatibility
- Fully backward compatible with Version 20.0
- Existing files work without modification
- All data structures preserved
- No breaking changes to functionality

## Testing Checklist

When upgrading to Version 21.0, verify:
1. ✅ Palette widget appears when unlocked
2. ✅ Shape Palette expands/collapses within Palette widget
3. ✅ Workholding Palette expands/collapses within Palette widget
4. ✅ Only one palette sub-widget expanded at a time
5. ✅ Text Formatting widget appears between Palette and Operations Functions
6. ✅ Operations Functions widget appears when unlocked
7. ✅ Move Operations expands/collapses within Operations Functions widget
8. ✅ Insert Operation expands/collapses within Operations Functions widget
9. ✅ Only one operations sub-widget expanded at a time
10. ✅ Nested widgets collapse when collapse button clicked
11. ✅ Nested widgets expand when expand button clicked
12. ✅ All widgets hidden when form is locked
13. ✅ All widgets visible when form is unlocked
14. ✅ Tool Import widget still works correctly

## Known Limitations

- Nested widgets within the same parent cannot be expanded simultaneously
- This is by design to reduce visual clutter
- Users can quickly switch between nested widgets by clicking their headers

## Future Enhancements

Potential improvements for future versions:
- Allow multiple nested widgets to be expanded simultaneously (optional setting)
- Add keyboard shortcuts for widget navigation
- Remember which nested widgets were expanded between sessions
- Add search/filter functionality for widgets

## Version History

### Version 21.0 (Current)
- ✅ Widget reorganization with parent/child structure
- ✅ Palette widget containing Shape and Workholding palettes
- ✅ Operations Functions widget containing Move and Insert operations
- ✅ Nested widget collapse/expand functionality
- ✅ Fixed nested widget collapse bug
- ✅ Improved widget organization and visual hierarchy

### Version 20.0
- Text Formatting widget with full formatting capabilities
- 9 formattable fields (notes, axis, tooling)
- HTML content storage and preservation
- Fixed Tool Import widget collapse issue

### Version 19.0
- Server-based edit logging system
- Centralized logging from multiple endpoints

---

**Version**: 21.0  
**Last Updated**: Current  
**Status**: ✅ Stable












