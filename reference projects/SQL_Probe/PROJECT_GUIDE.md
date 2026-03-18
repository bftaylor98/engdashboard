# SQL Probe Project - Complete Directory Guide

**Read this file first to understand the entire project structure and organization.**

## Quick Start

This project provides tools for querying the Zoller TMS/Vending SQL Server database and generating HTML reports. The project is organized into logical directories for easy navigation and maintenance.

## Project Overview

The SQL Probe project consists of:
1. **Core database utilities** - Read-only database connection and query execution
2. **Daily transaction reports** - Automated HTML report generation for checkout transactions
3. **Templates and references** - Reusable code for building new reports
4. **Documentation** - Complete database schemas, guides, and examples
5. **Utility scripts** - Tools for schema discovery and data export

## Directory Structure

```
SQL_Probe/
│
├── Core Files (Root Directory)
│   ├── sql_probe.py              # Main database connection utility (used by all scripts)
│   ├── queries.sql                # SQL query templates and examples
│   ├── requirements.txt           # Python dependencies (pyodbc, requests)
│   ├── README.md                  # Main project documentation
│   ├── PROJECT_GUIDE.md          # This file - complete directory guide
│   │
│   ├── Main Report Scripts
│   │   ├── generate_master_transaction_report.py    # Primary production report (Daily + Monthly)
│   │   └── generate_today_report.py                 # Quick test script for today
│
├── daily_trans/                   # Daily Transaction Report Generator (Legacy)
│   │
│   ├── Main Scripts
│   │   ├── generate_yesterday_checkout_report.py    # Legacy daily report generator
│   │   ├── send_to_powerautomate.py                 # Power Automate integration
│   │
│   ├── Query Examples
│   │   ├── query_yesterday_checkouts.py
│   │   └── query_c212_checkouts.py
│   │
│   ├── Resources
│   │   ├── logo.png                # Report logo (renamed from long filename)
│   │   └── requirements.txt       # Dependencies (same as root)
│   │
│   ├── Generated Reports
│   │   └── checkout_report_*.html # Generated HTML reports
│   │
│   └── README.md                  # Complete usage guide for daily_trans
│
├── templates/                     # Reference Library for Building Reports
│   │
│   ├── Template Scripts
│   │   ├── generate_yesterday_checkout_report_template.py  # Complete working template
│   │   ├── reference_csv_to_html.py                        # CSV-based HTML generator
│   │   └── reference_powerautomate_integration.py          # Power Automate example
│   │
│   └── README.md                  # Guide for building new reports
│
├── docs/                          # All Documentation
│   │
│   ├── Database Documentation
│   │   ├── DATABASE_SCHEMA_DOCUMENTATION.md    # Complete database schema
│   │   ├── DATABASE_SCHEMA.json                # Machine-readable schema
│   │   ├── DATABASE_QUERY_GUIDE.md             # Query writing guide
│   │   └── SQL_PROBE_TOOL_DOCUMENTATION.md     # sql_probe utility docs
│   │
│   ├── Component Documentation
│   │   ├── COMPONENT_C-112_COMPLETE_INFO.md    # Detailed component example
│   │   ├── component_C-112_full_info.json      # JSON export
│   │   ├── COMPONENT_IDS_DOCUMENTATION.md      # Component ID system
│   │   ├── component_ids.csv                    # CSV export
│   │   └── component_ids.json                  # JSON export
│   │
│   ├── Project Documentation
│   │   ├── PROJECT_STRUCTURE.md                 # Detailed structure guide
│   │   ├── ORGANIZATION_SUMMARY.md              # Organization history
│   │   ├── FINAL_ORGANIZATION.md                # Final organization summary
│   │   ├── NAMING_CONVENTIONS.md                # Naming standards
│   │   ├── PART_NUMBER_HYPERLINK_LIBRARY.md    # Hyperlink library docs
│   │   └── MASTER_DOCUMENTATION_INDEX.md       # Documentation index
│   │
│   └── README.md                  # Documentation directory index
│
├── tests/                          # Test Scripts
│   │
│   ├── test_component_c212.py     # Component testing script
│   │
│   └── README.md                  # Test documentation
│
└── utils/                         # Utility Scripts
    │
    ├── discover_and_document.py   # Auto-discover and document database schema
    ├── export_component_ids.py    # Export component IDs to CSV/JSON
    ├── get_component_full_info.py # Get detailed info for specific component
    ├── verify_documentation.py    # Verify documentation accuracy
    │
    └── README.md                  # Utility scripts guide
```

## Key Directories Explained

### Root Directory (`/`)

**Purpose:** Core project files that are used by all other components.

**Key Files:**
- `sql_probe.py` - Database connection utility (imported by all scripts)
- `queries.sql` - SQL query templates
- `requirements.txt` - Python dependencies
- `README.md` - Main project documentation
- `PROJECT_GUIDE.md` - This comprehensive guide
- `generate_master_transaction_report.py` - Primary production report script
- `generate_today_report.py` - Quick test script for today's transactions

**Usage:**
```bash
# Install dependencies
pip install -r requirements.txt

# Run database queries
python sql_probe.py

# Generate master transaction report (Daily + Monthly)
python generate_master_transaction_report.py --type daily
python generate_master_transaction_report.py --type monthly

# Generate today's report (for testing)
python generate_today_report.py
```

### Root Directory - Main Report Scripts

**Purpose:** Primary production report generators.

**Scripts:**
- `generate_master_transaction_report.py` - **Primary production script**
  - Unified report with Daily History (yesterday) and Monthly History (last 30 days)
  - Interactive HTML with filtering, sorting, dark mode, CSV export
  - Uses UnitPrice from ValData for accurate value calculations
  - Report type dropdown to switch between daily and monthly views
- `generate_today_report.py` - Quick test script for today's transactions

**Usage:**
```bash
# Generate master report (defaults to daily view)
python generate_master_transaction_report.py --type daily
python generate_master_transaction_report.py --type monthly
python generate_master_transaction_report.py --type daily --date 2025-12-18

# Generate today's report (for testing)
python generate_today_report.py
```

### `daily_trans/` Directory

**Purpose:** Legacy daily transaction report generator (superseded by master report).

**Note:** This directory contains the original daily report generator. For new reports, use `generate_master_transaction_report.py` in the root directory.

**What it does:**
- Queries database for checkout/taken events
- Generates professional HTML reports
- Supports filtering, sorting, dark mode
- Integrates with Power Automate
- Includes part number hyperlink library

**Usage:**
```bash
cd daily_trans
python generate_yesterday_checkout_report.py --date 2025-12-18
python generate_yesterday_checkout_report.py --date 2025-12-18 --send
```

**See:** `daily_trans/README.md` for complete documentation

### `templates/` Directory

**Purpose:** Reference library for building new HTML report generators.

**Contents:**
- Complete working template (`generate_yesterday_checkout_report_template.py`)
- CSV-based HTML generator example
- Power Automate integration example
- Patterns and best practices

**When to use:**
- Building a new report generator
- Learning how reports are structured
- Copying patterns for new features
- Understanding HTML generation

**Usage:**
```bash
# Copy template to create new report
cp templates/generate_yesterday_checkout_report_template.py new_report/new_report.py
```

**See:** `templates/README.md` for building guide

### `docs/` Directory

**Purpose:** Centralized location for all project documentation.

**Categories:**
1. **Database Documentation** - Schemas, query guides, tool docs
2. **Component Documentation** - Component examples and exports
3. **Project Documentation** - Structure, organization, naming conventions

**Key Files:**
- `DATABASE_SCHEMA_DOCUMENTATION.md` - Start here for database structure
- `DATABASE_QUERY_GUIDE.md` - How to write queries
- `PART_NUMBER_HYPERLINK_LIBRARY.md` - Hyperlink functionality
- `PROJECT_STRUCTURE.md` - Detailed structure explanation

**See:** `docs/README.md` for complete documentation index

### `utils/` Directory

**Purpose:** Utility scripts for database exploration and documentation generation.

**Scripts:**
- `discover_and_document.py` - Auto-generate schema documentation
- `export_component_ids.py` - Export component data
- `get_component_full_info.py` - Get component details
- `verify_documentation.py` - Verify doc accuracy

**Usage:**
```bash
cd utils
python discover_and_document.py
python export_component_ids.py
```

**See:** `utils/README.md` for utility guide

### `tests/` Directory

**Purpose:** Test scripts for database queries and component testing.

**Scripts:**
- `test_component_c212.py` - Test script to query ComponentID C-212
  - Displays component information, part number, UnitPrice, and transaction history
  - Can be modified to test other component IDs

**Usage:**
```bash
python tests/test_component_c212.py
```

**See:** `tests/README.md` for test documentation

## File Naming Conventions

### Directories
- **Lowercase with underscores** (snake_case): `daily_trans/`, `templates/`
- Descriptive names: `docs/`, `utils/`

### Python Scripts
- Lowercase with underscores: `generate_yesterday_checkout_report.py`
- Versioned: `script_v1.py`, `script_v2.py`
- References: `reference_*.py`
- Templates: `*_template.py`

### Documentation
- UPPERCASE for main docs: `DATABASE_SCHEMA_DOCUMENTATION.md`
- Mixed case for topics: `PART_NUMBER_HYPERLINK_LIBRARY.md`
- README files: `README.md` (always uppercase)

**See:** `docs/NAMING_CONVENTIONS.md` for complete standards

## Common Tasks

### Generate a Transaction Report

**Master Report (Recommended):**
```bash
# Generate master report with daily and monthly data
python generate_master_transaction_report.py --type daily
python generate_master_transaction_report.py --type monthly

# Generate for specific date
python generate_master_transaction_report.py --type daily --date 2025-12-18
```

**Today's Report (Testing):**
```bash
python generate_today_report.py
```

**Legacy Daily Report:**
```bash
cd daily_trans
python generate_yesterday_checkout_report.py --date 2025-12-18
```

### Build a New Report Generator

1. Copy template:
   ```bash
   cp templates/generate_yesterday_checkout_report_template.py new_report/new_report.py
   ```

2. Modify query function
3. Update headers
4. Customize HTML generation
5. Test and iterate

**See:** `templates/README.md` for detailed guide

### Explore Database Schema

1. Read `docs/DATABASE_SCHEMA_DOCUMENTATION.md`
2. Run `utils/discover_and_document.py`
3. Check `docs/DATABASE_QUERY_GUIDE.md` for query patterns

### Add Part Number Hyperlink

Edit `daily_trans/generate_yesterday_checkout_report.py`:

```python
PART_NUMBER_LINKS = {
    'OSG': lambda suffix: f"https://osgtool.com/{suffix}",
    'NEWCOMPANY': lambda suffix: f"https://newcompany.com/{suffix}",
}
```

**See:** `docs/PART_NUMBER_HYPERLINK_LIBRARY.md` for complete guide

## Dependencies

### Core Dependencies
- `pyodbc` - SQL Server database connection
- `requests` - HTTP requests (for Power Automate)

### Installation
```bash
pip install -r requirements.txt
```

## Database Connection

All scripts use `sql_probe.py` for database connections:

```python
from sql_probe import SQLProbe

probe = SQLProbe()
# Connection automatically established
```

**Connection Details:**
- Server: `ESTSS01\ZOLLERSQLEXPRESS`
- Database: `ZOLLERDB3`
- Authentication: Windows (trusted connection)
- Mode: Read-only (SELECT queries only)

## Key Features

### Part Number Hyperlink Library

Automatically converts part numbers to clickable links:
- OSG- → osgtool.com
- ALLI- → alliedmachine.com
- GARR- → garrtool.com
- GUHR- → guhring.com
- HARV- → harveytool.com
- INGE- → ingersoll-imc.com

**See:** `docs/PART_NUMBER_HYPERLINK_LIBRARY.md`

### HTML Report Features

- Interactive filtering (User, Action, Work Order)
- Sortable columns (C-ID, Action, User, Time)
- Dark/light mode toggle
- Mobile responsive design
- Print functionality
- Power Automate integration

## Documentation Quick Reference

| Need to... | Read this file |
|------------|----------------|
| Understand project structure | `PROJECT_GUIDE.md` (this file) |
| Use daily reports | `daily_trans/README.md` |
| Build new reports | `templates/README.md` |
| Understand database | `docs/DATABASE_SCHEMA_DOCUMENTATION.md` |
| Write queries | `docs/DATABASE_QUERY_GUIDE.md` |
| Add hyperlinks | `docs/PART_NUMBER_HYPERLINK_LIBRARY.md` |
| Use utilities | `utils/README.md` |
| Find all docs | `docs/README.md` |

## Project History

### Version Evolution

**Daily Transaction Reports:**
- v1: Initial version
- v2: Mobile responsive design
- v4: Dark/light mode toggle, print button
- v5: Part number hyperlink library (6 companies)

### Organization

- **Initial:** Files scattered in root directory
- **First Organization:** Created `Daily_Trans/` and `Main_ref/` directories
- **Final Organization:** Renamed to standard conventions (`daily_trans/`, `templates/`), added `docs/` and `utils/`

**See:** `docs/FINAL_ORGANIZATION.md` for complete history

## Getting Help

1. **Project Structure:** Read this file (`PROJECT_GUIDE.md`)
2. **Daily Reports:** See `daily_trans/README.md`
3. **Building Reports:** See `templates/README.md`
4. **Database:** See `docs/DATABASE_SCHEMA_DOCUMENTATION.md`
5. **All Documentation:** See `docs/README.md`

## Important Notes

- All scripts import `sql_probe` from parent directory
- Database connection is read-only (SELECT queries only)
- Logo file renamed to `logo.png` (all references updated)
- All directories use lowercase with underscores
- Documentation centralized in `docs/` directory
- Version history preserved in `daily_trans/`

## Next Steps

1. **New to project?** Start with `README.md` then this file
2. **Want to generate reports?** See `daily_trans/README.md`
3. **Building new features?** See `templates/README.md`
4. **Exploring database?** See `docs/DATABASE_SCHEMA_DOCUMENTATION.md`

---

**This file provides a complete overview of the SQL Probe project structure. For specific details, refer to the README files in each directory or the documentation in `docs/`.**


