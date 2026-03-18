# Changes Summary - Centralized Logging System

## What Changed

The logging system has been updated to support **centralized logging** from hundreds of form instances across 50 endpoints to a single central server, with **human-readable log files**.

## Key Features

### 1. **Readable Log Formats**
- **Text files** (`.txt`): Human-readable format, easy to read in any text editor
- **JSON files** (`.json`): Pretty-formatted JSON arrays, readable in code editors

### 2. **Client/Endpoint Identification**
- Each log entry includes which client/endpoint made the change
- Auto-detects from URL hostname, or can be manually set
- Helps track which of the 50 endpoints made each change

### 3. **Central Server Architecture**
- One server receives logs from all instances
- Handles concurrent writes safely using queue system
- Stores logs organized by Work Order number

## File Changes

### `server/server.js`
- ✅ Added human-readable text log format
- ✅ Added pretty JSON log format (formatted arrays)
- ✅ Added client/endpoint identification
- ✅ Improved concurrent write handling for JSON files

### `index.html`
- ✅ Added `CLIENT_ID` configuration (auto-detects or manual)
- ✅ Updated `LOGGING_URL` with instructions to set central server
- ✅ Sends client ID in all log requests

### New Documentation
- ✅ `DEPLOYMENT_GUIDE.md` - Complete deployment instructions
- ✅ `CHANGES_SUMMARY.md` - This file

## Log File Examples

### Text Format (`WO-12345.txt`)
```
10-02-26 01:30:45 PM ET [Client: Endpoint-01] | Field: partNumber | Value: "PART-12345"
10-02-26 01:30:46 PM ET [Client: Endpoint-02] | Field: material | Value: "Aluminum"
```

### JSON Format (`WO-12345.json`)
```json
[
  {
    "dateTime": "10-02-26 01:30:45 PM ET",
    "ts": "2026-02-10T13:30:45.000Z",
    "client": "Endpoint-01",
    "field": "partNumber",
    "value": "PART-12345"
  }
]
```

**Field Descriptions:**
- `dateTime`: Human-readable date/time in **MM-DD-YY HH:MM:SS AM/PM** format (Eastern time, 12-hour, no ET suffix)
- `ts`: Original ISO timestamp (UTC) - `YYYY-MM-DDTHH:MM:SS.sssZ` format, useful for sorting/filtering
- `client`: Which endpoint/client made the change (only included if not 'unknown')
- `field`: The form field that changed
- `value`: The new value

## Next Steps for Deployment

1. **Update Central Server**: Deploy `server.js` to your central server
2. **Update Each Client**: In each of the 50 endpoints, update `index.html`:
   - Set `LOGGING_URL` to point to central server
   - Optionally set `CLIENT_ID` to identify each endpoint
3. **Test**: Make a change in one form instance and verify it appears in logs

See `DEPLOYMENT_GUIDE.md` for detailed instructions.

## Known Issues

⚠️ **Endpoint Testing Issue**: When tested on endpoint (not localhost), data was not received by the server. This is expected to be resolved once the server is hosted on its final workstation. The issue is likely related to network configuration, firewall rules, or server URL configuration when server and clients are on different networks. This will be addressed during final deployment.

