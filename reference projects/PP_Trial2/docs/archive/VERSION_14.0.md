# Version 14.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 14.0 introduces multiple setup image support with navigation, enhanced form validation with visual feedback, improved lock state functionality, and several UI/UX improvements. Key features include multiple image upload/paste per operation, image navigation arrows, required field validation highlighting, and improved form lock behavior.

## New Features & Changes

### Multiple Setup Images with Navigation

#### Major Feature Addition
- **Previous**: Each operation could only have one setup image
- **New**: Each operation can now have multiple setup images with navigation arrows
- **Navigation**: Left/right arrow buttons to cycle through images
- **Image Counter**: Displays "Image 1 of 3" when multiple images are present
- **Smart Display**: Navigation arrows only appear when there are 2+ images

#### Implementation Details
- **Data Structure**: Changed from single `image` property to `images` array with `currentImageIndex`
- **Upload/Paste**: New images are added to the array instead of replacing existing ones
- **Remove**: Removes current image from array and adjusts index appropriately
- **Navigation**: Wraps around (last image → first image, first image → last image)
- **Lock State**: Navigation arrows are disabled when form is locked

#### Migration
- Automatic migration from old single-image format to new array format
- Old files with `image` property are automatically converted to `images` array
- Backward compatible with all previous versions

### Enhanced Form Validation

#### Visual Validation Feedback
- **Red Border Highlighting**: Empty required fields in tooling table now show red borders
- **Affected Fields**: Rad, SO (Stickout), HOLDER (Holder Type), TIME (Runtime), and Cooling
- **Real-time Validation**: Fields are validated on blur/change events
- **Consistent Styling**: Matches the red border styling used for Part Number and WO Number fields

#### Implementation
- CSS styling for `:invalid` and `.invalid-empty` classes
- JavaScript validation functions that check field values
- Automatic validation after table rendering
- Visual feedback matches existing form validation patterns

### Form Lock State Improvements

#### Remove Operation Button Visibility
- **Previous**: Remove Operation buttons were visible even when form was locked
- **New**: Remove Operation buttons are now hidden when form is locked
- **Implementation**: CSS and JavaScript work together to hide buttons appropriately

#### SET and INIT Fields Editable When Locked
- **Previous**: SET (Preset checkbox) and INIT (Initials) fields were not editable when locked
- **New**: Both fields are now properly editable when form is locked
- **Fix**: Corrected header text lookup from "Preset"/"Initials" to "Set"/"INIT" to match actual table headers

### Fixture Dropdown Update

#### New Option Added
- **Added**: "Angle Plate & Magnet" option to fixture dropdown
- **Complete List**: Vise, Chuck, Angle Plate, Magnet, Angle Plate & Magnet

### Cooling Dropdown Update

#### Option Removed
- **Removed**: "Cutting Oil" from cooling dropdown
- **Kept**: "Oil" option remains available
- **Tool Library**: Updated tool #26 to use "Oil" instead of "Cutting Oil"
- **Complete List**: Flood, Air, CTS, ATS, Superflow, Oil

### Total Runtime Formatting

#### Consistency Improvement
- **Previous**: Total Runtime field had different formatting than Operation Runtime
- **New**: Total Runtime now matches Operation Runtime formatting
- **Changes**:
  - Made field readonly
  - Changed placeholder to "Auto-calculated"
  - Applied same styling (background color, cursor)
  - Simplified label (removed "(minutes or hh:mm)")

## Technical Changes

### Data Structure Updates

```javascript
// Old structure (Version 13.0 and earlier)
{
  operations: [{
    image: "data:image/png;base64,...",
    imageCaption: "..."
  }]
}

// New structure (Version 14.0)
{
  operations: [{
    images: ["data:image/png;base64,...", ...],
    currentImageIndex: 0,
    imageCaption: "..."
  }]
}
```

### New Functions

#### Image Management
- `previousImage(opIndex)` - Navigate to previous image (wraps around)
- `nextImage(opIndex)` - Navigate to next image (wraps around)

#### Validation
- `validateToolingField(opIndex, rowIndex, field, value)` - Validates a single tooling field
- `validateToolingFields(opIndex)` - Validates all fields in a tooling table

### Modified Functions

#### Image Functions
- `handleImageUpload()` - Now adds images to array instead of replacing
- `pasteImage()` - Now adds images to array instead of replacing
- `removeImage()` - Now removes current image from array

#### Data Loading
- `setFormData()` - Added migration code to convert old single-image format to new array format

### CSS Updates

#### New Styles
- `.image-nav-btn` - Navigation arrow button styling
- `.image-nav-btn:hover:not(:disabled)` - Hover effects
- `.image-nav-btn:disabled` - Disabled state styling
- Theme-aware styling for Hurco (blue) and Mazak (orange) themes

#### Validation Styles
- `input:required:invalid` - Red border for invalid required fields
- `.tooling-table input.invalid-empty` - Red border for empty required fields
- `.cooling-select.invalid-empty` - Red border for empty cooling select

### HTML Structure Updates
- Image container now includes navigation arrows and image counter
- Conditional rendering of navigation arrows based on image count
- Updated image display logic to use array and current index

## User Experience Improvements

### Image Management Workflow
1. **Upload/Paste**: Click upload or paste to add new images (adds to collection)
2. **Navigate**: Use arrow buttons to cycle through images when multiple exist
3. **View Counter**: See "Image X of Y" to know position in collection
4. **Remove**: Remove current image while keeping others

### Validation Feedback
- Immediate visual feedback when required fields are empty
- Red borders match existing form validation patterns
- Clear indication of which fields need attention

### Lock State Clarity
- Remove Operation buttons hidden when locked (cleaner UI)
- SET and INIT fields properly editable when locked (as intended)
- Navigation arrows disabled when locked (prevents accidental changes)

## Migration from Version 13.0

### Data Compatibility
- Version 14.0 can load Version 13.0 files
- Automatic migration of single-image format to array format
- All existing data structures remain compatible
- No breaking changes to data format

### Visual Changes
- Navigation arrows appear when multiple images exist
- Image counter displays when multiple images exist
- Red borders on empty required fields in tooling table
- Remove Operation buttons hidden when locked
- Total Runtime field matches Operation Runtime styling

### Breaking Changes
- **None** - Fully backward compatible
- Old single-image format automatically migrated

## Known Issues
- None reported

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, Clipboard API support (for paste functionality)

## Testing
- ✅ Multiple image upload/paste per operation
- ✅ Image navigation with arrows
- ✅ Image counter display
- ✅ Remove current image from array
- ✅ Migration from single-image to array format
- ✅ Required field validation with red borders
- ✅ Remove Operation button visibility when locked
- ✅ SET and INIT fields editable when locked
- ✅ Total Runtime formatting consistency
- ✅ Fixture dropdown with new option
- ✅ Cooling dropdown without Cutting Oil

## Next Steps (Future Versions)
- Image reordering (drag-and-drop)
- Image thumbnails/preview grid
- Image captions per image (instead of single caption)
- Additional validation enhancements
- Additional UI/UX improvements as needed

## Backup Instructions

Before making changes for Version 15:
1. Save a copy of `index.html` as `index_v14.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version

---

**This version introduces multiple image support and enhanced validation. Production-ready and stable.**


