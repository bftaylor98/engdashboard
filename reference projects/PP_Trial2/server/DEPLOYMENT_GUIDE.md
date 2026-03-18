# Central Server Deployment Guide

## Overview

This system is designed to collect edit logs from **hundreds of form instances** deployed across **50 endpoints** to a **single central server**. All changes are stored in **readable text and JSON formats**.

## Architecture

- **Central Server**: One Node.js server that receives all log entries
- **Client Instances**: Hundreds of `index.html` files deployed across 50 endpoints
- **Log Storage**: Human-readable `.txt` files and formatted `.json` files in `logs/` directory

## Server Setup

### 1. Install on Central Server

```powershell
# On your central server
cd C:\Path\To\Server\Directory
npm install
```

### 2. Configure Server

Edit `server.js` if needed:
- Default port: 3001 (change if needed)
- Logs directory: `server/logs/` (auto-created)

### 3. Start Server

```powershell
node server.js
```

Or run as Windows Service (see `SETUP_WINDOWS_SERVER_2022.md`)

### 4. Configure Firewall

Allow incoming connections on your server port (default 3001):
```powershell
New-NetFirewallRule -DisplayName "PP Trial2 Logging" -Direction Inbound -LocalPort 3001 -Protocol TCP -Action Allow
```

## Client Deployment (50 Endpoints)

### 1. Update Each `index.html` File

In each deployed `index.html`, update the logging configuration:

```javascript
// Find this section (around line 8260)
const LOGGING_URL = 'http://your-central-server-ip:3001/log';
// Example: 'http://192.168.1.193:3001/log' (production server)
// Or: 'http://logging-server.company.com:3001/log'

// Optional: Set client identifier for each endpoint
const CLIENT_ID = 'Endpoint-01'; // Change for each endpoint
// Examples: 'Endpoint-01', 'Endpoint-02', 'Machine-A', 'Location-Building-2'
```

### 2. Client ID Options

**Option A: Manual Assignment**
```javascript
const CLIENT_ID = 'Endpoint-01'; // Set unique ID for each endpoint
```

**Option B: Auto-detect from URL**
```javascript
const CLIENT_ID = window.location.hostname || 'unknown';
// Uses the hostname from the URL (e.g., 'machine-01.company.com')
```

**Option C: Use Workstation Name**
```javascript
// You could set this via a config file or server-side injection
const CLIENT_ID = 'WORKSTATION-NAME'; // Replace with actual workstation
```

### 3. Deploy Updated Files

Copy the updated `index.html` to all 50 endpoints.

## Log File Format

### Text Files (`{WO-Number}.txt`)

Human-readable format, easy to read in any text editor (Eastern time, DD-MM-YY, 12-hour format):

```
10-02-26 01:30:45 PM ET [Client: Endpoint-01] | Field: partNumber | Value: "PART-12345"
10-02-26 01:30:46 PM ET [Client: Endpoint-02] | Field: material | Value: "Aluminum"
10-02-26 01:31:15 PM ET [Client: Endpoint-01] | Field: operations[0].programInfo.programName | Value: "PROG-001"
```

### JSON Files (`{WO-Number}.json`)

Pretty-formatted JSON array, readable in any code editor:

```json
[
  {
    "dateTime": "10-02-26 01:30:45 PM ET",
    "ts": "2026-02-10T13:30:45.000Z",
    "client": "Endpoint-01",
    "field": "partNumber",
    "value": "PART-12345"
  },
  {
    "dateTime": "10-02-26 01:30:46 PM ET",
    "ts": "2026-02-10T13:30:46.000Z",
    "client": "Endpoint-02",
    "field": "material",
    "value": "Aluminum"
  }
]
```

**Field Descriptions:**
- `dateTime`: Human-readable date/time in **DD-MM-YY HH:MM:SS AM/PM ET** format (Eastern time, 12-hour)
- `ts`: Original ISO timestamp (UTC) - useful for sorting/filtering, format: `YYYY-MM-DDTHH:MM:SS.sssZ`
- `client`: Which endpoint/client made the change
- `field`: The form field that changed
- `value`: The new value

## Log File Organization

- **Location**: `server/logs/`
- **Naming**: `{WorkOrderNumber}.txt` and `{WorkOrderNumber}.json`
- **Example**: `WO-12345.txt` and `WO-12345.json`
- **Unknown WO**: `UNKNOWN.txt` and `UNKNOWN.json` (when WO field is blank)

## Reading Logs

### Option 1: Text Editor
Open any `.txt` file in Notepad, VS Code, or any text editor.

### Option 2: JSON Viewer
Open `.json` files in VS Code, or use online JSON viewers.

### Option 3: Command Line (PowerShell)

```powershell
# View text log
Get-Content logs\WO-12345.txt

# View JSON log (formatted)
Get-Content logs\WO-12345.json | ConvertFrom-Json | Format-Table

# Search for specific client
Select-String -Path logs\*.txt -Pattern "Endpoint-01"

# Count changes per client
Select-String -Path logs\*.txt -Pattern "Client:" | Group-Object | Select-Object Name, Count
```

## Monitoring

### Check Server Status

```powershell
# Health check
Invoke-WebRequest -Uri http://localhost:3001/health

# Check if server is running
netstat -ano | findstr :3001
```

### View Recent Logs

```powershell
# List all log files
Get-ChildItem logs\*.txt | Sort-Object LastWriteTime -Descending

# View most recent log
Get-ChildItem logs\*.txt | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content
```

## Known Issues

⚠️ **Endpoint Testing Issue**: When tested on endpoint (not localhost), data was not received by the server. This is expected to be resolved once the server is hosted on its final workstation. The issue is likely related to:
- Network configuration/firewall rules
- Server URL configuration in deployed instances
- CORS/network routing when server and clients are on different networks

**Resolution**: This will be addressed during final deployment when the server is moved to its production workstation.

## Troubleshooting

### Clients Can't Connect

1. **Check server is running**: `netstat -ano | findstr :3001`
2. **Check firewall**: Ensure port 3001 is open
3. **Check URL**: Verify `LOGGING_URL` in `index.html` points to correct server
4. **Check browser console**: Look for CORS or network errors

### No Logs Appearing

1. **Check `LOGGING_ENABLED`**: Should be `true` in `index.html`
2. **Check browser console**: Look for logging errors
3. **Test manually**: Open browser console and run `window.flushChanges('test')`
4. **Check server logs**: Look for errors in server console

### Concurrent Write Issues

The server uses a queue system to handle concurrent writes safely. If you see file corruption:
- Check server has write permissions to `logs/` directory
- Ensure only one server instance is running
- Check disk space

## Security Considerations

- **CORS**: Currently allows all origins (`*`). For production, restrict to known endpoints
- **Authentication**: Consider adding API key authentication for production
- **HTTPS**: Use HTTPS in production to encrypt log data in transit
- **Access Control**: Restrict file system access to `logs/` directory

## Performance

- **Buffering**: Changes are buffered for 30 seconds to reduce server load
- **Deduplication**: Multiple changes to same field within 30s only send latest value
- **Concurrent Writes**: Queue system handles hundreds of concurrent requests safely
- **File Size**: Logs grow over time. Consider log rotation for very active systems

## Scaling

For very high volume (thousands of requests per second):
- Consider using a database instead of files
- Add request rate limiting
- Use a load balancer with multiple server instances
- Implement log rotation/archival

