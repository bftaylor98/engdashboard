import { Router } from 'express';

const router = Router();

// GET /api/revision-alerts
router.get('/', (req, res) => {
  try {
    const db = req.db;
    const rows = db.prepare('SELECT * FROM revision_alerts ORDER BY revision_date DESC').all();

    // Try to link each revision to work orders by part number
    const linkStmt = db.prepare('SELECT id, wo_number, part_name FROM engineering_work_orders WHERE part_number = ?');

    const data = rows.map(r => {
      const linkedWOs = linkStmt.all(r.part_number);
      return {
        id: r.id,
        partNumber: r.part_number,
        partName: r.part_name,
        revisionDate: r.revision_date,
        linkedWorkOrders: linkedWOs.map(wo => ({ id: wo.id, woNumber: wo.wo_number, partName: wo.part_name })),
        createdAt: r.created_at,
        updatedAt: r.updated_at
      };
    });

    res.json({ success: true, data });
  } catch (err) {
    console.error('[revision-alerts] error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

