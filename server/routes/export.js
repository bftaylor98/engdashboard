import { Router } from 'express';
import XLSX from 'xlsx';

const router = Router();

// Helper: transform DB row for export
function exportRow(row) {
  return {
    'Priority': row.priority,
    'WO Number': row.wo_number,
    'Due Date': row.due_date,
    'PN': row.part_number,
    'Rev. Alert': row.rev_alert || '',
    'Part Name': row.part_name,
    'Project': row.project || '',
    'QN': row.qn || '',
    'Customer': row.customer,
    'Est. Prog. Time (HRS)': row.est_programming_hours,
    'Est. Eng Time (HRS)': row.est_engineering_hours,
    'Price': row.price,
    'Material Ordered': row.material_status === 'arrived' ? 'Arrived' : row.material_status === 'ordered' ? 'Ordered' : '',
    'Notes': row.notes || '',
    'Current Box': row.current_box || '',
    'Machine Scheduled': row.machine_scheduled || ''
  };
}

// GET /api/export/xlsx
router.get('/xlsx', (req, res) => {
  try {
    const db = req.db;
    const rows = db.prepare('SELECT * FROM engineering_work_orders ORDER BY priority ASC, due_date ASC').all();
    const exportData = rows.map(exportRow);

    const wb = XLSX.utils.book_new();
    
    // Schedule sheet
    const ws = XLSX.utils.json_to_sheet(exportData);
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');

    // Revision Alerts sheet
    const revisions = db.prepare('SELECT * FROM revision_alerts ORDER BY revision_date DESC').all();
    if (revisions.length > 0) {
      const revData = revisions.map(r => ({
        'Part Number': r.part_number,
        'Part Name': r.part_name || '',
        'Date of Revision': r.revision_date || ''
      }));
      const revWs = XLSX.utils.json_to_sheet(revData);
      XLSX.utils.book_append_sheet(wb, revWs, 'Needed Revisions');
    }

    // Construction Metrics sheet
    const metrics = db.prepare('SELECT * FROM construction_metrics ORDER BY id ASC').all();
    if (metrics.length > 0) {
      const metData = metrics.map(m => {
        const counts = JSON.parse(m.assignee_counts || '{}');
        return {
          'Box List': m.box_name,
          'Percentage of Jobs': m.percentage_of_jobs,
          'Jobs to Go': m.jobs_to_go,
          'Jobs Scheduled': m.jobs_scheduled,
          'Total Jobs': m.total_jobs,
          ...counts
        };
      });
      const metWs = XLSX.utils.json_to_sheet(metData);
      XLSX.utils.book_append_sheet(wb, metWs, 'Construction');
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Engineering_Schedule_${timestamp}.xlsx"`);
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('[export] xlsx error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/export/csv
router.get('/csv', (req, res) => {
  try {
    const db = req.db;
    const rows = db.prepare('SELECT * FROM engineering_work_orders ORDER BY priority ASC, due_date ASC').all();
    const exportData = rows.map(exportRow);

    const ws = XLSX.utils.json_to_sheet(exportData);
    const csv = XLSX.utils.sheet_to_csv(ws);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Engineering_Schedule_${timestamp}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('[export] csv error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

