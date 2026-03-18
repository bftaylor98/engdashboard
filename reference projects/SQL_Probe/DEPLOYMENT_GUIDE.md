# SQL Probe - Server Deployment Guide

This guide will help you deploy the SQL Probe project to a Windows server.

## Pre-Deployment Checklist

### 1. Server Requirements

- **Operating System:** Windows Server 2016+ or Windows 10/11
- **Python:** Version 3.7 or higher
- **ODBC Driver:** ODBC Driver 17 for SQL Server (or later)
- **Network Access:** Connection to SQL Server instance `ESTSS01\ZOLLERSQLEXPRESS`
- **Windows Authentication:** Appropriate database permissions

### 2. Files to Transfer

Copy the entire `SQL_Probe` directory structure to the server. The project includes:

```
SQL_Probe/
├── Core Files
│   ├── sql_probe.py
│   ├── queries.sql
│   ├── requirements.txt
│   ├── generate_master_transaction_report.py
│   ├── generate_today_report.py
│   └── install_dependencies.bat
│
├── daily_trans/
│   ├── generate_yesterday_checkout_report.py
│   ├── send_to_powerautomate.py
│   ├── query_*.py
│   ├── logo.png
│   └── requirements.txt
│
├── templates/
│   └── [template files]
│
├── docs/
│   └── [documentation files]
│
├── utils/
│   └── [utility scripts]
│
└── tests/
    └── [test scripts]
```

**Important:** Preserve the directory structure exactly as it is.

## Deployment Steps

### Step 1: Transfer Files to Server

1. Copy the entire `SQL_Probe` folder to the server
2. Recommended location: `C:\SQL_Probe\` or `D:\Applications\SQL_Probe\`
3. Ensure all subdirectories are included

### Step 2: Install Python (if not already installed)

1. Download Python 3.7+ from https://www.python.org/downloads/
2. During installation:
   - ✅ Check "Add Python to PATH"
   - ✅ Check "Install pip"
3. Verify installation:
   ```cmd
   python --version
   pip --version
   ```

### Step 3: Install ODBC Driver for SQL Server

1. Download ODBC Driver 17 for SQL Server:
   - https://docs.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server
2. Install the driver on the server
3. Verify installation:
   ```cmd
   python -c "import pyodbc; print([x for x in pyodbc.drivers()])"
   ```
   Should show: `['ODBC Driver 17 for SQL Server', ...]`

### Step 4: Install Python Dependencies

**Option A: Using the Batch File (Recommended)**

1. Navigate to the SQL_Probe directory:
   ```cmd
   cd C:\SQL_Probe
   ```
2. Run the installation script:
   ```cmd
   install_dependencies.bat
   ```

**Option B: Manual Installation**

1. Open Command Prompt or PowerShell
2. Navigate to the SQL_Probe directory
3. Install dependencies:
   ```cmd
   pip install -r requirements.txt
   pip install -r daily_trans\requirements.txt
   ```

### Step 5: Configure Database Connection

1. Open `sql_probe.py` in a text editor
2. Verify/update connection settings:
   ```python
   SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
   DATABASE = "ZOLLERDB3"  # Update if different
   ```
3. Save the file

### Step 6: Test the Installation

1. Test database connection:
   ```cmd
   python sql_probe.py
   ```

2. Test report generation:
   ```cmd
   python generate_today_report.py
   ```

3. Test master report:
   ```cmd
   python generate_master_transaction_report.py --type daily
   ```

## Post-Deployment Configuration

### Scheduled Tasks (Optional)

To run reports automatically, create Windows Scheduled Tasks:

**Daily Report Task:**
- **Trigger:** Daily at 6:00 AM
- **Action:** `python C:\SQL_Probe\generate_master_transaction_report.py --type daily`
- **Working Directory:** `C:\SQL_Probe`

**Monthly Report Task:**
- **Trigger:** Monthly on the 1st at 7:00 AM
- **Action:** `python C:\SQL_Probe\generate_master_transaction_report.py --type monthly`
- **Working Directory:** `C:\SQL_Probe`

### Power Automate Integration (if used)

1. Update `daily_trans\send_to_powerautomate.py` with correct Power Automate URL
2. Test the integration:
   ```cmd
   cd daily_trans
   python generate_yesterday_checkout_report.py --date 2025-12-18 --send
   ```

## Troubleshooting

### Connection Issues

**Error: "Connection failed"**
- Verify SQL Server instance name is correct
- Check if SQL Server is running
- Verify network connectivity
- Ensure Windows authentication is enabled
- Check firewall settings

**Error: "ODBC Driver not found"**
- Install ODBC Driver 17 for SQL Server
- Verify driver installation: `python -c "import pyodbc; print(pyodbc.drivers())"`
- Update connection string in `sql_probe.py` if using different driver

**Error: "Database not found"**
- Check actual database name (may be "Vending" or different)
- Update `DATABASE` variable in `sql_probe.py`

### Python/Pip Issues

**Error: "Python is not recognized"**
- Python not in PATH
- Reinstall Python with "Add to PATH" option
- Or add Python manually to system PATH

**Error: "pip is not recognized"**
- pip not installed or not in PATH
- Run: `python -m ensurepip --upgrade`
- Or reinstall Python with pip included

**Error: "Failed to install pyodbc"**
- May need Microsoft Visual C++ Build Tools
- Download from: https://visualstudio.microsoft.com/visual-cpp-build-tools/
- Install "Desktop development with C++" workload

### Permission Issues

**Error: "Access denied"**
- Run Command Prompt as Administrator
- Check file/folder permissions
- Ensure user has write access to SQL_Probe directory

## Verification Checklist

After deployment, verify:

- [ ] Python is installed and accessible
- [ ] pip is working
- [ ] All dependencies installed successfully
- [ ] ODBC Driver 17 for SQL Server is installed
- [ ] Database connection works (`python sql_probe.py`)
- [ ] Report generation works (`python generate_today_report.py`)
- [ ] All directories are present (daily_trans, templates, docs, utils, tests)
- [ ] Logo file exists (`daily_trans\logo.png`)
- [ ] Scheduled tasks configured (if applicable)

## File Permissions

Ensure the following directories are writable (for generated reports):
- Root directory (for `master_transaction_report.html`)
- `daily_trans\` (for `checkout_report_*.html`)

## Network Requirements

- **Outbound:** HTTP/HTTPS (for Power Automate integration, if used)
- **Database:** Connection to `ESTSS01\ZOLLERSQLEXPRESS` on SQL Server port (default: 1433)

## Support

For issues or questions:
1. Check `README.md` for general information
2. Check `PROJECT_GUIDE.md` for project structure
3. Check `docs\` directory for detailed documentation
4. Review error messages and check troubleshooting section above

## Quick Reference Commands

```cmd
REM Navigate to project directory
cd C:\SQL_Probe

REM Install dependencies
install_dependencies.bat

REM Test connection
python sql_probe.py

REM Generate today's report
python generate_today_report.py

REM Generate master report (daily)
python generate_master_transaction_report.py --type daily

REM Generate master report (monthly)
python generate_master_transaction_report.py --type monthly

REM Generate daily transaction report
cd daily_trans
python generate_yesterday_checkout_report.py --date 2025-12-18
```

---

**Deployment Date:** _______________
**Deployed By:** _______________
**Server Location:** _______________
**Notes:** _______________

