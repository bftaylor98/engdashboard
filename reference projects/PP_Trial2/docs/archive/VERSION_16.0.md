# Version 16.0 - Release Notes

## Release Date
Previous Release

## Status
✅ Production Ready - Stable Release

## Summary
Version 16.0 introduces Operation Management widgets for reordering and inserting operations. This version adds two new widgets (Move Operations and Insert Operation) that allow users to reorganize operations and automatically update operation labels and program names. These widgets are only visible when the form is unlocked, providing powerful operation management capabilities.

## New Features & Changes

### Move Operations Widget

#### New Widget for Operation Reordering
- **Visibility**: Only visible when form is unlocked
- **Location**: Positioned between Workholding Palette and Tool Import widgets
- **Purpose**: Allows users to reorder existing operations
- **Functionality**:
  - Select an operation to move from dropdown (shows "Operation #" format)
  - Select target operation to move before from dropdown
  - Automatically updates operation labels (OP 1, OP 2, etc.) after reordering
  - Automatically updates program names (A-, B-, C-{PartNumber}) based on new positions

#### Features
- Dropdown shows operations in format: "Operation 1", "Operation 2", etc.
- Includes operation description if available: "Operation 1 - Description"
- "move before" label for clarity
- Success/error message feedback
- Dropdowns automatically refresh after operations change
- Preserves all operation data during reordering

#### User Experience
- Clean, intuitive interface matching other widgets
- Real-time validation (prevents moving operation to same position)
- Clear success messages showing new operation position
- Automatic form synchronization before reordering

### Insert Operation Widget

#### New Widget for Operation Insertion
- **Visibility**: Only visible when form is unlocked
- **Location**: Positioned between Move Operations and Tool Import widgets
- **Purpose**: Allows users to insert new operations at specific positions
- **Functionality**:
  - Select operation to insert before from dropdown
  - Option to insert at end (after last operation)
  - Creates new operation with default values
  - Automatically updates operation labels after insertion
  - Automatically updates program names based on new positions

#### Features
- Dropdown shows all existing operations plus "End" option
- "Insert before" label positioned above dropdown for better layout
- Success/error message feedback
- Dropdowns automatically refresh after insertion
- New operation starts collapsed by default

#### User Experience
- Vertical layout prevents overflow issues
- Clear labeling and instructions
- Automatic numbering and program name assignment
- Seamless integration with existing operation management

### Operation Management Functions

#### New Functions
- `updateOperationManagementDropdowns()` - Populates dropdowns with current operations
- `executeReorder()` - Handles operation reordering logic
- `executeInsert()` - Handles new operation insertion logic
- `updateOperationTitlesAndProgramNames()` - Updates all operation titles and program names after changes
- `showMoveOperationsMessage()` - Displays success/error messages for move operations
- `showInsertOperationMessage()` - Displays success/error messages for insert operations

#### Technical Implementation
- Operations array manipulation with proper index calculation
- Handles edge cases (moving to end, moving before/after)
- Syncs form data before making changes
- Re-renders operations after changes
- Updates program names using existing `updateProgramNames()` function
- Maintains operation IDs and all associated data

## Technical Details

### Widget Structure
- Two separate widgets for better organization
- Consistent styling with other widgets
- Collapsible widget structure
- Message areas for user feedback

### Operation Numbering
- Operations automatically renumbered after reorder/insert
- Format: "Primary Operation 1", "Primary Operation 2", etc.
- Program names automatically updated: A-{PartNumber}, B-{PartNumber}, etc.
- Only updates program names if they match the auto-generated pattern

### Widget Visibility Matrix

| Widget | Unlocked | Locked |
|--------|----------|--------|
| Shape Palette | ✅ | ❌ |
| Workholding Palette | ✅ | ❌ |
| Move Operations | ✅ | ❌ |
| Insert Operation | ✅ | ❌ |
| Tool Import | ✅ | ❌ |
| Quick Links (Unlocked) | ✅ | ❌ |
| Milling Calculator | ❌ | ✅ |
| Drilling Calculator | ❌ | ✅ |
| Metric Converter | ❌ | ✅ |
| Request Assistance | ❌ | ✅ |
| Form Feedback | ❌ | ✅ |
| Quick Links (Locked) | ❌ | ✅ |

### Updated Functions
- `applyLockState()` - Added visibility control for Move Operations and Insert Operation widgets
- `renderOperations()` - Works seamlessly with reordered/inserted operations
- `updateProgramNames()` - Automatically called after operation changes

### Widget IDs
- Added `moveOperations` and `insertOperation` to `allWidgetIds` arrays
- Widget collapse system works with new widgets

## Migration Notes

### Existing Files
- Existing files continue to work without changes
- No data migration required
- New widgets available immediately when form is unlocked

### Operation Data
- All operation data preserved during reordering
- Tooling, images, compensation programs, and all fields maintained
- Operation IDs preserved for data integrity

### Program Names
- Program names automatically updated if they match auto-generated pattern
- Manually edited program names are preserved
- New operations get auto-generated program names

## Known Issues

None - all issues resolved in Version 16.0

## Version History

### Version 16.0 (Current)
- Move Operations widget for reordering operations
- Insert Operation widget for inserting new operations
- Automatic operation label and program name updates
- Improved operation management workflow

### Version 15.0
- Professional directory structure reorganization
- Enhanced file naming with Part Number and Description
- Browser tab title changed to "Process Packet"
- Form Feedback widget for locked state
- Metric Converter widget (mm ↔ inches)
- Quick Links widget for locked state with FSWizard
- Fixture field enhanced with typing support and "Clamps" option

---

**Version**: 16.0  
**Last Updated**: Current  
**Status**: Production Ready

