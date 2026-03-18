import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  try {
    const db = req.db;
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Username and password are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.toLowerCase().trim());
    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    // Create session token (48 bytes = 64 hex chars)
    const token = crypto.randomBytes(48).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7 days

    db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(token, user.id, expiresAt.toISOString(), now.toISOString());

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          displayName: user.display_name,
        },
      },
    });
  } catch (err) {
    console.error('[auth] Login error:', err);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// GET /api/auth/me  – requires valid token
router.get('/me', requireAuth, (req, res) => {
  res.json({ success: true, data: req.user });
});

// POST /api/auth/logout – requires valid token
router.post('/logout', requireAuth, (req, res) => {
  try {
    const token = req.headers.authorization.slice(7);
    req.db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    res.json({ success: true });
  } catch (err) {
    console.error('[auth] Logout error:', err);
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

// GET /api/auth/preferences – requires valid token
router.get('/preferences', requireAuth, (req, res) => {
  try {
    const db = req.db;
    const user = db.prepare('SELECT preferences FROM users WHERE id = ?').get(req.user.id);
    
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    let preferences = {};
    try {
      preferences = user.preferences ? JSON.parse(user.preferences) : {};
    } catch (err) {
      // If preferences is invalid JSON, return empty object
      preferences = {};
    }

    res.json({ success: true, data: preferences });
  } catch (err) {
    console.error('[auth] Get preferences error:', err);
    res.status(500).json({ success: false, error: 'Failed to get preferences' });
  }
});

// PATCH /api/auth/preferences – requires valid token
router.patch('/preferences', requireAuth, (req, res) => {
  try {
    const db = req.db;
    const { preferences: newPreferences } = req.body;

    if (!newPreferences || typeof newPreferences !== 'object') {
      return res.status(400).json({ success: false, error: 'Invalid preferences object' });
    }

    // Get current preferences
    const user = db.prepare('SELECT preferences FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    let currentPreferences = {};
    try {
      currentPreferences = user.preferences ? JSON.parse(user.preferences) : {};
    } catch (err) {
      currentPreferences = {};
    }

    // Merge with new preferences
    const mergedPreferences = { ...currentPreferences, ...newPreferences };

    // Validate theme if present
    if (mergedPreferences.theme && !['light', 'dark'].includes(mergedPreferences.theme)) {
      return res.status(400).json({ success: false, error: 'Invalid theme value. Must be "light" or "dark"' });
    }

    // Update preferences
    db.prepare('UPDATE users SET preferences = ? WHERE id = ?')
      .run(JSON.stringify(mergedPreferences), req.user.id);

    res.json({ success: true, data: mergedPreferences });
  } catch (err) {
    console.error('[auth] Update preferences error:', err);
    res.status(500).json({ success: false, error: 'Failed to update preferences' });
  }
});

export default router;



