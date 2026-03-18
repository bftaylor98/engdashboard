# C-ID Lookup API Server

FastAPI server for querying ZOLLERDB3 database to retrieve component (C-ID) information, pricing, and stock levels.

## Features

- **C-ID Lookup**: Query component information by C-ID (e.g., "C-1", "C-112")
- **Description Search**: Search components by description (partial match, case-insensitive) - Returns multiple results
- **Stock Information**: Get current stock levels, minimum/maximum stock
- **Component Details**: Description, part number, unit price, storage location
- **Read-Only Access**: Safe database queries with read-only enforcement

## Setup

### Prerequisites

1. **Python 3.8+** installed
2. **ODBC Driver 17 for SQL Server** (or later) installed
3. **Network access** to `ESTSS01\ZOLLERSQLEXPRESS`
4. **SQL Server credentials** (SA/Zollerdb3 or Windows authentication)

### Installation

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Configuration

The server is configured to connect to:
- **Server**: `ESTSS01\ZOLLERSQLEXPRESS`
- **Database**: `ZOLLERDB3`
- **Port**: `5055` (default, can be changed via PORT environment variable)

Credentials are tried in order:
1. SA / Zollerdb3
2. Brad Taylor / Falcon 9

To change credentials, edit `cid_api_server.py` and modify the `CREDENTIALS` list.

## Running the Server

### Development Mode

```bash
python cid_api_server.py
```

The server will start on `http://0.0.0.0:5055`

### Production Mode (with Uvicorn)

```bash
uvicorn cid_api_server:app --host 0.0.0.0 --port 5055
```

### Windows Service (Optional)

For running as a Windows service, you can use tools like:
- NSSM (Non-Sucking Service Manager)
- Windows Task Scheduler
- Or run as a background process

## API Endpoints

### GET `/`

Health check endpoint.

**Response:**
```json
{
  "message": "C-ID Lookup API Server",
  "version": "1.1.0"
}
```

### GET `/health`

Database connection health check.

**Response:**
```json
{
  "status": "healthy",
  "database": "connected"
}
```

### GET `/cid/{cid}`

Lookup component information by C-ID.

**Parameters:**
- `cid` (path): Component ID (e.g., "C-1", "C-112")

**Response:**
```json
{
  "cid": "C-1",
  "objId": 3029,
  "description": "Component Description",
  "partNo": "PART-12345",
  "unitPrice": 125.50,
  "stockQty": 10,
  "minStock": 5,
  "maxStock": 20,
  "storageLocation": "A-1-2"
}
```

**Error Responses:**
- `400`: Invalid C-ID format (must start with "C-")
- `404`: Component not found
- `500`: Internal server error

### GET `/search/description/{description}`

Search components by description (partial match, case-insensitive).

**Parameters:**
- `description` (path): Search term to match against component descriptions (e.g., "end mill", "drill bit")

**Response:**
Array of ComponentInfo objects:
```json
[
  {
    "cid": "C-1",
    "objId": 3029,
    "description": "End Mill 1/4 inch",
    "partNo": "PART-12345",
    "unitPrice": 125.50,
    "stockQty": 10,
    "circulationQty": 2,
    "minStock": 5,
    "maxStock": 20,
    "storageLocation": "A-1-2"
  },
  {
    "cid": "C-2",
    "objId": 3030,
    "description": "End Mill 1/2 inch",
    "partNo": "PART-12346",
    "unitPrice": 150.00,
    "stockQty": 5,
    "circulationQty": 0,
    "minStock": 3,
    "maxStock": 15,
    "storageLocation": "A-1-3"
  }
]
```

**Notes:**
- Returns all matching components (no limit)
- Search is case-insensitive and uses partial matching (LIKE '%term%')
- Results are ordered by description alphabetically
- Each result includes basic information (C-ID, description, part number, stock quantity)
- For full details on a specific component, use the `/cid/{cid}` endpoint

**Error Responses:**
- `400`: Search term is empty
- `500`: Internal server error

## Integration with HTML Form

The HTML form (`index.html`) is configured to use this API at:
```javascript
const CID_API_BASE_URL = 'http://192.168.1.193:5055';
```

**Note:** For local testing, you can use `http://localhost:5055`. For production, use `http://192.168.1.193:5055`.

### Features in HTML Form:

1. **C-ID Lookup Button**: Click the 🔍 button next to any C-ID input field
2. **Auto-lookup on Blur**: Automatically looks up C-ID when you tab out of the field (debounced)
3. **Status Indicators**: Shows "Found", "Not Found", or "Offline" status
4. **Auto-populate**: Fills description field with component information
5. **Stock Check Widget**: Check all C-IDs in the form for stock levels

## Database Schema

The server queries the following tables:
- `ObjData`: Component basic information (ObjType=11 for components)
- `ValData`: Component attributes (EAV pattern)
- `FieldInfo`: Attribute definitions
- `StorageBooking`: Stock levels and min/max quantities

See `BRAIN_FILE_SQL_QUERY_ARCHITECTURE.md` for detailed schema information.

## Troubleshooting

### Connection Issues

1. **"Could not connect to database"**
   - Verify SQL Server is running and accessible on `ESTSS01\ZOLLERSQLEXPRESS`
   - Check network connectivity to `ESTSS01` and the server host at `192.168.1.193`
   - Verify ODBC Driver 17+ is installed
   - Try Windows authentication if SQL auth fails

2. **"Component not found"**
   - Verify C-ID format (must start with "C-")
   - Check that component exists in database with ObjType=11

3. **"Server offline" in HTML form**
   - Verify server is running on `192.168.1.193:5055`
   - Check firewall settings on the server host
   - Verify `CID_API_BASE_URL` in HTML matches server address (`http://192.168.1.193:5055`)
   - Test connectivity: `Invoke-WebRequest -Uri http://192.168.1.193:5055/health`

### Performance

- Queries are optimized with proper indexing
- Stock calculations use Status=0 only (in stock, not in circulation)
- Connection pooling handles multiple concurrent requests

## Security Notes

- Server uses read-only database access
- CORS is enabled for all origins (restrict in production)
- No authentication on API endpoints (add if needed for production)
- Consider using HTTPS in production

## Version History

### Version 1.1.0 (Current)
- **Added**: Description search endpoint (`/search/description/{description}`)
- **Feature**: Search components by description with partial, case-insensitive matching
- **Returns**: Array of matching components for selection
- **Integration**: Dashboard Tools page now supports both C-ID and description search modes

### Version 1.0.0
- Initial release
- C-ID lookup endpoint
- Stock information retrieval
- Component details query

## License

Internal use only.


