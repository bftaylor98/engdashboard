# Version 7.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 7.0 introduces a Shape Palette feature with draggable shapes that can be placed on the form. This experimental feature allows users to add visual annotations including circles, arrows, rectangles, and note boxes. Shapes are fully resizable, rotatable, and persist with the document.

## New Features & Changes

### Shape Palette Widget

#### Widget Location
- **Shape Palette Widget**: Added to widget sidebar (right side of form)
- **Visibility**: Only visible when form is unlocked
- **Collapsible**: Follows same collapse/expand behavior as other widgets
- **Discreet Design**: Compact grid layout with muted styling

#### Available Shapes
1. **Circle**: Red outline circle, resizable and rotatable
2. **Arrow**: Red arrow pointing right, resizable and rotatable
3. **Rectangle**: Red outline rectangle, resizable and rotatable
4. **Note Box**: Red filled rounded rectangle with white text input, resizable and rotatable

#### Shape Features
- **Drag and Drop**: Drag shapes from palette onto the form
- **Resizable**: Four corner resize handles (SE, SW, NE, NW)
- **Rotatable**: Rotation handle on NW (top-left) corner
- **Deletable**: Delete button (×) on NE (top-right) corner handle
- **Persistent**: Shapes are saved with the document
- **Red and Bold**: All shapes use red color (#dc2626) with 5px stroke width
- **Print Support**: Shapes are hidden when printing

#### Note Box Special Features
- **Editable Text**: Click inside to type text
- **White Text**: Text displays in white on red background
- **Text Wrapping**: Text wraps at rectangle boundary
- **Fixed Font Size**: 12px font size (no auto-resizing)
- **Vertical Centering**: Text is automatically centered vertically
- **Horizontal Centering**: Text is centered horizontally
- **Text Persistence**: Text is saved with the shape

### Shape Management
- **Position**: Shapes can be positioned anywhere on the form
- **Constraints**: Shapes are constrained to container bounds
- **Rotation**: Shapes can be rotated 0-360 degrees
- **Data Storage**: Shapes stored in `shapes` array in embedded data
- **Load/Save**: Shapes are preserved when loading saved files

## Technical Changes

### Data Structure Updates
```javascript
{
  header: { ... },
  operations: [ ... ],
  revisionLog: [ ... ],
  shapes: [
    {
      id: string,
      type: 'circle' | 'arrow' | 'rectangle' | 'notebox',
      x: number,
      y: number,
      width: number,
      height: number,
      rotation: number (0-360),
      text: string (only for notebox)
    }
  ],
  isLocked: boolean
}
```

### New Functions
- `handleShapeDragStart(event)` - Initiates drag from palette
- `handleDragOver(event)` - Handles drag over container
- `handleDragLeave(event)` - Handles drag leave from container
- `handleShapeDrop(event)` - Handles shape drop on form
- `renderShapes()` - Renders all placed shapes
- `removeShape(shapeId)` - Removes a shape
- `startResize(shapeId, handle, e)` - Initiates shape resize
- `handleResize(e)` - Handles resize operation
- `stopResize()` - Completes resize operation
- `startRotate(shapeId, e)` - Initiates shape rotation
- `handleRotate(e)` - Handles rotation operation
- `stopRotate()` - Completes rotation operation
- `centerTextVertically()` - Centers note box text vertically (internal)

### CSS Updates
- Added `.shape-palette` styles for palette grid layout
- Added `.shape-item` styles for draggable palette items
- Added `.placed-shape` styles for shapes on form
- Added `.resize-handle` styles for resize handles
- Added `.rotate-handle` styles for rotation handle
- Added `.shape-delete-btn` styles for delete button
- Added `.note-box-text` styles for note box textarea
- Updated `.widget-sidebar` to include shape palette widget
- Print styles hide shapes (`.placed-shape { display: none; }`)

### JavaScript Updates
- Added `shapes` array to store placed shapes
- Updated `getFormData()` to include shapes
- Updated `setFormData()` to restore shapes
- Updated `newDocument()` to clear shapes
- Updated `applyLockState()` to show/hide shape palette widget
- Updated `toggleWidget()` to include shapePalette
- Updated `renderShapes()` to handle rotation and note box text centering

### Reference Data Updates
No changes to reference data structure.

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, drag-and-drop API support

## Migration from Version 6.0

### Data Compatibility
- Version 7.0 can load Version 6.0 files
- Shapes array will be empty for old files (new feature)
- All existing data structures remain compatible
- No breaking changes to data format

### Visual Changes
- New Shape Palette widget in sidebar (only visible when unlocked)
- Shapes can be placed on the form
- Widget sidebar may appear wider when shape palette is expanded

### Breaking Changes
- None - this is an additive feature

## Known Issues
- None reported

## Next Steps (Future Versions)
- Additional shape types as needed
- Shape grouping/alignment features
- Copy/paste shapes
- Shape layers/z-index management
- Additional note box formatting options
- Server integration for reference data (Phase 2)

## Backup Instructions

Before making changes for Version 8:
1. Save a copy of `index.html` as `index_v7.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version

---

**This version is stable and production-ready. Use as baseline for Version 8 development.**





