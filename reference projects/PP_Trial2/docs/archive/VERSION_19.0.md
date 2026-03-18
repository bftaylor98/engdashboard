# Version 19.0 - Server-Based Edit Logging System

**Release Date:** February 10, 2026

## Overview

This version adds a comprehensive server-based edit logging system that captures all form field changes and sends them to a central server for storage and analysis. The system is designed to handle hundreds of form instances across multiple endpoints.

## Major Features

### Server-Based Logging Infrastructure

- **Centralized Logging Server**: Node.js + Express server (`server/server.js`)
  - Receives log entries from all form instances
  - Stores logs in human-readable text and JSON formats
  - Handles concurrent writes safely using queue system
  - CORS-enabled for cross-origin requests

- **Client-Side Logging System**: Integrated into `index.html`
  - Buffers changes and sends to server every 10 seconds
  - Logs text inputs/textarea on blur, selects/checkboxes on change
  - Deduplicates multiple changes to same field (only sends latest)
  - Flushes immediately on Save/Save As, print, and page unload

### Log Format

- **Text Files** (`.txt`): Human-readable format
  - Format: `MM-DD-YY HH:MM:SS AM/PM | Field: fieldName | Value: "value"`
  - Example: `02-10-26 01:30:45 PM | Field: partNumber | Value: "PART-12345"`

- **JSON Files** (`.json`): Pretty-formatted JSON arrays
  - Includes: `dateTime` (formatted), `ts` (ISO timestamp), `field`, `value`
  - Client identifier included only if not 'unknown'

### Configuration

- **LOGGING_ENABLED**: Toggle logging on/off (default: `true`)
- **LOGGING_URL**: Central server endpoint URL (default: `http://localhost:3001/log`)
- **CLIENT_ID**: Auto-detects from hostname or can be set manually
- **FLUSH_INTERVAL**: 10 seconds (configurable)

## Technical Details

### Server Components

- **POST /log endpoint**: Accepts JSON with `wo`, `entries`, and optional `client`
- **Log Storage**: `server/logs/{WorkOrderNumber}.txt` and `.json`
- **Concurrent Write Safety**: Per-file queue system prevents race conditions
- **Date Formatting**: Eastern time, MM-DD-YY, 12-hour format

### Client Components

- Event listeners for form field changes (blur/change events)
- Change buffer with deduplication
- Automatic flushing every 10 seconds
- Immediate flush on critical actions (save, print, unload)
- Uses `sendBeacon` for best-effort delivery on page unload

## Bug Fixes

- Fixed `hookSaveFunctions is not defined` error
- Fixed `syncData` null reference errors for `soNumber` field (handles link conversion)
- Fixed `validateForm` null reference errors
- Fixed CORS header issue (`X-Client-ID` now allowed)

## Documentation

- **server/README.md**: Server setup and API documentation
- **server/SETUP_WINDOWS_SERVER_2022.md**: Windows Server 2022 deployment guide
- **server/DEPLOYMENT_GUIDE.md**: Central server deployment instructions
- **server/QUICK_START.md**: Quick reference guide
- **server/TROUBLESHOOTING.md**: Troubleshooting guide
- **server/CHANGES_SUMMARY.md**: Summary of changes

## Known Issues

⚠️ **Endpoint Testing Issue**: When tested on endpoint (not localhost), data was not received by the server. This is expected to be resolved once the server is hosted on its final workstation. The issue is likely related to:
- Network configuration/firewall rules
- Server URL configuration in deployed instances
- CORS/network routing when server and clients are on different networks

**Resolution**: This will be addressed during final deployment when the server is moved to its production workstation.

## Installation

### Server Setup

1. Navigate to `server/` directory
2. Run `npm install`
3. Start server: `node server.js`
4. Server runs on port 3001 by default

### Client Configuration

1. Update `LOGGING_URL` in `index.html` (line ~8260) to point to central server
2. Optionally set `CLIENT_ID` to identify each endpoint
3. Deploy updated `index.html` to all endpoints

## Files Changed

- `index.html`: Added logging system (lines ~8254-8500)
- `server/server.js`: New file - Express logging server
- `server/package.json`: New file - Node.js dependencies
- `server/.gitignore`: New file - Excludes node_modules and logs

## Migration Notes

- No data migration required
- Existing form functionality unchanged
- Logging is opt-in via `LOGGING_ENABLED` flag
- Logs stored in `server/logs/` directory (auto-created)

## Next Steps

1. Deploy server to final workstation
2. Update `LOGGING_URL` in all client instances
3. Test endpoint connectivity
4. Monitor log files for data collection
5. Address endpoint connectivity issues during final deployment












