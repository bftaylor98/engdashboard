# Server Startup Instructions

## Server Location
`\\192.168.1.193\Production Scripts\PPacket_Server`

## Quick Start

### Option 1: Use the Startup Scripts (Easiest)

**Windows Batch File:**
```powershell
cd "\\192.168.1.193\Production Scripts\PPacket_Server"
.\START_SERVERS.bat
```

**PowerShell Script:**
```powershell
cd "\\192.168.1.193\Production Scripts\PPacket_Server"
.\START_SERVERS.ps1
```

This will start both servers in separate windows.

### Option 2: Manual Start

#### Start Node.js Logging Server (Port 3001)

Open PowerShell or Command Prompt:
```powershell
cd "\\192.168.1.193\Production Scripts\PPacket_Server"
node server.js
```

You should see:
```
Edit logging server running on http://localhost:3001
Logs directory: [path]\logs
Serving HTML from: [parent directory]
```

#### Start Python C-ID API Server (Port 5055)

Open a **second** PowerShell or Command Prompt window:
```powershell
cd "\\192.168.1.193\Production Scripts\PPacket_Server"
python cid_api_server.py
```

You should see:
```
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:5055
```

## Verify Servers Are Running

### Test Logging Server (Port 3001)
```powershell
Invoke-WebRequest -Uri http://192.168.1.193:3001/health
```

Expected response:
```json
{"status":"ok","timestamp":"2024-..."}
```

### Test C-ID API Server (Port 5055)
```powershell
Invoke-WebRequest -Uri http://192.168.1.193:5055/health
```

Expected response:
```json
{"status":"healthy","database":"connected"}
```

## Server URLs

- **Logging Server**: `http://192.168.1.193:3001`
- **C-ID API Server**: `http://192.168.1.193:5055`

## Firewall Configuration

Make sure Windows Firewall allows incoming connections on ports 3001 and 5055:

```powershell
# Run as Administrator
New-NetFirewallRule -DisplayName "PP_Trial2 Logging Server" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "PP_Trial2 C-ID API Server" -Direction Inbound -LocalPort 5055 -Protocol TCP -Action Allow
```

## Running as Windows Services (Optional)

For production, you may want to run these as Windows services so they start automatically. See `SETUP_WINDOWS_SERVER_2022.md` for instructions using NSSM or PM2.

## Troubleshooting

### Port Already in Use
```powershell
# Find what's using the port
netstat -ano | findstr :3001
netstat -ano | findstr :5055

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Cannot Connect to Database (C-ID API)
- Verify SQL Server is accessible: `ESTSS01\ZOLLERSQLEXPRESS`
- Check ODBC Driver 17+ is installed
- Verify network connectivity to ESTSS01

### Servers Not Accessible from Other Machines
- Check Windows Firewall rules
- Verify the server IP is correct (192.168.1.193)
- Ensure both servers are bound to `0.0.0.0` (they are by default)

## Stopping the Servers

- If running in terminal windows: Press `Ctrl+C` in each window
- If running as services: Stop via Services Manager (`services.msc`)












