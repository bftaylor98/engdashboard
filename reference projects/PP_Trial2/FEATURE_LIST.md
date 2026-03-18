# Process Packet Form - Complete Feature List

This document describes all the features available in the Process Packet form, from major tools and widgets to small helpful features.

## Major Features and Tools

### File Management
- **New Document**: Start a completely fresh form with all fields cleared
- **Save Document**: Save your current work to the same file you opened
- **Save As**: Create a new file with a different name (automatically names files with part number and description)
- **Open Document**: Load a previously saved form file
- **Download/Upload**: Alternative way to save and open files if your browser doesn't support the newer file system features

### Form Locking System
- **Password Protection**: The form starts locked and requires a password to edit
- **Multi-User Support**: Each user has their own password (no username needed - the system identifies you by password)
- **Auto-Lock**: Form automatically locks after 3 minutes of inactivity
- **Keyboard Shortcut**: Press ALT+L to quickly lock or unlock the form
- **Visual Indicators**: Shows who is currently logged in when the form is unlocked
- **Protected Mode**: When locked, most editing is disabled but you can still view everything and save the file

### Operations Management
- **Add Operations**: Create multiple operations for a single part (Primary Operation 1, Primary Operation 2, etc.)
- **Add Secondary Processes**: Add special operations like heat treating, grinding, or welding (shown in red to distinguish them)
- **Collapsible Operations**: Each operation can be collapsed or expanded - only one can be open at a time to keep things organized
- **Remove Operations**: Delete operations you no longer need (with confirmation to prevent accidents)
- **Move Operations**: Reorder operations up or down in the list
- **Insert Operations**: Add a new operation at a specific position in the list
- **Operation Numbering**: Operations are automatically numbered and renumbered when you add or remove them

### Tool Import System
- **Excel Import**: Import tool information directly from Excel files (.xls, .xlsx, .xlsm)
- **HTML Import**: Also supports importing from previously saved HTML form files
- **Automatic Grouping**: Tools are automatically organized by operation based on header rows in your Excel file
- **Multi-Operation Import**: Import multiple groups of tools to multiple operations at once
- **Duplicate Handling**: If the same tool appears multiple times in a row, their runtimes are automatically combined
- **Data Formatting**: Automatically cleans up and formats imported data (rounds numbers, converts time formats, etc.)

### Widget Sidebar Tools

#### Calculators (Available When Form is Locked)
- **Milling Calculator**: Calculate RPM and IPM (inches per minute) from SFM, tool diameter, IPT, and number of teeth
- **Drilling Calculator**: Calculate RPM and feed rate from SFM, tool diameter, and IPR
- **Metric Converter**: Convert between millimeters and inches instantly

#### Tools and Utilities (Available When Form is Unlocked)
- **Shape Palette**: Add visual annotations to setup images (circles, arrows, rectangles, note boxes)
- **Workholding Palette**: Add workholding items to setup images (toe clamps, vee blocks, 1-2-3 blocks)
- **Text Formatting**: Format text in notes and descriptions with bold, italic, underline, colors, and font sizes
- **TMS Tools**: 
  - **C-ID Lookup**: Look up individual tool components to get description, part number, price, and stock information
  - **Stock Check**: Check stock levels for all tools in the form at once (color-coded: green = good, yellow = low, red = out)
- **Operations Functions**: 
  - Move operations up or down
  - Insert new operations at specific positions

#### Communication Tools (Available When Form is Locked)
- **Request Assistance**: Send a request for help to another programmer (sends notification via Power Automate)
- **Form Feedback**: Submit feedback about the form itself

#### Quick Links (Available When Form is Locked)
- **FSWizard**: Direct link to online speed and feed calculator
- **Proshop**: Direct link to the company's production management system
- **Engineering Schedule**: Direct link to the engineering schedule on SharePoint
- **Tool Catalogs**: Dropdown menu with links to 6 manufacturer catalogs (Allied, Harvey Tool, Moldino, Mitsubishi, OSG, Sumitomo)

#### Information Widgets (Available When Form is Locked)
- **Info Box**: Displays Part Number and WO Number at a glance
- **Notes**: Displays tool runout specifications in a table format:
  - Roughing Tools: Maximum radial runout of .005"
  - Finish Tools: Maximum radial runout of .002"
- **Help**: Comprehensive guide on how to use the form when locked, including available widgets, expanding operations, machine coordinates, tool sign-off, and light mode

### Widget Behavior
- **Collapsible**: All widgets start collapsed - click the header to expand them
- **One at a Time**: Only one widget can be expanded at a time to keep the sidebar organized
- **Sticky Sidebar**: The widget sidebar stays visible as you scroll down the form
- **Context-Aware**: Different widgets appear depending on whether the form is locked or unlocked

## Automatic Calculations and Features

### Time Calculations
- **Operation Runtime**: Automatically calculates the total time for each operation by adding up all the tool runtimes
- **Total Runtime**: Automatically calculates the total time for the entire job by adding up all operation runtimes
- **Time Formatting**: Displays times in readable format (45m, 1hr 45m, 2hrs) instead of just minutes
- **Real-Time Updates**: Times update automatically whenever you change tool runtimes

### Tooling Value Calculations
- **Operation Tooling Value**: Automatically calculates the total dollar value of all tools in each operation
- **Total Tooling Value**: Automatically calculates the total dollar value of all tools in the entire job
- **Database Lookup**: Looks up tool prices from the company database using C-ID numbers
- **Automatic Updates**: Values update automatically when the form is locked

### Auto-Fill Features
- **Program Names**: Automatically fills program names based on part number (A-, B-, C- prefixes for first, second, third operations)
- **Current Revision**: Automatically updates the current revision number from the revision log
- **Tool Library**: 36 common tools are stored in a library - when you enter a tool number (1-36), it automatically fills in description, corner radius, stickout, holder type, and cooling method
- **C-ID Auto-Lookup**: When you enter a C-ID and tab out of the field, it automatically looks up and fills in the tool description

### Autocomplete Fields
- **Programmer Names**: Type a few letters and press Tab to complete programmer names
- **Last Reviewed By**: Same autocomplete as programmer names
- **Axis X**: Suggests "Center of Stock" or "Center of Part"
- **Axis Y**: Suggests "Center of Stock" or "Center of Part"
- **Axis Z**: Suggests "Top of Part", "Top after skimming flat", or "Top after decking to thickness"
- **Custom Values**: You can always type your own custom values - autocomplete is just a helper

## Visual and Display Features

### CTS Water Banner
- **Automatic Detection**: Automatically detects when any tool uses CTS (through-spindle) cooling
- **Visual Warning**: Shows a blue "CTS Required" banner at the top of the form when CTS cooling is detected
- **Machine-Specific**: Only appears when the machine type is Hurco (not Mazak)

### Dynamic Theming
- **Hurco Theme**: Blue and black color scheme (default)
- **Mazak Theme**: Orange and black color scheme
- **Automatic Switching**: Theme changes automatically when you select the machine type in "Programmed For" field
- **Consistent Styling**: All buttons, borders, and accents change color to match the theme

### Light Mode
- **Toggle Button**: Click the sun icon in the header toolbar (next to the lock button) to switch between dark and light mode
- **Dark Mode (default)**: Black-based gradients with white text
- **Light Mode**: White-based gradients with black text — all backgrounds, inputs, tables, headers, and widgets adapt
- **Works with Both Themes**: Light mode applies to both Hurco (blue) and Mazak (orange) themes
- **Display Only**: Light mode is a viewing preference that does not save with the form — forms always open in dark mode
- **Always Available**: The toggle works in both locked and unlocked states

### Image Management
- **Multiple Images**: Each operation can have multiple setup images
- **Image Navigation**: Use arrow buttons to navigate between images (Image 1 of 3, etc.)
- **Upload Images**: Upload images from your computer
- **Paste Images**: Paste images directly from your clipboard (great for screenshots)
- **Image Storage**: Images are stored inside the HTML file itself (no separate image files needed)
- **FRONT Label**: First image is automatically labeled "FRONT"
- **Image Restrictions**: When form is locked, you cannot add, remove, or change images

### Shape and Annotation Tools
- **Resizable Shapes**: All shapes can be resized by dragging the corners
- **Rotatable Shapes**: Rotate shapes by dragging the rotation handle
- **Deletable Shapes**: Click the X button to remove shapes
- **Note Boxes**: Special text boxes that you can type in (white text on red background)
- **Operation-Scoped**: Shapes are tied to specific operations and only show when that operation is expanded
- **Locked State**: When form is locked, shapes cannot be moved, resized, rotated, or edited

## Data Entry Features

### Tables and Lists
- **Add Rows**: Add new rows to tooling tables, compensation programs, and revision log
- **Remove Rows**: Delete rows you don't need
- **Drag and Drop**: Reorder tool rows by dragging the hamburger icon (☰)
- **Required Field Validation**: Red borders highlight fields that must be filled in (T#, Description, Rad, S.O., Holder, Cooling, Time)
- **Character Limits**: Fields have appropriate character limits to keep data clean

### Dropdown Menus
- **Material Selection**: Choose from predefined materials (4140 PH, F-Xtra T2, Aluminum, Stainless Steel, etc.)
- **Fixture Types**: Select from common fixture types (Vise, Chuck, Angle Plate, Magnet, Clamps, etc.)
- **Cooling Types**: Select cooling method (Flood, Air, CTS, ATS, Superflow, Oil)
- **Machine Types**: Select machine type for each operation (Mill, Lathe, HBM)
- **Programmed For**: Select which machine or cell the program is for (Hurco, Mazak)

### Special Fields
- **Machine Coordinates**: Separate fields for each axis (X, Y, Z, and W for HBM machines) to record actual machine coordinates
- **Axis W**: Only appears when Machine Type is set to HBM (Horizontal Boring Mill)
- **Compensation Programs**: Optional table that can be shown or hidden
- **General Notes**: Free-form text area for each operation
- **Fixturing Notes**: Special notes area for setup information

### Revision Tracking
- **Revision Log Table**: Track all changes made to the program
- **Automatic Revision Update**: Current revision number automatically updates from the most recent revision log entry
- **Add Revision Entries**: Record date, programmer, work order number, description, and new revision number

## Small Helpful Features

### Form Number Footer
- **ISO-9001 Compliance**: Shows form number "FRM-PRD-35 Version 33.0" at the bottom of every form

### WO Number Hyperlink
- **Clickable Link**: When form is locked, the WO (Work Order) Number becomes a clickable link that opens the work order in the company system

### Tab Navigation
- **Smart Tab Order**: Tab key moves through fields in logical order
- **Tab Completion**: Press Tab in autocomplete fields to auto-complete the value

### Print-Friendly Design
- **Clean Print Layout**: When printing, all editing buttons and widgets are hidden
- **Professional Format**: Form prints cleanly on paper with proper formatting

### Data Persistence
- **Everything Saved**: All data, images, and shapes are saved inside a single HTML file
- **No External Files**: You don't need to keep track of separate image files or data files
- **Portable**: The HTML file can be moved, copied, or emailed and everything is included

### Error Prevention
- **Confirmation Dialogs**: Asks for confirmation before removing operations
- **Data Validation**: Highlights required fields that are empty
- **Safe Data Sync**: Prevents data loss when adding or removing rows

### User Experience
- **Dark Mode**: Easy on the eyes with dark backgrounds and light text
- **Responsive Design**: Form adapts to different screen sizes
- **Smooth Animations**: Buttons and widgets have smooth transitions
- **Visual Feedback**: Buttons change appearance when you hover over them
- **Status Messages**: Shows success or error messages for actions like requesting assistance

## Integration Features

### Database Integration
- **C-ID Lookup**: Connects to company database to look up tool information
- **Stock Checking**: Checks real-time stock levels from the database
- **Price Lookup**: Retrieves current tool prices for value calculations

### Power Automate Integration
- **Request Assistance**: Sends notifications to other programmers via Microsoft Power Automate
- **Form Feedback**: Submits feedback to a Power Automate workflow

### Server Logging (Background)
- **Edit Tracking**: Automatically logs changes made to the form (runs in background, invisible to user)
- **Change History**: Creates log files that track what was changed and when

## Summary

This form is designed to be a complete replacement for Excel-based process packets. It includes everything you need to create, manage, and share CNC program setup sheets, from basic data entry to advanced tools like calculators, shape annotations, and database lookups. All features work together seamlessly, and the form automatically handles calculations, formatting, and data management so you can focus on creating accurate setup documentation.











