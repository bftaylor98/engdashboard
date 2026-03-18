import { Router } from 'express';
import * as versionManager from '../lib/versionManager.js';
import { eventBus } from '../lib/eventBus.js';

const router = Router();

// POST /api/versions - Create a new version
router.post('/', (req, res) => {
  try {
    const db = req.db;
    const { name, description } = req.body;
    const userId = req.user.id;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Version name is required' });
    }
    
    const version = versionManager.createVersion(name.trim(), description?.trim() || null, userId, db);
    
    res.status(201).json({ success: true, data: version });
  } catch (err) {
    console.error('[versions] POST / error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/versions - List all versions
router.get('/', (req, res) => {
  try {
    const db = req.db;
    const versions = versionManager.listVersions(db);
    res.json({ success: true, data: versions });
  } catch (err) {
    console.error('[versions] GET / error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/versions/:versionNumber - Get version details
router.get('/:versionNumber', (req, res) => {
  try {
    const db = req.db;
    const versionNumber = parseInt(req.params.versionNumber, 10);
    
    if (isNaN(versionNumber)) {
      return res.status(400).json({ success: false, error: 'Invalid version number' });
    }
    
    const version = versionManager.getVersion(versionNumber, db);
    
    if (!version) {
      return res.status(404).json({ success: false, error: 'Version not found' });
    }
    
    res.json({ success: true, data: version });
  } catch (err) {
    console.error('[versions] GET /:versionNumber error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/versions/:versionNumber/restore - Restore to a version
router.post('/:versionNumber/restore', (req, res) => {
  try {
    const db = req.db;
    const versionNumber = parseInt(req.params.versionNumber, 10);
    
    if (isNaN(versionNumber)) {
      return res.status(400).json({ success: false, error: 'Invalid version number' });
    }
    
    const result = versionManager.restoreVersion(versionNumber, db);
    
    // Broadcast restore event
    eventBus.emit('version:restored', {
      versionNumber,
      restoredBy: req.user.id,
      restoredAt: new Date().toISOString(),
      safetyBackupPath: result.safetyBackupPath,
      requiresRestart: result.requiresRestart
    });
    
    // Note: The database file has been replaced, but the current connection
    // is still using the old file. Server restart is required to use the restored database.
    res.json({ 
      success: true, 
      message: result.message,
      warning: 'Database file has been restored. Please restart the server to use the restored database.',
      safetyBackupPath: result.safetyBackupPath
    });
  } catch (err) {
    console.error('[versions] POST /:versionNumber/restore error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/versions/:versionNumber - Delete a version
router.delete('/:versionNumber', (req, res) => {
  try {
    const db = req.db;
    const versionNumber = parseInt(req.params.versionNumber, 10);
    
    if (isNaN(versionNumber)) {
      return res.status(400).json({ success: false, error: 'Invalid version number' });
    }
    
    const result = versionManager.deleteVersion(versionNumber, db);
    
    res.json({ success: true, message: result.message });
  } catch (err) {
    console.error('[versions] DELETE /:versionNumber error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

