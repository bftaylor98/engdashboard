# Edit Logging Server

Node.js + Express server for logging form edits from the Process Packet setup sheet app.

## Installation (Windows Server 2022)

1. **Install Node.js** (if not already installed):
   - Download from https://nodejs.org/ (LTS version recommended)
   - Run the installer and follow the prompts
   - Verify installation: Open PowerShell and run `node --version` and `npm --version`

2. **Install dependencies**:
   ```powershell
   cd server
   npm install
   ```

3. **Start the server**:
   ```powershell
   npm start
   ```
   
   Or run directly:
   ```powershell
   node server.js
   ```

4. **Access the application**:
   - Open browser to: `http://localhost:3000/index.html`
   - The server serves the HTML file from the parent directory

## Configuration

- **Port**: Default is 3000. Set `PORT` environment variable to change:
  ```powershell
   $env:PORT=8080; node server.js
   ```

- **Logs Directory**: Logs are stored in `server/logs/` directory
  - Format: `{sanitized-wo-number}.ndjson`
  - Each line is a JSON object: `{"ts":"...","field":"...","value":"..."}`

## Running as a Service (Optional)

To run the server as a Windows service, you can use tools like:
- **NSSM** (Non-Sucking Service Manager): https://nssm.cc/
- **PM2** (with pm2-windows-service): `npm install -g pm2 pm2-windows-service`

### Using NSSM:
1. Download NSSM from https://nssm.cc/download
2. Extract and run `nssm install PP_Trial2_Logging`
3. Set:
   - Path: `C:\Program Files\nodejs\node.exe` (or your Node.js path)
   - Startup directory: `C:\Users\BTaylor\Documents\PP_Trial2\server`
   - Arguments: `server.js`
4. Start the service from Services (services.msc)

## API Endpoints

### POST /log
Logs form edit changes.

**Request Body:**
```json
{
  "wo": "WO-12345",
  "entries": [
    {
      "ts": "2024-01-15T10:30:00.000Z",
      "field": "partNumber",
      "value": "PART-001"
    }
  ]
}
```

**Response:**
```json
{
  "success": true,
  "logged": 1
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Log File Format

Logs are stored as NDJSON (Newline Delimited JSON):
- One JSON object per line
- Each object contains: `ts`, `field`, `value`
- Example:
  ```
  {"ts":"2024-01-15T10:30:00.000Z","field":"partNumber","value":"PART-001"}
  {"ts":"2024-01-15T10:31:00.000Z","field":"material","value":"Aluminum"}
  ```

## Troubleshooting

- **Port already in use**: Change the PORT environment variable
- **Cannot write logs**: Check that the `logs` directory exists and has write permissions
- **CORS errors**: The server includes CORS headers. If issues persist, check browser console













