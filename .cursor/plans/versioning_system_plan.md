# Versioning System Implementation Plan

## Overview
Implement a robust versioning system that allows saving snapshots of the current database state and customer abbreviations file, with the ability to roll back to any previous version.

## Database Schema Changes

### New Table: `versions`
**File**: `server/database/init.js`

```sql
CREATE TABLE IF NOT EXISTS versions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  version_number  INTEGER NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  description     TEXT,
  snapshot_path   TEXT NOT NULL,           -- Path to SQLite backup file
  customer_abb_path TEXT,                    -- Path to customer_abb.csv backup
  created_by      TEXT NOT NULL,            -- user_id from users table
  created_at      TEXT NOT NULL,
  record_count    INTEGER,                   -- Total work orders in this version
  file_size       INTEGER                    -- Size of snapshot file in bytes
);

CREATE INDEX IF NOT EXISTS idx_versions_number ON versions(version_number);
CREATE INDEX IF NOT EXISTS idx_versions_created_at ON versions(created_at);
```

## Storage Structure

### Directory Structure
```
database/
  engineering_schedule.db          # Current active database
  versions/                       # Version snapshots directory
    v1/
      snapshot.db                 # SQLite backup
      customer_abb.csv            # Customer abbreviations backup
    v2/
      snapshot.db
      customer_abb.csv
    ...
```

## Implementation Steps

### 1. Database Initialization Updates
**File**: `server/database/init.js`

- Add `versions` table creation to `initDatabase()`
- Create `versions/` directory if it doesn't exist
- Add index creation for versions table

### 2. Version Management Service
**New File**: `server/lib/versionManager.js`

Functions to implement:
- `createVersion(name, description, userId, db)` - Create a new version snapshot
  - Copy current database to `database/versions/v{N}/snapshot.db`
  - Copy `customer_abb.csv` to `database/versions/v{N}/customer_abb.csv`
  - Insert version record into `versions` table
  - Return version info
  
- `listVersions(db)` - Get all versions ordered by version_number DESC
  - Return array of version objects with metadata
  
- `getVersion(versionNumber, db)` - Get specific version details
  
- `restoreVersion(versionNumber, db)` - Restore database to a specific version
  - Backup current database (safety measure)
  - Copy version snapshot to main database location
  - Copy customer_abb.csv from version directory
  - Reload customer abbreviations in import module
  - Return success/error

- `deleteVersion(versionNumber, db)` - Delete a version (optional, for cleanup)
  - Remove version directory and files
  - Delete version record from database

### 3. Version API Routes
**New File**: `server/routes/versions.js`

Endpoints:
- `POST /api/versions` - Create a new version
  - Body: `{ name, description }`
  - Requires auth (uses `req.user.id` for created_by)
  - Returns: `{ success, data: { versionNumber, name, createdAt, ... } }`
  
- `GET /api/versions` - List all versions
  - Returns: `{ success, data: [{ id, versionNumber, name, description, createdAt, createdBy, recordCount, ... }] }`
  - Ordered by version_number DESC (newest first)
  
- `GET /api/versions/:versionNumber` - Get version details
  - Returns: `{ success, data: { ...version details } }`
  
- `POST /api/versions/:versionNumber/restore` - Restore to a version
  - Requires auth
  - Returns: `{ success, message }`
  - Broadcasts SSE event: `version:restored`
  
- `DELETE /api/versions/:versionNumber` - Delete a version (optional)
  - Requires auth
  - Returns: `{ success, message }`

### 4. Server Integration
**File**: `server/index.js`

- Import and mount version routes: `app.use('/api/versions', requireAuth, versionRoutes)`
- Make sure `req.db` is available to version routes

### 5. Frontend API Service
**File**: `src/services/api.ts`

Add functions:
- `createVersion(name: string, description?: string): Promise<ApiResponse<Version>>`
- `getVersions(): Promise<ApiResponse<Version[]>>`
- `getVersion(versionNumber: number): Promise<ApiResponse<Version>>`
- `restoreVersion(versionNumber: number): Promise<ApiResponse<void>>`
- `deleteVersion(versionNumber: number): Promise<ApiResponse<void>>`

Add TypeScript interface:
```typescript
export interface Version {
  id: number;
  versionNumber: number;
  name: string;
  description: string | null;
  createdAt: string;
  createdBy: string;
  recordCount: number | null;
  fileSize: number | null;
}
```

### 6. Versions Management Page
**New File**: `src/pages/Versions.tsx`

Features:
- Table/list of all versions with:
  - Version number
  - Name
  - Description
  - Created date/time
  - Created by (user display name)
  - Record count
  - File size
  - Actions: View Details, Restore, Delete (optional)
  
- "Create Version" button/modal:
  - Name field (required)
  - Description field (optional)
  - Submit creates new version
  
- Restore confirmation dialog:
  - Warns that restore will replace current data
  - Shows version details before confirming
  
- Real-time updates via SSE for version:restored events

### 7. Navigation Integration
**File**: `src/components/Layout.tsx`

- Add "Versions" nav item to sidebar
- Link to `/versions` route

### 8. Routing
**File**: `src/App.tsx`

- Add route: `<Route path="/versions" element={<Versions />} />`

### 9. SSE Integration
**File**: `server/routes/events.js`

- Add `version:restored` to EVENT_NAMES array
- Emit event when version is restored

**File**: `src/pages/Versions.tsx`

- Use `useSSE` hook to listen for `version:restored` events
- Refresh version list on restore

### 10. Initial Version Creation
**File**: `server/routes/versions.js` or separate script

- Create "Version 1" snapshot on first run (if no versions exist)
- Or provide endpoint to create initial version

## Technical Details

### Database Backup Method
- Use SQLite's `.backup()` method (better-sqlite3 supports this)
- Alternative: Copy database file directly (simpler, but requires closing connections)
- For safety, use `.backup()` which works with WAL mode

### Customer Abbreviations Backup
- Copy `customer_abb.csv` to version directory
- On restore, copy back and trigger reload in import module

### Version Numbering
- Auto-increment: Get max version_number + 1
- Start at 1 for first version
- Never reuse version numbers (even if versions are deleted)

### Safety Measures
- Before restore, create a backup of current state (auto-backup)
- Warn user about data loss
- Validate version exists before restore
- Transaction-based restore for atomicity

## Files to Create/Modify

### New Files:
- `server/lib/versionManager.js` - Core versioning logic
- `server/routes/versions.js` - API routes
- `src/pages/Versions.tsx` - UI page

### Modified Files:
- `server/database/init.js` - Add versions table
- `server/index.js` - Mount version routes
- `src/services/api.ts` - Add version API functions
- `src/components/Layout.tsx` - Add Versions nav item
- `src/App.tsx` - Add Versions route
- `src/types/index.ts` - Add Version interface
- `server/routes/events.js` - Add version:restored event
- `server/routes/import.js` - Add function to reload customer abbreviations

## Testing Considerations

- Test version creation with large databases
- Test restore functionality
- Test version listing and details
- Test error handling (missing files, invalid version numbers)
- Test concurrent access (multiple users)
- Test customer abbreviations restore

## Future Enhancements (Optional)

- Version comparison/diff view
- Automatic versioning on imports
- Version tags/labels
- Export version as file
- Version size limits/cleanup policies


