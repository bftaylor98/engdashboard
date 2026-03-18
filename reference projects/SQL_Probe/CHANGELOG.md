# Changelog - Crib Report (Master Transaction Report)

## v2.2.0 (February 2026)

### UI Changes
- **Matrix Vending transaction table removed** — individual transaction listings eliminated; monthly usage charts retained
- **Monthly usage charts restored** with smoother curves (`tension: 0.4`) — click any Matrix Vending row to expand and view the trend graph
- **Under Minimum Stock and Matrix Vending combined** into a single "📦 Stock Reports" collapsible widget (collapsed by default), keeping them as distinct sub-sections inside
- **Consistent section styling** — all collapsible section headers (Transaction Log, Stock Reports, iPad Kiosk, Door Access) now have identical margins, padding, borders, and font sizes
- **Removed iPad `h2` font-size override** that was making its title larger than the other sections

### Files Modified
- `generate_master_transaction_report.py` — Combined stock widget, chart restoration, consistent section CSS

---

## v2.1.0 (February 2026)

### UI Changes
- **Removed logo** from the report header for a cleaner layout
- **All sections are now collapsible widgets** — each major section has a clickable header with expand/collapse arrow (▶/▼):
  - Transaction Log (expanded by default)
  - Under Minimum Stock (collapsed by default)
  - iPad Kiosk Form Submissions (collapsed by default)
  - Door Access Logs (collapsed by default)
  - Matrix Vending Transaction Report (collapsed by default)
- **Generic `toggleSection()` function** replaces the one-off `toggleDoorSection()` — all sections now use the same toggle mechanism
- **Print media** automatically expands all collapsed sections so nothing is hidden when printing
- **Section toggle styling** — styled headers with hover effects and dark mode support via `.section-toggle` CSS class

### Files Modified
- `generate_master_transaction_report.py` — Logo removal, collapsible section widgets, generic toggle JS

---

## v2.0.0 (February 2026)

### New Feature: Matrix Vending Integration
- **Database**: Connects to Matrix Vending system (192.168.1.36 / EST100)
- **Section**: New "📦 Matrix Vending Transaction Report" section in the master report
- **Data Displayed**:
  - Item description, item code, current stock, minimum quantity
  - Shortage amount, unit price, cost to replenish
  - Average monthly use, max usage (recalculated per period)
- **Interactive Features**:
  - Expandable rows (▶/▼ carets) showing transaction details and Chart.js trend graphs
  - Sortable columns with ascending/descending toggle
  - Period filtering (1 year / 3 years)
  - Below-minimum items highlighted in red
  - Summary cards (total items, below minimum, total shortage, cost to replenish)
  - CSV export
- **Connection**: Optional — report still generates if Matrix Vending DB is unavailable
- **Test File**: `test_report.py` provides a standalone test version (no Power Automate)

### Bug Fixes
- **Fixed JavaScript syntax error** in `sortMatrixTable()` — Python-style ternary (`x if y else z`) was used instead of JavaScript ternary (`y ? x : z`), causing the entire script block to fail and all interactive features (expand, sort, filter) to break
- **Fixed door access log sorting** — Events at 6 AM and 6 PM were appearing next to each other due to alphabetical string sorting of 12-hour time strings. Now uses proper time-to-seconds conversion for chronological ordering
- **Fixed Unicode print errors** on Windows — Replaced `✓` and `⚠` characters with ASCII equivalents to avoid `charmap` codec errors in Windows PowerShell

### UI Improvements
- **Door Access section is now collapsible** — Starts collapsed by default with a clickable ▶/▼ header to expand/collapse
- **Added missing CSS** for Matrix Vending section — expand-icon cursor, transaction-cell styling, transaction-table borders, sortable header hover effects, data-row hover highlighting, dark mode variants

### Files Modified
- `generate_master_transaction_report.py` — Matrix Vending integration + all fixes
- `generate_master_transaction_report_manual.py` — Added Matrix Vending imports and query call
- `test_report.py` — Full test version of master report with Matrix Vending

### File Cleanup
- Removed old test HTML/XML outputs from root directory
- Removed old under minimum stock test reports
- Removed old checkout report from `daily_trans/`
- Cleared `__pycache__/`

---

## v1.0.0 (December 2025)

### Major Features Added

#### 1. Integrated iPad Kiosk Form Submissions
- **Location**: Reads from `../Crib iPad Scripts/backend/data/submissions.jsonl`
- **Sections**: 
  - Accidental Vend submissions (with quantity)
  - Inventory Error submissions (without quantity)
- **Features**:
  - Separate tables for daily and monthly views
  - "Addressed" column showing checkmark (✓) for addressed records
  - Filtered by date (daily = yesterday, monthly = last 30 days)
  - Individual CSV export buttons for each table
  - Empty state messages when no data available

#### 2. Integrated Door Access Logs
- **Source**: Executes `../Ubiquiti_Scripts/query_door_unlocks.py` automatically
- **Data Files**: 
  - `yesterday_crib_door.json` (daily)
  - `last_30_days_crib_door.json` (monthly)
- **Features**:
  - Combines entry/exit pairs within 15 minutes into single records
  - Shows "Time in Room" calculation
  - Color coding:
    - Green: Complete entry/exit pairs
    - Blue: Entry only (no matching exit)
    - Orange: Exit only (no matching entry)
  - Individual CSV export buttons
  - Legend explaining color coding

#### 3. Integrated Under Minimum Stock Reporting
- **Source**: Queries `StorageBooking` table for components under minimum stock
- **Location**: Appears between transaction log and iPad submissions
- **Visibility**: Only shown in Daily view (hidden in Monthly view)
- **Columns**:
  - C-ID (Component ID)
  - Description
  - Part No (with manufacturer hyperlinks)
  - Value (UnitPrice from ValData)
  - Current Stock
  - Under Min (difference from minimum, negative values highlighted)
  - To Max (quantity needed to reach maximum)
  - Price to Fill (Value × To Max)
- **Features**:
  - Total "Price to Fill" row at bottom
  - Email button (✉️) to send RFQ to supplier
  - CSV export button
  - Empty state message when no items under minimum

#### 4. Email Functionality for Under Minimum Stock
- **Recipient**: Pre-filled to `jeff.spencer@wulco.com`
- **Subject**: "Vending Replenishment RFQ - MM/DD/YYYY"
- **Body**: 
  - Greeting: "Jeff,\n\nPlease quote the below items to replenish our vending system.\n\n"
  - Table with Description and Quantity columns
- **Format**: Tab-separated values (TSV) copied to clipboard
  - Pastes as formatted table in Outlook (like Excel)
  - Email body includes TSV data
  - Signature automatically added by email client

### UI/UX Improvements

#### Print Formatting
- Each major section starts on a new page (`page-break-before: always`)
- Sections:
  - Transaction log
  - Under minimum stock
  - iPad submissions
  - Door access logs
- Export buttons hidden when printing
- Proper page breaks to prevent content splitting

#### Individual CSV Exports
- **Transaction Log**: Export button in header (📥 Transactions)
- **Under Minimum Stock**: Export button in section header
- **iPad Submissions**: Export button for each table (Accidental Vend, Inventory Error)
- **Door Access**: Export button for each table (Daily, Monthly)
- Each export includes appropriate headers and data
- Filenames include date and section type

#### Column Header Alignment
- All column headers centered in:
  - iPad kiosk submission tables
  - Door access tables
  - Under minimum stock table

#### Work Order Validation
- **Blank fields**: Display "None Specified" (red highlight)
- **Invalid format**: Display submitted value in bold orange
- **Valid format (XX-XXXX)**: Display as clickable link to work order system

#### Date and Time Formatting
- **Dates**: All formatted as MM/DD/YYYY throughout report
- **Times**: All formatted as 12-hour AM/PM format
- Applied to:
  - Transaction log
  - iPad submissions
  - Door access logs

### Code Improvements

#### Removed Debug Statements
- Cleaned up all DEBUG print statements
- Removed sample date printing
- Cleaner console output

#### Error Handling
- Empty state messages for all sections
- Graceful handling when data files are missing
- User-friendly error messages

#### Performance
- Removed failed Brad Taylor login attempt (now uses SA account only)
- Faster connection time
- Optimized queries

### Report Title Change
- Changed from "Master Transaction Report" to "Crib Report"
- Updated in:
  - HTML title tag
  - Main heading
  - CSV export headers
  - Command-line description

### File Cleanup
- Removed old test HTML reports from `under_minimum_reporting/` directory
- Kept only active scripts and documentation

## Technical Details

### Data Sources Integration

1. **Transaction Data**: Direct SQL queries to ZOLLERDB3
2. **iPad Submissions**: Reads JSONL file from iPad kiosk backend
3. **Door Access**: Executes external Python script, reads JSON output
4. **Under Minimum Stock**: SQL query to StorageBooking table

### Date Handling
- **Daily Report**: Defaults to yesterday's date
- **Monthly Report**: Last 30 days up to today
- **iPad Submissions Daily**: Uses yesterday's date (aligned with transaction report)
- **Date Format**: Consistent MM/DD/YYYY throughout

### Email Integration
- Uses `mailto:` protocol for email client integration
- Tab-separated values (TSV) format for table data
- Clipboard API for copying table data
- Fallback to `document.execCommand('copy')` for older browsers

### Print Styles
- Landscape orientation
- Proper page breaks between sections
- Print-friendly colors and borders
- Hidden interactive elements (buttons, filters)

## Usage Notes

### Running the Report
```bash
# Daily report (defaults to yesterday)
python generate_master_transaction_report.py --type daily

# Monthly report (last 30 days)
python generate_master_transaction_report.py --type monthly

# Specific date
python generate_master_transaction_report.py --type daily --date 2025-12-18
```

### Email Functionality
1. Click the ✉️ button in the Under Minimum Stock section
2. Tab-separated table data is copied to clipboard
3. Outlook opens with email pre-filled
4. Paste (Ctrl+V) the table into the email body
5. Table formats automatically (like pasting from Excel)

### CSV Exports
- Each section has its own export button
- Files are named with date and section type
- Includes all visible data and headers
- Respects current filters and report type

## Dependencies

### External Scripts
- `../Ubiquiti_Scripts/query_door_unlocks.py` - Must be accessible for door access data

### Data Files
- `../Crib iPad Scripts/backend/data/submissions.jsonl` - iPad kiosk submissions
- `../Ubiquiti_Scripts/yesterday_crib_door.json` - Daily door access data
- `../Ubiquiti_Scripts/last_30_days_crib_door.json` - Monthly door access data

### Database
- ZOLLERDB3 database
- Requires access to:
  - Transaction tables (checkouts/returns)
  - StorageBooking table (for minimum stock)
  - ValData table (for component pricing)
  - ObjData table (for component information)


