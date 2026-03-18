# Version 8.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 8.0 introduces a Workholding Palette feature with draggable CNC workholding components (Toe Clamp, Vee Block, 1-2-3 Block) that can be placed on operation images. Workholding items are fully resizable, rotatable, and persist with the document. Shapes are now scoped to individual operations, collapsing and expanding with their parent operation.

## New Features & Changes

### Workholding Palette Widget

#### Widget Location
- **Workholding Palette Widget**: Added below Shape Palette widget in widget sidebar
- **Visibility**: Only visible when form is unlocked
- **Collapsible**: Follows same collapse/expand behavior as other widgets
- **Same Design**: Matches Shape Palette styling and layout

#### Available Workholding Items
1. **Toe Clamp**: CNC toe clamp with keyhole/tag shape and vertical oval cutout
2. **Vee Block**: CNC vee block with V-shaped groove and stacked layers
3. **1-2-3 Block**: CNC 1-2-3 block with three circular holes (no text)

#### Workholding Item Features
- **Drag and Drop**: Drag items from palette onto operation image containers
- **Resizable**: Four corner resize handles (SE, SW, NE, NW)
- **Rotatable**: Rotation handle on NW (top-left) corner
- **Deletable**: Delete button (×) on NE (top-right) corner handle
- **Persistent**: Items are saved with the document
- **Grey Styling**: All items use grey fill (#777) with dark stroke (#222)
- **Print Support**: Items are hidden when printing
- **Custom SVGs**: Each item uses vector path data from provided SVG files

### Shape Scoping to Operations

#### Operation-Scoped Shapes
- **Per-Operation**: Shapes and workholding items are now associated with specific operations
- **Collapse/Expand**: Shapes hide when their operation is collapsed and reappear when expanded
- **Position Persistence**: Shapes maintain their position when operations are collapsed and re-expanded
- **Image Container Only**: Shapes can only be dropped into operation image containers (Part Setup View area)
- **Operation Index**: Each shape stores an `operationIndex` to associate it with its operation

### Shape Lock State Integration

#### Lock/Unlock Behavior
- **Locked State**: When form is locked, shapes cannot be moved, resized, rotated, or edited
- **Visual Feedback**: Locked shapes show default cursor and no hover outline
- **Resize Handles**: Resize, rotation, and delete handles are hidden when locked
- **Text Editing**: Note box text inputs are read-only when locked
- **Auto-Update**: Shapes update their locked/unlocked state when lock state changes

### Widget Scrolling

#### Sticky Widget Sidebar
- **Sticky Positioning**: Widget sidebar now uses `position: sticky` with `top: 20px`
- **Scrolls with Page**: Widgets remain visible while scrolling the main form content
- **Max Height**: Sidebar has `max-height: calc(100vh - 40px)` with `overflow-y: auto` for internal scrolling
- **Better UX**: Users can access widgets without scrolling back to top

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
      type: 'circle' | 'arrow' | 'rectangle' | 'notebox' | 'toeclamp' | 'veeblock' | '123block',
      operationIndex: number, // NEW: Associates shape with specific operation
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
- Updated `handleShapeDrop()` to detect which operation's image container the drop is in
- Updated `renderShapes()` to filter by expanded operations and position relative to image containers
- Updated `toggleOperation()` to call `renderShapes()` after toggling
- Updated `applyLockState()` to re-render shapes when lock state changes
- Updated drag/resize/rotate handlers to work with image container positioning

### CSS Updates
- Added `position: relative` to `.image-container` for shape positioning
- Added `.shape-locked` class styles for locked shape appearance
- Updated `.widget-sidebar` with sticky positioning and scrolling
- Added `.shape-preview.veeblock-preview` for larger vee block icon
- Updated workholding item viewBoxes for tight bounding boxes

### JavaScript Updates
- Added `operationIndex` to shape data structure
- Updated `handleShapeDrop()` to detect operation from image container ID
- Updated `renderShapes()` to:
  - Filter shapes by expanded operations
  - Position shapes relative to image containers
  - Append shapes to image containers instead of main container
  - Only render shapes for expanded operations
- Updated `toggleOperation()` to re-render shapes after toggling
- Updated `renderOperations()` to call `renderShapes()` after rendering
- Updated drag/resize/rotate handlers to use image container coordinates
- Updated `setFormData()` to migrate old shapes (without operationIndex) to first operation
- Updated `applyLockState()` to re-render shapes when lock changes
- Added workholding item rendering with custom SVGs and viewBoxes

### Reference Data Updates
No changes to reference data structure.

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, drag-and-drop API support

## Migration from Version 7.0

### Data Compatibility
- Version 8.0 can load Version 7.0 files
- Shapes without `operationIndex` will be migrated to operation 0 (first operation)
- All existing data structures remain compatible
- No breaking changes to data format

### Visual Changes
- New Workholding Palette widget in sidebar (below Shape Palette)
- Shapes are now scoped to operations (only visible when operation is expanded)
- Widget sidebar scrolls with the page (sticky positioning)
- Shapes are disabled when form is locked

### Breaking Changes
- None - this is an additive feature with backward compatibility

## Known Issues
- None reported

## Next Steps (Future Versions)
- Additional workholding items as needed
- Additional shape types as needed
- Shape grouping/alignment features
- Copy/paste shapes
- Shape layers/z-index management
- Additional note box formatting options
- Server integration for reference data (Phase 2)

## Backup Instructions

Before making changes for Version 9:
1. Save a copy of `index.html` as `index_v8.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version

---

**This version is stable and production-ready. Use as baseline for Version 9 development.**





