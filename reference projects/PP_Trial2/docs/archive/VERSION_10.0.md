# Version 10.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 10.0 introduces a multi-user authentication system, Quick Links widget for easy access to external resources, enhanced lock state functionality, and improved user experience features. Key improvements include password-only authentication, visual user display, operation expand/collapse when locked, and image upload restrictions.

## New Features & Changes

### Multi-User Authentication System

#### Individual User Passwords
- **Password-Only Authentication**: Users only need to enter their password (no username required)
- **Automatic User Identification**: System automatically identifies which user logged in based on password
- **User Credentials**:
  - Alex Vincent - LSU0109
  - Brad Taylor - falcon9
  - Damien McDaniel - EstDamien1!
  - Michael Wardlow - @MLW1994!
  - Thad Slone - EdgeCAM-86

#### User Display Indicator
- **Visual Feedback**: Logged-in user's name displayed in header with user icon
- **Position**: Located between title and header buttons
- **Styling**: Theme-aware (blue for Hurco, orange for Mazak)
- **Visibility**: Only visible when form is unlocked and user is logged in
- **Auto-Hide**: Automatically hidden when form is locked or user logs out

#### Security Messages
- **Invalid Login**: "Invalid password. Access denied. This attempt has been logged."
- **Session Tracking**: Messages suggest user activity is being tracked to discourage password sharing

### Quick Links Widget

#### Widget Location
- **Quick Links Widget**: Added to widget sidebar (after Request Assistance)
- **Visibility**: Only visible when form is unlocked
- **Collapsible**: Follows same collapse/expand behavior as other widgets

#### Quick Link Items
1. **Proshop**: Direct link to https://est.adionsystems.com/
   - Opens in new tab
   - Icon-based link with hover effects

2. **Engineering Schedule**: Direct link to SharePoint document
   - Opens in new tab
   - Icon-based link with hover effects

3. **Tool Catalogs**: Dropdown menu with tool manufacturer catalogs
   - Manufacturers listed in alphabetical order:
     - Allied
     - Harvey Tool
     - Moldino
     - Mitsubishi
     - OSG
     - Sumitomo
   - Opens selected catalog in new tab
   - Dropdown resets after selection

### Lock State Enhancements

#### Operation Expand/Collapse When Locked
- **Feature**: Operations can now be expanded and collapsed even when form is locked
- **Use Case**: Allows viewing operation details without unlocking the form
- **Implementation**: Collapse button excluded from form-locked button disabling

#### Image Upload Restrictions
- **Locked State**: Image upload, paste, and remove buttons are disabled when form is locked
- **Visual Feedback**: Buttons show reduced opacity and "Form is locked" tooltip
- **Functionality**: All image functions check lock state and show alert if attempted when locked
- **CSS**: Added styles to disable image buttons when locked

### Operation Removal Confirmation
- **Confirmation Dialog**: Added "Are you sure?" confirmation when removing operations
- **User Experience**: Prevents accidental operation deletion
- **Message**: Shows operation name in confirmation prompt

## Technical Changes

### Data Structure Updates
```javascript
// No changes to embedded data structure
// User authentication is session-based (not persisted)
```

### CSS Updates
- Added `.user-display` styles for logged-in user indicator
- Added `.quick-links-container` styles for Quick Links widget
- Added `.quick-link-item` styles for individual links
- Added `.quick-link-select` styles for Tool Catalogs dropdown
- Added `.form-locked .collapse-btn` override to allow expansion when locked
- Added `.form-locked .image-upload-btn`, `.image-paste-btn`, `.image-remove-btn` styles

### JavaScript Updates

#### New Functions
- `updateUserDisplay()` - Updates the visual user display indicator
- `openToolCatalog(url)` - Opens selected tool catalog in new tab

#### Updated Functions
- `toggleLock()` - Updated to use password-only authentication with user lookup
- `removeOperation()` - Added confirmation dialog
- `handleImageUpload()` - Added lock state check
- `pasteImage()` - Added lock state check
- `removeImage()` - Added lock state check
- `applyLockState()` - Updated to show/hide Quick Links widget and update user display
- `toggleWidget()` - Added 'quickLinks' to widget list
- `newDocument()` - Added Quick Links widget reset and currentUser reset
- `resetInactivityTimer()` - Updated to clear currentUser on auto-lock
- `setFormData()` - Resets currentUser when loading files

### HTML Structure Updates
- Added user display element in header-container
- Added Quick Links widget HTML in widget sidebar
- Updated image control buttons with conditional styling based on lock state

### Reference Data Updates
No changes to reference data structure.

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, keyboard event support

## Migration from Version 9.0

### Data Compatibility
- Version 10.0 can load Version 9.0 files
- All existing data structures remain compatible
- No breaking changes to data format
- User authentication is session-based (not saved in files)

### Visual Changes
- User display indicator appears in header when logged in
- Quick Links widget available in sidebar (when unlocked)
- Image buttons disabled when locked
- Operations can be expanded/collapsed when locked

### Breaking Changes
- **Authentication**: Changed from single password (123) to multi-user password system
- **Old Password**: Password "123" no longer works
- **Image Upload**: Image functions disabled when form is locked

## Known Issues
- None reported

## Next Steps (Future Versions)
- Additional quick links as needed
- Additional tool manufacturers as needed
- Server integration for reference data (Phase 2)
- Additional validation or features as needed
- User activity logging (if actual tracking is desired)

## Backup Instructions

Before making changes for Version 11:
1. Save a copy of `index.html` as `index_v10.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version

---

**This version is stable and production-ready. Use as baseline for Version 11 development.**




