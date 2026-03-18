# Version 4.0 - Release Notes

## Release Date
Current

## Status
✅ Production Ready - Stable Release

## Summary
Version 4.0 introduces a widget sidebar system with three new calculator and assistance widgets. The layout has been enhanced with a right-side widget panel, and new functionality includes milling/drilling calculators and a Power Automate-integrated assistance request system. Visual improvements include white text for headings and operation titles.

## New Features & Changes

### Layout & Design
- **Widget Sidebar**: Added 300px wide widget sidebar on the right side of the form
- **Main Wrapper**: Form now uses flexbox layout to accommodate both main container and widget sidebar
- **Text Color Updates**: 
  - "Program Process Sheet" heading changed to white text (removed gradient)
  - Operation titles (e.g., "Primary Operation 1") changed to white text (removed gradient)

### Widget System
- **Collapsible Widgets**: All widgets are collapsible with ▼ button
- **Single Widget Expansion**: Only one widget can be expanded at a time (expanding one collapses others)
- **Auto-Collapsed**: All widgets start collapsed by default
- **Widget Styling**: Consistent styling across all widgets matching the application theme

### Milling Calculator Widget
- **Inputs**: SFM, Tool Dia (inches), IPT, # of Teeth
- **Calculations**:
  - RPM = (3.82 × SFM) / Tool Dia
  - IPM = RPM × IPT × # of Teeth
- **Output Format**: RPM rounded to whole number, IPM rounded to whole number (no decimals)
- **Real-time Updates**: Calculations update automatically as you type

### Drilling Calculator Widget
- **Inputs**: SFM, Tool Dia (inches), IPR
- **Calculations**:
  - RPM = (3.82 × SFM) / Tool Dia
  - Feed Rate = IPR × RPM
- **Output Format**: Both RPM and Feed Rate rounded to whole numbers
- **Real-time Updates**: Calculations update automatically as you type

### Request Assistance Widget
- **Programmer Dropdown**: Select from all available programmers
- **Location Field**: Text input for location
- **Power Automate Integration**: Sends HTTP POST request to Power Automate workflow
- **Request Flow**:
  1. Validates both Programmer and Location are filled
  2. Shows "Sending request..." while processing
  3. Shows "Request sent" (green) on success
  4. Shows error message (red) on failure
  5. Auto-resets form after 2 seconds (success) or 3 seconds (error)
- **Power Automate Schema**:
  ```json
  {
    "requestedPerson": "Programmer Name",
    "location": "Location Value"
  }
  ```
- **Power Automate URL**: Configured endpoint for assistance requests

## Technical Changes

### HTML Structure
- Added `.main-wrapper` flex container
- Added `.widget-sidebar` container (300px width)
- Added `.widget` class for individual widgets
- Added `.widget-header` and `.widget-content` for collapsible structure

### CSS Updates
- **Widget Styling**:
  ```css
  .widget-sidebar {
      width: 300px;
      flex-shrink: 0;
  }
  .widget {
      background: #1a1a1a;
      padding: 20px;
      border-radius: 16px;
  }
  ```
- **Widget Collapse**:
  ```css
  .widget-content.collapsed {
      display: none;
  }
  ```
- **Message Styling**: Success (green) and error (red) message styles for Request Assistance widget
- **Print Styles**: Widget sidebar hidden in print view, container uses full width

### JavaScript Functions

#### New Functions
- `toggleWidget(widgetId)` - Toggles widget collapse/expand state, ensures only one expanded at a time
- `calculateMilling()` - Calculates RPM and IPM for milling operations
- `calculateDrilling()` - Calculates RPM and Feed Rate for drilling operations
- `sendAssistanceRequest()` - Sends assistance request to Power Automate via HTTP POST

#### Updated Functions
- `newDocument()` - Now resets all widget states and clears widget inputs
- `loadReferenceData()` - Populates Request Assistance programmer dropdown

### Data Structure
No changes to embedded data structure. Widget data is not persisted (calculators are stateless, assistance requests are sent immediately).

## Browser Support
- **Primary**: Chrome 86+, Edge 86+ (File System Access API support)
- **Fallback**: All modern browsers (download/upload via file input)
- **Required**: JavaScript enabled, fetch API support for Power Automate integration

## Migration from Version 3.0

### Data Compatibility
- Version 4.0 can load Version 3.0 files
- All existing data structures remain compatible
- No breaking changes to data format
- Widget states are not saved (always start collapsed)

### Visual Changes
- Form layout now includes widget sidebar on the right
- Headings and operation titles now display in white instead of gradient colors
- Widget sidebar is hidden when printing

## Known Issues
- None reported

## Next Steps (Future Versions)
- Additional calculator widgets as needed
- Widget state persistence (optional)
- Additional Power Automate integrations
- Server integration for reference data (Phase 2)

## Backup Instructions

Before making changes for Version 5:
1. Save a copy of `index.html` as `index_v4.0.html`
2. Document any changes in version control
3. Test thoroughly before marking as new version

---

**This version is stable and production-ready. Use as baseline for Version 5 development.**

