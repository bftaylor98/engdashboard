@echo off
title Engineering Schedule Dashboard
cd /d "%~dp0"

echo Freeing port 3001 if in use...
call npx --yes kill-port 3001 2>nul
if errorlevel 1 if not errorlevel 2 rem

if /i "%~1"=="debug" (
  set DEBUG=1
  echo DEBUG=1 - server will log request timing and TV/Proshop step timing.
  echo.
)

echo Starting backend and frontend...
echo Backend:  http://localhost:3001
echo Frontend: http://localhost:5173
echo.
echo Press Ctrl+C to stop all servers.
echo.

npm run dev

pause
