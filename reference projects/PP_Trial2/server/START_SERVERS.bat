@echo off
REM Start both servers for PP_Trial2
REM Location: \\192.168.1.193\Production Scripts\PPacket_Server

echo ========================================
echo Starting PP_Trial2 Servers
echo ========================================
echo.

REM Get the directory where this script is located
cd /d "%~dp0"

echo Starting Node.js Logging Server (Port 3001)...
start "PP_Trial2 Logging Server" cmd /k "node server.js"

timeout /t 2 /nobreak >nul

echo Starting Python C-ID API Server (Port 5055)...
start "PP_Trial2 C-ID API Server" cmd /k "python cid_api_server.py"

echo.
echo ========================================
echo Both servers are starting...
echo ========================================
echo.
echo Logging Server: http://192.168.1.193:3001
echo C-ID API Server: http://192.168.1.193:5055
echo.
echo Press any key to close this window (servers will continue running)
pause >nul












