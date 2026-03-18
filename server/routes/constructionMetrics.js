import { Router } from 'express';

const router = Router();

// GET /api/construction-metrics
router.get('/', (req, res) => {
  try {
    const db = req.db;
    const rows = db.prepare('SELECT * FROM construction_metrics ORDER BY id ASC').all();

    const data = rows.map(r => ({
      id: r.id,
      boxName: r.box_name,
      percentageOfJobs: r.percentage_of_jobs,
      jobsToGo: r.jobs_to_go,
      jobsScheduled: r.jobs_scheduled,
      totalJobs: r.total_jobs,
      assigneeCounts: JSON.parse(r.assignee_counts || '{}'),
      snapshotDate: r.snapshot_date,
      createdAt: r.created_at
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('[construction-metrics] error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

