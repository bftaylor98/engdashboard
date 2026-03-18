@echo off
REM ================================================
REM SQL Probe - Dependency Installation Script
REM ================================================
REM This script installs all required Python packages
REM for the SQL Probe project.
REM
REM Prerequisites:
REM - Python 3.7+ must be installed
REM - pip must be available
REM ================================================

echo.
echo ================================================
echo SQL Probe - Installing Dependencies
echo ================================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ from https://www.python.org/
    pause
    exit /b 1
)

echo [1/3] Checking Python version...
python --version
echo.

REM Check if pip is available
python -m pip --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: pip is not available
    echo Please install pip or reinstall Python with pip included
    pause
    exit /b 1
)

echo [2/3] Upgrading pip to latest version...
python -m pip install --upgrade pip
if errorlevel 1 (
    echo WARNING: Failed to upgrade pip, continuing anyway...
)
echo.

REM Install root requirements.txt
echo [3/3] Installing root dependencies from requirements.txt...
if exist "requirements.txt" (
    echo Installing: pyodbc, requests
    python -m pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: Failed to install root dependencies
        pause
        exit /b 1
    )
) else (
    echo WARNING: requirements.txt not found in root directory
)

REM Install daily_trans requirements.txt (if different)
echo.
echo Installing daily_trans dependencies...
if exist "daily_trans\requirements.txt" (
    echo Installing dependencies from daily_trans\requirements.txt...
    python -m pip install -r daily_trans\requirements.txt
    if errorlevel 1 (
        echo WARNING: Failed to install daily_trans dependencies
        echo This may be okay if they're the same as root requirements
    )
) else (
    echo INFO: daily_trans\requirements.txt not found, skipping
)

echo.
echo ================================================
echo Installation Complete!
echo ================================================
echo.
echo Installed packages:
python -m pip list | findstr /i "pyodbc requests"
echo.
echo ================================================
echo Next Steps:
echo 1. Verify ODBC Driver 17 for SQL Server is installed
echo 2. Update connection settings in sql_probe.py if needed
echo 3. Test connection: python sql_probe.py
echo ================================================
echo.
pause

