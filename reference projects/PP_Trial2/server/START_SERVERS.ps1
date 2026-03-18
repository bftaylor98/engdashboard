# Start both servers for PP_Trial2
# Location: \\192.168.1.193\Production Scripts\PPacket_Server

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting PP_Trial2 Servers" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the directory where this script is located
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

Write-Host "Starting Node.js Logging Server (Port 3001)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$scriptPath'; node server.js" -WindowStyle Normal

Start-Sleep -Seconds 2

Write-Host "Starting Python C-ID API Server (Port 5055)..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$scriptPath'; python cid_api_server.py" -WindowStyle Normal

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "Both servers are starting..." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Logging Server: http://192.168.1.193:3001" -ForegroundColor Cyan
Write-Host "C-ID API Server: http://192.168.1.193:5055" -ForegroundColor Cyan
Write-Host ""
Write-Host "Servers are running in separate windows." -ForegroundColor Yellow
Write-Host "Close those windows to stop the servers." -ForegroundColor Yellow












