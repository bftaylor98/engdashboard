# SQL Probe - Read-Only Database Explorer

A Python tool for safely exploring the Zoller TMS/Vending SQL Server database using read-only queries.

## Features

- **Read-only mode**: Enforces SELECT-only queries (no INSERT, UPDATE, DELETE, etc.)
- **Windows authentication**: Uses trusted connection (no passwords needed)
- **Modular queries**: SQL queries stored in `queries.sql` for easy management
- **Schema discovery**: Includes queries to safely discover table structures and relationships
- **Safety limits**: Automatic row limits to prevent overwhelming output

## Prerequisites

1. **Python 3.7+**
2. **ODBC Driver 17 for SQL Server** (or later)
   - Download from: https://docs.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server
3. **Network access** to `ESTSS01\ZOLLERSQLEXPRESS`
4. **Windows authentication** permissions to the database

## Installation

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Verify ODBC driver is installed:
   ```bash
   # Check available drivers
   python -c "import pyodbc; print([x for x in pyodbc.drivers()])"
   ```

## Configuration

Edit `sql_probe.py` to adjust connection settings:

```python
SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
DATABASE = "Zoller TMS"  # May need adjustment
```

If the database name is different (e.g., "Vending"), update the `DATABASE` variable.

## Usage

1. **Run the probe**:
   ```bash
   python sql_probe.py
   ```

2. **Add queries to `queries.sql`**:
   - Each query should start with `-- Query: [Name]`
   - Only SELECT statements are allowed
   - Queries are executed in order

3. **Example query format**:
   ```sql
   -- Query: Daily Transaction Summary
   SELECT 
       CAST(TransactionDate AS DATE) AS TransactionDate,
       COUNT(*) AS TransactionCount
   FROM Transactions
   GROUP BY CAST(TransactionDate AS DATE)
   ORDER BY TransactionDate DESC;
   ```

## Query Categories

### Schema Discovery
- List all tables
- Find transaction-related tables
- Find component/article tables
- Discover foreign key relationships
- Identify timestamp and quantity columns

### Transaction Analysis (Templates)
- Daily/weekly summaries
- Most-used EDP numbers
- Quantity anomalies (zero, negative, unusually large)
- After-hours access patterns
- User and machine activity summaries

**Note**: Transaction analysis queries use placeholder table/column names. After running schema discovery queries, update these templates with actual table and column names.

## Safety Features

- **Query validation**: Blocks any non-SELECT queries
- **Row limits**: Default limit of 1000 rows per query
- **Display limits**: Shows first 50 rows in formatted output
- **Error handling**: Graceful error messages without exposing sensitive details

## Troubleshooting

### Connection Issues

1. **"Connection failed"**
   - Verify SQL Server instance name is correct
   - Check if SQL Server is running
   - Ensure Windows authentication is enabled
   - Verify network connectivity

2. **"ODBC Driver not found"**
   - Install ODBC Driver 17 for SQL Server
   - Update connection string in `sql_probe.py` if using different driver version

3. **"Database not found"**
   - Check actual database name (may be "Vending" or different)
   - Update `DATABASE` variable in `sql_probe.py`

### Query Issues

1. **"Table does not exist"**
   - Run schema discovery queries first
   - Update query templates with actual table names

2. **"Column does not exist"**
   - Check column names using schema discovery queries
   - Verify table structure before writing analysis queries

## Best Practices

1. **Start with schema discovery**: Run the INFORMATION_SCHEMA queries first to understand the database structure
2. **Use templates**: Update the template queries with actual table/column names
3. **Test incrementally**: Add one query at a time to `queries.sql`
4. **Review results**: Check output before adding more complex queries
5. **Keep it simple**: Let SQL do the heavy lifting, keep Python logic minimal

## Main Report Scripts

### Crib Report (Master Transaction Report)
**`generate_master_transaction_report.py`** - Primary production report script
- **Unified Report**: Combines multiple data sources into a single comprehensive report
- **Daily and Monthly Views**: Toggle between Daily History (yesterday) and Monthly History (last 30 days)
- **Interactive Features**: Filtering, sorting, dark mode, individual CSV exports per section
- **Print Optimized**: Each section starts on a new page with proper formatting
- **Uses UnitPrice from ValData** for accurate value calculations

#### Report Sections:
1. **Transaction Log**: Checkout/return transactions with filtering by user, action, and work order
2. **Under Minimum Stock** (Daily only): Items below minimum stock requirements with pricing
3. **iPad Kiosk Form Submissions**: Accidental vend and inventory error reports
4. **Door Access Logs**: Tool crib door entry/exit events with pairing logic

#### Key Features:
- **Individual CSV Exports**: Each section has its own export button
- **Email Functionality**: Under minimum stock section includes email button to send RFQ to supplier
- **Work Order Validation**: Highlights invalid work order formats
- **Addressed Status**: Shows which iPad submissions have been addressed
- **Date/Time Formatting**: All dates in MM/DD/YYYY, times in 12-hour AM/PM format

**Usage:**
```bash
python generate_master_transaction_report.py --type daily
python generate_master_transaction_report.py --type monthly
python generate_master_transaction_report.py --type daily --date 2025-12-18
```

**Output Files:**
- `master_transaction_report.html` - Interactive HTML report
- `master_transaction_report.xml` - XML data export

**Note:** This script automatically sends the report to Power Automate after generation.

### Manual Crib Report (No Power Automate)
**`generate_master_transaction_report_manual.py`** - Manual version of the master report
- **Same functionality** as master report (stays in sync)
- **Does NOT send to Power Automate** - for manual desktop use
- **Automatically opens** report in browser when generated
- **Different output filename** (`manual_report.html`) to avoid overwriting master report
- Use this for manual desktop viewing without Power Automate integration

**Usage:**
```bash
python generate_master_transaction_report_manual.py
python generate_master_transaction_report_manual.py --date 2025-12-18
```

**Output Files:**
- `manual_report.html` - Interactive HTML report (opens automatically)
- `manual_report.xml` - XML data export

### Today's Report
**`generate_today_report.py`** - Quick test script for today's transactions
- Generates report for current date only
- Same features as master report (filtering, sorting, export)
- Useful for testing and quick daily checks
- **Usage:**
  ```bash
  python generate_today_report.py
  ```

### Daily Transaction Report
**`daily_trans/generate_yesterday_checkout_report.py`** - Legacy daily report generator
- Generates report for yesterday's transactions
- See `daily_trans/README.md` for details

## Quick Navigation

- **Complete Project Guide:** See `PROJECT_GUIDE.md` for comprehensive directory structure and usage
- **Daily Reports:** See `daily_trans/README.md`
- **Templates:** See `templates/README.md`
- **Documentation:** See `docs/README.md`
- **Utilities:** See `utils/README.md`
- **Tests:** See `tests/README.md`

## File Structure

```
SQL_Probe/
├── sql_probe.py                    # Main database connection utility
├── queries.sql                     # SQL queries (read-only)
├── requirements.txt                # Python dependencies
├── README.md                       # This file
├── PROJECT_GUIDE.md               # Complete project guide
│
├── generate_master_transaction_report.py  # Crib Report - Unified production report
├── generate_today_report.py              # Quick test script for today
│
├── under_minimum_reporting/        # Under Minimum Stock Reporting
│   ├── generate_under_minimum_report.py  # Standalone under minimum report
│   └── README.md                   # Under minimum reporting docs
│
├── daily_trans/                    # Daily Transaction Report Generator
│   ├── generate_yesterday_checkout_report.py    # Legacy daily report generator
│   ├── send_to_powerautomate.py   # Power Automate integration
│   ├── query_*.py                  # Query scripts
│   ├── checkout_report_*.html      # Generated reports
│   ├── logo.png                    # Report logo
│   ├── requirements.txt            # Dependencies
│   └── README.md                   # daily_trans documentation
│
├── templates/                      # Reference Library for Building Reports
│   ├── generate_yesterday_checkout_report_template.py  # Complete template
│   ├── reference_csv_to_html.py   # CSV-based HTML generator (reference)
│   ├── reference_powerautomate_integration.py  # Power Automate example
│   └── README.md                   # Reference library documentation
│
├── tests/                          # Test Scripts
│   ├── test_component_c212.py     # Component testing script
│   └── README.md                   # Test documentation
│
├── docs/                           # All Documentation
│   ├── DATABASE_SCHEMA_DOCUMENTATION.md
│   ├── DATABASE_QUERY_GUIDE.md
│   ├── SQL_PROBE_TOOL_DOCUMENTATION.md
│   ├── PART_NUMBER_HYPERLINK_LIBRARY.md
│   ├── PROJECT_STRUCTURE.md
│   ├── [Other documentation files]
│   └── README.md                   # Documentation index
│
└── utils/                          # Utility Scripts
    ├── discover_and_document.py    # Schema discovery
    ├── export_component_ids.py     # Data export
    ├── get_component_full_info.py  # Component info
    ├── verify_documentation.py     # Documentation verification
    └── README.md                   # Utils documentation
```

## License

Internal tool for database exploration. Use responsibly.

