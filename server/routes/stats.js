import { Router } from 'express';

const router = Router();

// GET /api/stats/dashboard - Hero metrics computed from DB
router.get('/dashboard', (req, res) => {
  try {
    const db = req.db;
    const now = new Date().toISOString().split('T')[0];

    // Check if user is admin (admin or brad)
    const isAdmin = req.user.username === 'admin' || req.user.username === 'brad';
    
    // Get assignee filter from query parameter (for non-admins)
    const assignee = req.query.assignee;
    
    // Build WHERE clause for assignee filtering (only if not admin and assignee is provided)
    const assigneeFilter = (!isAdmin && assignee) ? `AND current_box = ?` : '';
    const assigneeParams = (!isAdmin && assignee) ? [assignee] : [];

    const total = db.prepare(`SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status != 'completed' ${assigneeFilter}`).get(...assigneeParams).count;
    const overdue = db.prepare(`SELECT COUNT(*) as count FROM engineering_work_orders WHERE due_date < ? AND current_status NOT IN (?, ?, ?) ${assigneeFilter}`)
      .get(now, 'engineering-completed', 'programming-completed', 'completed', ...assigneeParams).count;
    const dueThisWeek = db.prepare(`
      SELECT COUNT(*) as count FROM engineering_work_orders 
      WHERE due_date >= ? AND due_date <= date(?, '+7 days') 
      AND current_status NOT IN ('engineering-completed', 'programming-completed', 'completed')
      ${assigneeFilter}
    `).get(now, now, ...assigneeParams).count;
    const hotJobs = db.prepare(`SELECT COUNT(*) as count FROM engineering_work_orders WHERE is_hot_job = 1 AND current_status != 'completed' ${assigneeFilter}`).get(...assigneeParams).count;
    const completed = db.prepare(`SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status IN ('engineering-completed', 'programming-completed') AND current_status != 'completed' ${assigneeFilter}`).get(...assigneeParams).count;
    const inProgress = db.prepare(`SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status IN ('engineering', 'programming') AND current_status != 'completed' ${assigneeFilter}`).get(...assigneeParams).count;
    const assigned = db.prepare(`SELECT COUNT(*) as count FROM engineering_work_orders WHERE current_status = 'engineering' AND current_status != 'completed' ${assigneeFilter}`).get(...assigneeParams).count;
    
    const totalProgHours = db.prepare(`SELECT COALESCE(SUM(est_programming_hours), 0) as total FROM engineering_work_orders WHERE current_status NOT IN (?, ?, ?) ${assigneeFilter}`).get('engineering-completed', 'programming-completed', 'completed', ...assigneeParams).total;
    const totalEngHours = db.prepare(`SELECT COALESCE(SUM(est_engineering_hours), 0) as total FROM engineering_work_orders WHERE current_status NOT IN (?, ?, ?) ${assigneeFilter}`).get('engineering-completed', 'programming-completed', 'completed', ...assigneeParams).total;

    const materialNotOrdered = db.prepare(`SELECT COUNT(*) as count FROM engineering_work_orders WHERE material_status = 'not-ordered' AND current_status NOT IN ('engineering-completed', 'programming-completed', 'completed') ${assigneeFilter}`).get(...assigneeParams).count;

    res.json({
      success: true,
      data: {
        total,
        overdue,
        dueThisWeek,
        hotJobs,
        completed,
        inProgress,
        assigned,
        totalProgrammingHours: totalProgHours,
        totalEngineeringHours: totalEngHours,
        materialNotOrdered
      }
    });
  } catch (err) {
    console.error('[stats] dashboard error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stats/workload - Hours by assignee
router.get('/workload', (req, res) => {
  try {
    const db = req.db;

    const rows = db.prepare(`
      SELECT 
        current_box as assignee,
        COUNT(*) as jobCount,
        COALESCE(SUM(est_programming_hours), 0) as programmingHours,
        COALESCE(SUM(est_engineering_hours), 0) as engineeringHours,
        SUM(CASE WHEN due_date < date('now') AND current_status NOT IN ('engineering-completed', 'programming-completed', 'completed') THEN 1 ELSE 0 END) as overdueCount
      FROM engineering_work_orders 
      WHERE current_box IS NOT NULL AND current_box != '' AND current_status != 'completed'
      GROUP BY current_box
      ORDER BY jobCount DESC
    `).all();

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[stats] workload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/stats/assignees - Work orders per assignee
router.get('/assignees', (req, res) => {
  try {
    const db = req.db;

    const rows = db.prepare(`
      SELECT 
        current_box as assignee,
        current_status as status,
        COUNT(*) as count
      FROM engineering_work_orders 
      WHERE current_box IS NOT NULL AND current_box != '' AND current_status != 'completed'
      GROUP BY current_box, current_status
      ORDER BY current_box
    `).all();

    // Pivot into { assignee: { assigned: N, in-progress: N, ... } }
    const result = {};
    for (const row of rows) {
      if (!result[row.assignee]) {
        result[row.assignee] = { assignee: row.assignee, total: 0 };
      }
      result[row.assignee][row.status] = row.count;
      result[row.assignee].total += row.count;
    }

    res.json({ success: true, data: Object.values(result) });
  } catch (err) {
    console.error('[stats] assignees error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

