# Version 15.0 - Release Notes

## Release Date
Previous Release

## Status
✅ Production Ready - Stable Release

## Summary
Version 15.0 introduces professional directory structure, improved file naming, new widgets for locked state (Form Feedback, Metric Converter, Quick Links), and enhanced fixture field functionality. This version focuses on better organization, user feedback capabilities, and improved usability.

## New Features & Changes

### Professional Directory Structure

#### Project Organization
- **Reorganized project files** into logical directories for better maintainability
- **Created `docs/` folder** - All version documentation files (VERSION_1.0.md through VERSION_14.0.md)
- **Created `data/` folder** - Data files (CSV, XLS for tool import)
- **Created `examples/` folder** - Example HTML files for tool import
- **Created `.gitignore`** - Git ignore rules for common files
- **Updated README.md** - Added project structure documentation

#### Benefits
- Cleaner root directory with only essential files
- Better organization for version history and documentation
- Easier to locate and manage project files
- Professional project structure

### Enhanced File Naming

#### Save Dialog Improvements
- **Previous**: Files saved as `setup_sheet_{partNumber}.html`
- **New**: Files saved as `(Part Number) Part Description - Process Packet.html`
- **Example**: If Part Number is "SSP-525" and Part Description is "4135 Bottom Forging Die", the file saves as "(SSP-525) 4135 Bottom Forging Die - Process Packet.html"
- **Fallback handling**: Handles cases where Part Number or Part Description are empty

#### Browser Tab Title
- **Changed**: Browser tab title from "Program Process Sheet" to "Process Packet"
- **Consistency**: Matches the new naming convention throughout the application

### Form Feedback Widget

#### New Widget for Locked State
- **Visibility**: Only visible when form is locked
- **Purpose**: Allows users to submit feedback about the form
- **Fields**:
  - Name field (required)
  - Feedback textarea (required)
- **Integration**: Sends feedback to Power Automate workflow via HTTP POST
- **JSON Schema**: `{ "name": "string", "message": "string" }`
- **User Experience**: Shows success/error messages with automatic form reset

#### Features
- Collapsible widget matching other widget styles
- Real-time validation
- Error handling with detailed console logging
- Automatic form clearing after successful submission

### Metric Converter Widget

#### New Calculator Widget
- **Visibility**: Only visible when form is locked
- **Location**: Positioned after Drilling Calculator widget
- **Functionality**: Converts between millimeters (mm) and inches
- **Auto-switching**: "To" unit automatically switches when "From" unit changes
- **Conversions**:
  - mm to inches: × 0.0393701
  - inches to mm: × 25.4
- **Precision**: Results formatted to 6 decimal places (trailing zeros removed)

#### User Experience
- Real-time conversion as you type
- Clean, simple interface matching other calculator widgets
- Supports bidirectional conversion

### Quick Links Widget (Locked State)

#### New Quick Links Widget for Locked Form
- **Visibility**: Only visible when form is locked
- **Purpose**: Provides quick access to external resources when form is locked
- **Styling**: Matches the Quick Links widget visible when form is unlocked
- **Links**:
  - **FSWizard**: Links to https://app.fswizard.com/speed-and-feed-calculator
- **Structure**: Same collapsible widget structure with icon and label styling

#### Benefits
- Consistent user experience between locked and unlocked states
- Easy access to speed and feed calculator
- Expandable for additional locked-state quick links

### Fixture Field Enhancement

#### Improved Fixture Field Functionality
- **Previous**: Dropdown select only
- **New**: Text input with datalist (supports typing and dropdown selection)
- **Behavior**: Matches "Last Reviewed By" field functionality
- **Features**:
  - Type custom fixture names
  - Select from dropdown suggestions
  - Tab-key autocomplete (type a few letters and press Tab to complete)
  - Datalist with predefined options

#### New Fixture Option
- **Added "Clamps"** to fixture types dropdown
- **Complete list**: Vise, Chuck, Angle Plate, Magnet, Angle Plate & Magnet, Clamps

#### Technical Implementation
- Changed from `<select>` to `<input type="text">` with `<datalist>`
- Added autocomplete setup using `setupAutocompleteForField()`
- Populates datalist with fixture types on operation render
- Maintains backward compatibility with existing data

## Technical Details

### Directory Structure Changes
```
PP_Trial2/
├── index.html              # Main application file
├── README.md               # Documentation
├── .gitignore             # Git ignore rules
├── docs/                  # Version documentation
├── data/                  # Data files (CSV, XLS)
└── examples/              # Example HTML files
```

### New Functions
- `generateSaveFileName()` - Generates formatted filename for save dialog
- `sendFormFeedback()` - Handles form feedback submission to Power Automate
- `convertMetric()` - Converts between mm and inches
- `updateConverterFields()` - (Removed in this version, simplified to single converter)

### Updated Functions
- `saveAsDocument()` - Now uses `generateSaveFileName()` for suggested filename
- `downloadHTML()` - Now uses `generateSaveFileName()` for download filename
- `applyLockState()` - Added visibility control for new locked-state widgets

### Widget Visibility Matrix

| Widget | Unlocked | Locked |
|--------|----------|--------|
| Shape Palette | ✅ | ❌ |
| Workholding Palette | ✅ | ❌ |
| Tool Import | ✅ | ❌ |
| Quick Links (Unlocked) | ✅ | ❌ |
| Milling Calculator | ❌ | ✅ |
| Drilling Calculator | ❌ | ✅ |
| Metric Converter | ❌ | ✅ |
| Request Assistance | ❌ | ✅ |
| Form Feedback | ❌ | ✅ |
| Quick Links (Locked) | ❌ | ✅ |

## Migration Notes

### File Structure
- Existing files continue to work without changes
- No data migration required
- New directory structure is optional for existing projects

### Fixture Field
- Existing fixture values are preserved
- Custom fixture values continue to work
- New "Clamps" option available in all operations

### Save Files
- Old files can still be opened normally
- New files will use the new naming format
- No breaking changes to file format

## Known Issues

None - all issues resolved in Version 15.0

## Version History

### Version 15.0 (Current)
- Professional directory structure reorganization
- Enhanced file naming with Part Number and Description
- Browser tab title changed to "Process Packet"
- Form Feedback widget for locked state
- Metric Converter widget (mm ↔ inches)
- Quick Links widget for locked state with FSWizard
- Fixture field enhanced with typing support and "Clamps" option

### Version 14.0
- Multiple setup images per operation with navigation
- Enhanced form validation with red border highlighting
- Improved lock state functionality

---

**Version**: 15.0  
**Last Updated**: Current  
**Status**: Production Ready

