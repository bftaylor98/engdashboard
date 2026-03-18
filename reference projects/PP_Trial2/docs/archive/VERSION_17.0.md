# Version 17.0 - Release Notes

## Release Date
Previous

## Status
✅ Resolved - All issues fixed in Version 18.0

## Summary
Version 17.0 introduces Secondary Processes feature, allowing users to insert non-machining operations (heat treat, grinding, welding, etc.) between primary operations. This version also includes UI improvements to operation management widgets and enhanced operation numbering. **Note: Insert Operation button issues were fixed in Version 18.0.**

## New Features & Changes

### Secondary Processes Feature

#### New Operation Type
- **Secondary Processes**: Non-machining operations that can be inserted between primary operations
- **Examples**: Heat treat, grinding, welding, inspection, etc.
- **Visual Distinction**: Red color scheme with distinct styling to differentiate from primary operations
- **Simplified UI**: Only requires description and optional image (no program info, tooling, etc.)

#### Secondary Process Structure
- **Type Field**: `type: 'secondary'` to distinguish from primary operations
- **Fields**:
  - Description (textarea)
  - Image upload/paste support (same as primary operations)
  - Image caption
- **No Program Info**: Secondary processes don't have program names, tooling, or compensation programs

#### Visual Styling
- **Red Color Scheme**: 
  - Red borders (#ef4444) with 8px left accent border
  - Dark red-tinted background gradient
  - Red text with subtle glow effects
  - Red section headers with matching borders
- **Distinct Appearance**: Clearly stands out from primary operations
- **Hover Effects**: Enhanced red glow on hover

### Operation Management Enhancements

#### Add Secondary Process Button
- **Location**: Below all operations, next to "Add Operation" button
- **Styling**: Red button to match secondary process theme
- **Functionality**: Adds secondary process at the end of operations list
- **Auto-numbering**: Secondary processes numbered independently (Secondary Process 1, 2, etc.)

#### Combined Insert Widget
- **Merged Widgets**: "Insert Secondary Process" functionality merged into "Insert Operation" widget
- **Two Sections**:
  - "Insert Primary Operation before" (blue button)
  - "Insert Secondary Process before" (red button)
- **Consolidated Interface**: Single widget for all insertion operations

#### Independent Operation Numbering
- **Primary Operations**: Numbered independently (Primary Operation 1, 2, 3...)
- **Secondary Processes**: Numbered independently (Secondary Process 1, 2, 3...)
- **Example**: If you have Primary OP 1, Secondary Process 1, then Primary OP 2, the numbering is correct
- **Dropdown Display**: Dropdowns show correct operation numbers matching actual labels

### Updated Functions
- `addSecondaryProcess()` - Adds secondary process at end of operations
- `executeInsertSecondaryProcess()` - Inserts secondary process at specific position
- `updateOperationTitlesAndProgramNames()` - Numbers primary and secondary operations independently
- `updateOperationManagementDropdowns()` - Shows correct operation numbers in dropdowns
- `renderOperations()` - Renders secondary processes with simplified UI
- `syncData()` - Handles secondary process data fields
- `setFormData()` - Backward compatible, defaults operations to 'primary' type

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

## Known Issues

### ⚠️ Insert Operation Buttons Not Working (RESOLVED in Version 18.0)
- **Issue**: The "Insert" buttons in the Insert Operation widget were not functioning
- **Affected**: Both "Insert Primary Operation" and "Insert Secondary Process" buttons
- **Status**: ✅ Fixed in Version 18.0
- **Resolution**: Fixed `syncData()` function to properly handle secondary processes
- **Note**: This issue has been completely resolved in Version 18.0

## Technical Details

### Data Structure Changes
- Operations now include `type` field: `'primary'` or `'secondary'`
- Secondary processes have simplified structure:
  ```javascript
  {
    id: string,
    type: 'secondary',
    title: 'Secondary Process N',
    collapsed: boolean,
    description: string,
    images: [string],
    currentImageIndex: number,
    imageCaption: string
  }
  ```

### Backward Compatibility
- Existing files default all operations to `type: 'primary'`
- Secondary process fields initialized if missing
- No breaking changes to existing data structure

### CSS Styling
- New `.operation-block.secondary-process` class with red theme
- Red borders, backgrounds, text colors, and hover effects
- Distinct visual appearance from primary operations

## Migration Notes

### Existing Files
- Existing files continue to work without changes
- Operations default to 'primary' type if type field is missing
- No data migration required

### Operation Data
- All operation data preserved during reordering
- Secondary processes maintain their simplified data structure
- Primary operations maintain full data structure

## Version History

### Version 17.0
- Secondary Processes feature with red styling
- Add Secondary Process button
- Combined Insert Operation widget
- Independent operation numbering (primary and secondary)
- Enhanced dropdown display with correct operation numbers
- ⚠️ Known issue: Insert Operation buttons not working (fixed in 18.0)

### Version 16.0
- Move Operations widget for reordering operations
- Insert Operation widget for inserting new operations
- Automatic operation label and program name updates
- Improved operation management workflow

---

**Version**: 17.0  
**Last Updated**: Previous  
**Status**: ✅ Resolved - All issues fixed in Version 18.0

