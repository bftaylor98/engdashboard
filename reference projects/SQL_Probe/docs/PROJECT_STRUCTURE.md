# SQL Probe Project Structure

## Overview

This project provides tools for querying the Zoller TMS/Vending database and generating HTML reports. The project is organized into logical directories for easy navigation and maintenance.

## Directory Structure

```
SQL_Probe/
│
├── daily_trans/                    # Daily Transaction Report Generator
│   │
│   ├── Scripts
│   │   ├── generate_yesterday_checkout_report.py    # Current production version
│   │   ├── generate_yesterday_checkout_report_v1.py # Version history
│   │   ├── generate_yesterday_checkout_report_v2.py
│   │   ├── generate_yesterday_checkout_report_v4.py
│   │   ├── generate_yesterday_checkout_report_v5.py
│   │   ├── send_to_powerautomate.py                 # Power Automate integration
│   │   ├── send_to_powerautomate_v1.py
│   │   ├── query_yesterday_checkouts.py              # Query examples
│   │   └── query_c212_checkouts.py
│   │
│   ├── Resources
│   │   ├── Vectorized Logo - Transparent Background (09-25-23).png
│   │   └── requirements.txt
│   │
│   ├── Generated Reports
│   │   └── checkout_report_*.html
│   │
│   └── README.md                   # daily_trans documentation
│
├── templates/                       # Reference Library for Building Reports
│   │
│   ├── Reference Scripts
│   │   ├── generate_report_html_v2.py              # CSV-based HTML generator
│   │   ├── generate_and_send_report.py              # Power Automate example
│   │   └── generate_yesterday_checkout_report_template.py  # Complete template
│   │
│   ├── Documentation
│   │   ├── README.md                                # Reference library guide
│   │   └── PART_NUMBER_HYPERLINK_LIBRARY.md        # Hyperlink library docs
│   │
│   └── [Other reference materials]
│
├── Core Files                       # Main project files
│   ├── sql_probe.py                 # Database connection utility
│   ├── queries.sql                  # SQL query templates
│   ├── requirements.txt             # Python dependencies
│   └── README.md                    # Main project documentation
│
└── Documentation/                   # Database and schema documentation
    ├── DATABASE_SCHEMA_DOCUMENTATION.md
    ├── DATABASE_QUERY_GUIDE.md
    ├── SQL_PROBE_TOOL_DOCUMENTATION.md
    ├── COMPONENT_IDS_DOCUMENTATION.md
    ├── COMPONENT_C-112_COMPLETE_INFO.md
    ├── MASTER_DOCUMENTATION_INDEX.md
    └── PROJECT_STRUCTURE.md          # This file
```

## Directory Purposes

### daily_trans/

Contains all scripts and resources for the Daily Transaction Report Generator.

**Purpose:**
- Generate HTML reports of checkout transactions
- Query database for specific date ranges
- Integrate with Power Automate
- Provide part number hyperlinks

**Key Features:**
- Interactive filtering and sorting
- Dark/light mode toggle
- Mobile responsive design
- Print functionality
- Part number hyperlink library

**Usage:**
```bash
cd daily_trans
python generate_yesterday_checkout_report.py --date 2025-12-18
```

### templates/

Reference library for building new report generators.

**Purpose:**
- Provide templates and examples
- Document patterns and best practices
- Serve as starting point for new reports

**Contents:**
- Complete working templates
- Example implementations
- Documentation and guides
- Reusable code patterns

**Usage:**
```bash
# Copy template to create new report
cp templates/generate_yesterday_checkout_report_template.py NewReport/new_report.py
```

### Root Directory

Core project files and utilities.

**Key Files:**
- `sql_probe.py` - Database connection and query execution
- `queries.sql` - SQL query templates
- `requirements.txt` - Python dependencies
- Documentation files for database schema and usage

## File Naming Conventions

### Scripts
- `generate_*_report.py` - Report generation scripts
- `query_*.py` - Database query scripts
- `send_to_*.py` - Integration scripts
- `*_v*.py` - Versioned scripts (e.g., `script_v1.py`, `script_v2.py`)

### Documentation
- `*_DOCUMENTATION.md` - Detailed documentation
- `*_GUIDE.md` - How-to guides
- `README.md` - Directory overviews
- `*_INDEX.md` - Index/master documentation

### Generated Files
- `*_report_*.html` - Generated HTML reports
- `*.json` - Data exports
- `*.csv` - CSV data files

## Version Control Strategy

### Versioned Scripts
When making significant changes, save previous versions:
- `script_v1.py` - Initial version
- `script_v2.py` - Major feature addition
- `script_v3.py` - Another major change
- `script.py` - Current production version

### Version History
Document version history in:
- Script comments
- README files
- Change logs

## Adding New Reports

### Step 1: Create Directory
```bash
mkdir NewReport
```

### Step 2: Copy Template
```bash
cp templates/generate_yesterday_checkout_report_template.py NewReport/new_report.py
```

### Step 3: Customize
- Modify query functions
- Update headers and columns
- Customize HTML generation
- Add specific features

### Step 4: Document
- Create README.md in new directory
- Document usage and features
- Update this file if needed

## Dependencies

### Core Dependencies
- `pyodbc` - SQL Server database connection
- `requests` - HTTP requests (for Power Automate)

### Optional Dependencies
- `pandas` - Data manipulation (some reference scripts)

## Best Practices

1. **Organize by function**: Keep related files together
2. **Version important changes**: Save versions before major modifications
3. **Document everything**: README files in each directory
4. **Use templates**: Start from templates templates
5. **Test incrementally**: Test changes as you make them
6. **Keep it clean**: Remove old/unused files periodically

## Maintenance

### Regular Tasks
- Update documentation as features change
- Archive old versions periodically
- Clean up generated HTML files
- Update dependencies

### When Adding Features
1. Test in development
2. Save as new version
3. Update documentation
4. Test in production
5. Update version history

## Questions?

- **Daily Transaction Reports**: See `daily_trans/README.md`
- **Building New Reports**: See `templates/README.md`
- **Database Schema**: See `DATABASE_SCHEMA_DOCUMENTATION.md`
- **Query Examples**: See `DATABASE_QUERY_GUIDE.md`

