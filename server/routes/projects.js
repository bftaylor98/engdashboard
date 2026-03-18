import { Router } from 'express';

const router = Router();

function isAdmin(req) {
  const u = req.user;
  return u && (u.username === 'admin' || u.username === 'brad');
}

/**
 * GET /api/projects
 * List all side projects (admin only).
 */
router.get('/', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  const db = req.db;
  try {
    const rows = db.prepare(
      `SELECT id, title, description, assignee, status, created_at, updated_at, assigned_at, due_date
       FROM side_projects
       ORDER BY status ASC, assignee ASC, created_at DESC`
    ).all();
    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? null,
      assignee: r.assignee,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      assignedAt: r.assigned_at ?? r.created_at,
      dueDate: r.due_date ?? null,
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[projects] List error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to list projects' });
  }
});

/**
 * GET /api/projects/mine
 * List side projects assigned to the current user.
 */
router.get('/mine', (req, res) => {
  const db = req.db;
  const displayName = req.user?.displayName;
  if (!displayName) {
    return res.status(401).json({ success: false, error: 'Not authenticated' });
  }
  try {
    const rows = db.prepare(
      `SELECT id, title, description, assignee, status, created_at, updated_at, assigned_at, due_date
       FROM side_projects
       WHERE assignee = ? AND status = 'active'
       ORDER BY due_date IS NULL, due_date ASC, created_at DESC`
    ).all(displayName);
    const data = rows.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description ?? null,
      assignee: r.assignee,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      assignedAt: r.assigned_at ?? r.created_at,
      dueDate: r.due_date ?? null,
    }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('[projects] Mine error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to list my projects' });
  }
});

/**
 * POST /api/projects
 * Create a side project (admin only).
 * Body: { title: string, description?: string, assignee: string, dueDate?: string (YYYY-MM-DD) }
 */
router.post('/', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  const db = req.db;
  const { title, description, assignee, dueDate } = req.body || {};
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ success: false, error: 'Title is required' });
  }
  if (!assignee || typeof assignee !== 'string' || !assignee.trim()) {
    return res.status(400).json({ success: false, error: 'Assignee is required' });
  }
  const now = new Date().toISOString();
  const assignedAt = now;
  const dueDateVal = (dueDate && typeof dueDate === 'string' && dueDate.trim()) ? dueDate.trim() : null;
  try {
    const result = db.prepare(
      `INSERT INTO side_projects (title, description, assignee, status, created_at, updated_at, assigned_at, due_date)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`
    ).run(title.trim(), (description && String(description).trim()) || null, assignee.trim(), now, now, assignedAt, dueDateVal);
    const id = result.lastInsertRowid;
    const row = db.prepare(
      `SELECT id, title, description, assignee, status, created_at, updated_at, assigned_at, due_date FROM side_projects WHERE id = ?`
    ).get(id);
    const data = {
      id: row.id,
      title: row.title,
      description: row.description ?? null,
      assignee: row.assignee,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assignedAt: row.assigned_at ?? row.created_at,
      dueDate: row.due_date ?? null,
    };
    res.status(201).json({ success: true, data });
  } catch (err) {
    console.error('[projects] Create error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to create project' });
  }
});

/**
 * PATCH /api/projects/:id
 * Update a side project (admin only).
 * Body: { title?: string, description?: string, assignee?: string, status?: 'active' | 'done', dueDate?: string | null }
 * When assignee changes, assigned_at is set to now.
 */
router.patch('/:id', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid project id' });
  }
  const existing = db.prepare('SELECT id, assignee FROM side_projects WHERE id = ?').get(id);
  if (!existing) {
    return res.status(404).json({ success: false, error: 'Project not found' });
  }
  const { title, description, assignee, status, dueDate } = req.body || {};
  const updates = [];
  const values = [];
  if (title !== undefined) {
    if (typeof title !== 'string') {
      return res.status(400).json({ success: false, error: 'Title must be a string' });
    }
    updates.push('title = ?');
    values.push(title.trim());
  }
  if (description !== undefined) {
    updates.push('description = ?');
    values.push(description === null || description === '' ? null : String(description).trim());
  }
  if (assignee !== undefined) {
    if (typeof assignee !== 'string' || !assignee.trim()) {
      return res.status(400).json({ success: false, error: 'Assignee must be a non-empty string' });
    }
    updates.push('assignee = ?');
    values.push(assignee.trim());
    updates.push('assigned_at = ?');
    values.push(new Date().toISOString());
  }
  if (status !== undefined) {
    if (status !== 'active' && status !== 'done') {
      return res.status(400).json({ success: false, error: "Status must be 'active' or 'done'" });
    }
    updates.push('status = ?');
    values.push(status);
  }
  if (dueDate !== undefined) {
    updates.push('due_date = ?');
    values.push(dueDate === null || dueDate === '' ? null : String(dueDate).trim());
  }
  if (updates.length === 0) {
    const row = db.prepare(
      `SELECT id, title, description, assignee, status, created_at, updated_at, assigned_at, due_date FROM side_projects WHERE id = ?`
    ).get(id);
    return res.json({
      success: true,
      data: {
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        assignee: row.assignee,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        assignedAt: row.assigned_at ?? row.created_at,
        dueDate: row.due_date ?? null,
      },
    });
  }
  const now = new Date().toISOString();
  updates.push('updated_at = ?');
  values.push(now);
  values.push(id);
  try {
    db.prepare(`UPDATE side_projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    const row = db.prepare(
      `SELECT id, title, description, assignee, status, created_at, updated_at, assigned_at, due_date FROM side_projects WHERE id = ?`
    ).get(id);
    res.json({
      success: true,
      data: {
        id: row.id,
        title: row.title,
        description: row.description ?? null,
        assignee: row.assignee,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        assignedAt: row.assigned_at ?? row.created_at,
        dueDate: row.due_date ?? null,
      },
    });
  } catch (err) {
    console.error('[projects] Update error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to update project' });
  }
});

/**
 * DELETE /api/projects/:id
 * Delete a side project (admin only).
 */
router.delete('/:id', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  const db = req.db;
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ success: false, error: 'Invalid project id' });
  }
  try {
    const result = db.prepare('DELETE FROM side_projects WHERE id = ?').run(id);
    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[projects] Delete error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to delete project' });
  }
});

export default router;
