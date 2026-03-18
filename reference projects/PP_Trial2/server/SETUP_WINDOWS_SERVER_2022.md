# Setup Instructions for Windows Server 2022

## Prerequisites

1. **Node.js Installation**
   - Download Node.js LTS version from https://nodejs.org/
   - Run the installer (e.g., `node-v20.x.x-x64.msi`)
   - Choose "Add to PATH" during installation
   - Verify installation:
     ```powershell
     node --version
     npm --version
     ```

## Server Setup

### Step 1: Navigate to Server Directory

```powershell
cd C:\Users\BTaylor\Documents\PP_Trial2\server
```

(Or the path where you've moved the server directory)

### Step 2: Install Dependencies

```powershell
npm install
```

This will create a `node_modules` folder and install Express.

### Step 3: Test the Server

```powershell
node server.js
```

You should see:
```
Edit logging server running on http://localhost:3000
Logs directory: C:\Users\BTaylor\Documents\PP_Trial2\server\logs
Serving HTML from: C:\Users\BTaylor\Documents\PP_Trial2
```

### Step 4: Access the Application

1. Open a web browser
2. Navigate to: `http://localhost:3000/index.html`
3. The form should load and logging will be active

## Running as a Windows Service (Recommended for Production)

### Option A: Using NSSM (Non-Sucking Service Manager)

1. **Download NSSM**
   - Go to https://nssm.cc/download
   - Download the latest release (e.g., `nssm-2.24.zip`)
   - Extract to a folder (e.g., `C:\Tools\nssm`)

2. **Install the Service**
   ```powershell
   # Run PowerShell as Administrator
   cd C:\Tools\nssm\win64
   .\nssm.exe install PP_Trial2_Logging
   ```

3. **Configure the Service**
   - **Path**: `C:\Program Files\nodejs\node.exe` (or your Node.js installation path)
   - **Startup directory**: `C:\Users\BTaylor\Documents\PP_Trial2\server` (or your server path)
   - **Arguments**: `server.js`
   - **Service name**: `PP_Trial2_Logging`
   - **Display name**: `PP Trial 2 Edit Logging Server`
   - **Description**: `Logs form edits from Process Packet setup sheet application`

4. **Start the Service**
   ```powershell
   .\nssm.exe start PP_Trial2_Logging
   ```
   
   Or use Services Manager:
   - Press `Win + R`, type `services.msc`
   - Find "PP Trial 2 Edit Logging Server"
   - Right-click → Start

5. **Set Service to Auto-Start**
   ```powershell
   .\nssm.exe set PP_Trial2_Logging Start SERVICE_AUTO_START
   ```

### Option B: Using PM2 (Process Manager)

1. **Install PM2 and Windows Service Wrapper**
   ```powershell
   npm install -g pm2 pm2-windows-service
   ```

2. **Install PM2 as Windows Service**
   ```powershell
   pm2-service-install -n PP_Trial2_Logging
   ```

3. **Start the Application with PM2**
   ```powershell
   cd C:\Users\BTaylor\Documents\PP_Trial2\server
   pm2 start server.js --name "pp-trial2-logging"
   ```

4. **Save PM2 Configuration**
   ```powershell
   pm2 save
   ```

5. **Start the Service**
   - Open Services (`services.msc`)
   - Find "PM2" service
   - Start it and set to Automatic

## Configuration

### Change Port

Edit `server.js` or set environment variable:

```powershell
$env:PORT=8080
node server.js
```

Or in a service, add to NSSM "Arguments" field:
```
server.js
```

And set environment variable in NSSM:
- **Environment**: `PORT=8080`

### Update Client Configuration

If you change the port, update `index.html`:

```javascript
const LOGGING_URL = 'http://localhost:8080/log'; // Update this
```

If the server is on a different machine:

```javascript
const LOGGING_URL = 'http://server-ip-address:3000/log';
```

## Log Files

- **Location**: `server/logs/`
- **Format**: `{sanitized-wo-number}.ndjson`
- **Example**: `WO-12345.ndjson` or `UNKNOWN.ndjson`

Each line is a JSON object:
```json
{"ts":"2024-01-15T10:30:00.000Z","field":"partNumber","value":"PART-001"}
```

## Troubleshooting

### Port Already in Use

```powershell
# Find process using port 3000
netstat -ano | findstr :3000

# Kill the process (replace PID with actual process ID)
taskkill /PID <PID> /F
```

### Cannot Write Logs

- Check that `server/logs` directory exists
- Verify write permissions on the directory
- Check Windows Firewall isn't blocking Node.js

### CORS Errors

- The server includes CORS headers
- If issues persist, check browser console for specific errors
- Ensure the HTML is being served from the same origin or CORS is properly configured

### Service Won't Start

1. Check Event Viewer (`eventvwr.msc`) → Windows Logs → Application
2. Verify Node.js path is correct in service configuration
3. Check that the startup directory path is correct
4. Try running manually first: `node server.js`

### Testing the Server

```powershell
# Test health endpoint
Invoke-WebRequest -Uri http://localhost:3000/health

# Test log endpoint (PowerShell)
$body = @{
    wo = "WO-12345"
    entries = @(
        @{
            ts = "2024-01-15T10:30:00.000Z"
            field = "partNumber"
            value = "TEST-001"
        }
    )
} | ConvertTo-Json -Depth 10

Invoke-WebRequest -Uri http://localhost:3000/log -Method POST -Body $body -ContentType "application/json"
```

## Moving to a New Server

When moving to a new host server:

1. Copy the entire `server` directory
2. Install Node.js on the new server
3. Run `npm install` in the server directory
4. Update `LOGGING_URL` in `index.html` to point to the new server
5. Update firewall rules to allow traffic on the port
6. Follow service setup instructions above

## Security Considerations

- The server currently accepts requests from any origin (`*`)
- For production, consider restricting CORS to specific origins
- Consider adding authentication if the server will be exposed to the internet
- Log files may contain sensitive data - ensure proper access controls













