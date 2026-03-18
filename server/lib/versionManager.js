import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_DIR = path.join(__dirname, '..', '..', 'database');
const VERSIONS_DIR = path.join(DB_DIR, 'versions');
const CURRENT_DB_PATH = path.join(DB_DIR, 'engineering_schedule.db');
const CUSTOMER_ABB_PATH = path.join(__dirname, '..', '..', 'customer_abb.csv');

// Ensure versions directory exists
if (!fs.existsSync(VERSIONS_DIR)) {
  fs.mkdirSync(VERSIONS_DIR, { recursive: true });
}

/**
 * Get the next version number
 */
export function getNextVersionNumber(db) {
  const result = db.prepare('SELECT MAX(version_number) as max FROM versions').get();
  return (result?.max || 0) + 1;
}

/**
 * Create a new version snapshot
 */
export function createVersion(name, description, userId, db) {
  const versionNumber = getNextVersionNumber(db);
  const versionDir = path.join(VERSIONS_DIR, `v${versionNumber}`);
  
  // Create version directory
  if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(versionDir, { recursive: true });
  }
  
  const snapshotPath = path.join(versionDir, 'snapshot.db');
  const customerAbbPath = path.join(versionDir, 'customer_abb.csv');
  
  // Create database backup using SQLite backup API
  try {
    const backupDb = new Database(snapshotPath);
    db.backup(backupDb);
    backupDb.close();
    console.log(`[version] Database backup created: ${snapshotPath}`);
  } catch (err) {
    throw new Error(`Failed to backup database: ${err.message}`);
  }
  
  // Copy customer abbreviations file if it exists
  let customerAbbPathValue = null;
  if (fs.existsSync(CUSTOMER_ABB_PATH)) {
    fs.copyFileSync(CUSTOMER_ABB_PATH, customerAbbPath);
    customerAbbPathValue = customerAbbPath;
    console.log(`[version] Customer abbreviations copied: ${customerAbbPath}`);
  }
  
  // Get record count
  const recordCount = db.prepare('SELECT COUNT(*) as count FROM engineering_work_orders').get().count;
  
  // Get file size
  const stats = fs.statSync(snapshotPath);
  const fileSize = stats.size;
  
  // Insert version record
  const now = new Date().toISOString();
  const insert = db.prepare(`
    INSERT INTO versions (version_number, name, description, snapshot_path, customer_abb_path, created_by, created_at, record_count, file_size)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  insert.run(
    versionNumber,
    name,
    description || null,
    snapshotPath,
    customerAbbPathValue,
    userId,
    now,
    recordCount,
    fileSize
  );
  
  console.log(`[version] Created version ${versionNumber}: ${name}`);
  
  return {
    id: db.prepare('SELECT last_insert_rowid() as id').get().id,
    versionNumber,
    name,
    description: description || null,
    snapshotPath,
    customerAbbPath: customerAbbPathValue,
    createdBy: userId,
    createdAt: now,
    recordCount,
    fileSize
  };
}

/**
 * List all versions
 */
export function listVersions(db) {
  const versions = db.prepare(`
    SELECT 
      v.id,
      v.version_number,
      v.name,
      v.description,
      v.snapshot_path,
      v.customer_abb_path,
      v.created_by,
      v.created_at,
      v.record_count,
      v.file_size,
      u.display_name as created_by_name
    FROM versions v
    LEFT JOIN users u ON u.id = v.created_by
    ORDER BY v.version_number DESC
  `).all();
  
  return versions.map(v => ({
    id: v.id,
    versionNumber: v.version_number,
    name: v.name,
    description: v.description,
    snapshotPath: v.snapshot_path,
    customerAbbPath: v.customer_abb_path,
    createdBy: v.created_by,
    createdByName: v.created_by_name || v.created_by,
    createdAt: v.created_at,
    recordCount: v.record_count,
    fileSize: v.file_size
  }));
}

/**
 * Get a specific version
 */
export function getVersion(versionNumber, db) {
  const version = db.prepare(`
    SELECT 
      v.id,
      v.version_number,
      v.name,
      v.description,
      v.snapshot_path,
      v.customer_abb_path,
      v.created_by,
      v.created_at,
      v.record_count,
      v.file_size,
      u.display_name as created_by_name
    FROM versions v
    LEFT JOIN users u ON u.id = v.created_by
    WHERE v.version_number = ?
  `).get(versionNumber);
  
  if (!version) {
    return null;
  }
  
  return {
    id: version.id,
    versionNumber: version.version_number,
    name: version.name,
    description: version.description,
    snapshotPath: version.snapshot_path,
    customerAbbPath: version.customer_abb_path,
    createdBy: version.created_by,
    createdByName: version.created_by_name || version.created_by,
    createdAt: version.created_at,
    recordCount: version.record_count,
    fileSize: version.file_size
  };
}

/**
 * Restore database to a specific version
 */
export function restoreVersion(versionNumber, db) {
  const version = getVersion(versionNumber, db);
  if (!version) {
    throw new Error(`Version ${versionNumber} not found`);
  }
  
  // Check if snapshot file exists
  if (!fs.existsSync(version.snapshotPath)) {
    throw new Error(`Snapshot file not found: ${version.snapshotPath}`);
  }
  
  // Create safety backup of current database
  const safetyBackupPath = path.join(DB_DIR, `engineering_schedule.backup.${Date.now()}.db`);
  try {
    const safetyBackupDb = new Database(safetyBackupPath);
    db.backup(safetyBackupDb);
    safetyBackupDb.close();
    console.log(`[version] Safety backup created: ${safetyBackupPath}`);
    
    // Note: We cannot close the database connection here as it's managed by the server
    // The restore will copy the snapshot file, but the server needs to be restarted
    // to use the new database file. The current connection will continue using the old file.
    
    // Copy snapshot to main database location
    // This will be picked up on next server restart
    fs.copyFileSync(version.snapshotPath, CURRENT_DB_PATH);
    console.log(`[version] Database file restored from version ${versionNumber}`);
    
    // Restore customer abbreviations if available
    if (version.customerAbbPath && fs.existsSync(version.customerAbbPath)) {
      fs.copyFileSync(version.customerAbbPath, CUSTOMER_ABB_PATH);
      console.log(`[version] Customer abbreviations restored`);
    }
    
    return {
      success: true,
      message: `Database restored to version ${versionNumber}: ${version.name}`,
      safetyBackupPath,
      requiresRestart: true
    };
  } catch (err) {
    throw new Error(`Failed to create safety backup: ${err.message}`);
  }
}

/**
 * Delete a version
 */
export function deleteVersion(versionNumber, db) {
  const version = getVersion(versionNumber, db);
  if (!version) {
    throw new Error(`Version ${versionNumber} not found`);
  }
  
  // Delete version directory
  const versionDir = path.join(VERSIONS_DIR, `v${versionNumber}`);
  if (fs.existsSync(versionDir)) {
    fs.rmSync(versionDir, { recursive: true, force: true });
    console.log(`[version] Deleted version directory: ${versionDir}`);
  }
  
  // Delete version record
  const deleteStmt = db.prepare('DELETE FROM versions WHERE version_number = ?');
  deleteStmt.run(versionNumber);
  
  console.log(`[version] Deleted version ${versionNumber}`);
  
  return {
    success: true,
    message: `Version ${versionNumber} deleted`
  };
}

