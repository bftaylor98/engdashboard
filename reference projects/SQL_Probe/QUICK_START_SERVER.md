# SQL Probe - Quick Start Server Deployment

## Fast Deployment (5 Steps)

### 1. Copy Files
Copy the entire `SQL_Probe` folder to the server (e.g., `C:\SQL_Probe\`)

### 2. Install Python
- Download from https://www.python.org/downloads/
- ✅ Check "Add Python to PATH" during installation

### 3. Install ODBC Driver
- Download: https://docs.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server
- Install "ODBC Driver 17 for SQL Server"

### 4. Install Dependencies
Open Command Prompt in the SQL_Probe folder and run:
```cmd
install_dependencies.bat
```

### 5. Test
```cmd
python sql_probe.py
python generate_today_report.py
```

## That's It!

For detailed instructions, see `DEPLOYMENT_GUIDE.md`
For a checklist, see `DEPLOYMENT_CHECKLIST.txt`

## Common Issues

**"Python not found"** → Install Python and check "Add to PATH"

**"ODBC Driver not found"** → Install ODBC Driver 17 for SQL Server

**"Connection failed"** → Check `sql_probe.py` connection settings

**"pip install failed"** → May need Visual C++ Build Tools (see DEPLOYMENT_GUIDE.md)

