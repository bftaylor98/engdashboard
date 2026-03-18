# Quick Start Guide

## First Time Setup

1. **Install Node.js** (if needed)
   - Download from https://nodejs.org/
   - Install and restart PowerShell

2. **Install Dependencies**
   ```powershell
   cd server
   npm install
   ```

3. **Start Server**
   ```powershell
   node server.js
   ```

4. **Open Application**
   - Browser: `http://localhost:3000/index.html`

## Daily Use

Just start the server:
```powershell
cd server
node server.js
```

Or if running as a service, it should start automatically.

## Check Logs

Logs are in: `server/logs/`
- Format: `{WO-Number}.ndjson`
- Each line is a JSON object with `ts`, `field`, `value`

## Troubleshooting

- **Port in use?** Change `PORT` in server.js or use `$env:PORT=8080; node server.js`
- **Can't connect?** Check server is running and firewall isn't blocking
- **No logs?** Check browser console for errors, verify `LOGGING_ENABLED = true` in index.html













