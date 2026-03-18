import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../lib/eventBus.js';

const router = Router();

// Helper: snake_case DB row -> camelCase API response
function transformRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    woNumber: row.wo_number,
    priority: row.priority,
    isHotJob: Boolean(row.is_hot_job),
    dueDate: row.due_date,
    partNumber: row.part_number,
    revAlert: row.rev_alert,
    partName: row.part_name,
    project: row.project,
    qn: row.qn,
    customer: row.customer,
    estProgrammingHours: row.est_programming_hours,
    estEngineeringHours: row.est_engineering_hours,
    price: row.price,
    materialStatus: row.material_status,
    notes: row.notes,
    workOrderNotes: row.work_order_notes ?? null,
    comments: safeParseJSON(row.comments, []),
    currentBox: row.current_box,
    machineScheduled: row.machine_scheduled,
    currentStatus: row.current_status,
    metadata: safeParseJSON(row.metadata, {}),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function safeParseJSON(str, fallback) {
  try {
    return str ? JSON.parse(str) : fallback;
  } catch {
    return fallback;
  }
}

function stripHtml(html) {
  if (html == null || typeof html !== 'string') return html;
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

// GET /api/work-orders - List with filters, pagination, sort
router.get('/', (req, res) => {
  try {
    const db = req.db;
    const {
      search, priority, customer, currentBox, currentStatus, materialStatus,
      isHotJob, sortBy = 'due_date', sortOrder = 'asc',
      page = '1', limit = '50'
    } = req.query;

    let where = [];
    let params = {};

    if (search) {
      where.push(`(wo_number LIKE @search OR part_number LIKE @search OR part_name LIKE @search OR project LIKE @search OR customer LIKE @search OR current_box LIKE @search OR notes LIKE @search)`);
      params.search = `%${search}%`;
    }
    if (priority !== undefined && priority !== '') {
      where.push('priority = @priority');
      params.priority = Number(priority);
    }
    if (customer) {
      where.push('customer = @customer');
      params.customer = customer;
    }
    if (currentBox) {
      if (currentBox === '__unassigned__') {
        // Filter for unassigned work orders (null or empty)
        where.push("(current_box IS NULL OR current_box = '')");
      } else {
        where.push('current_box = @currentBox');
        params.currentBox = currentBox;
      }
    }
    if (currentStatus) {
      if (currentStatus.startsWith('!')) {
        // Exclude status (e.g., "!completed")
        where.push('current_status != @currentStatus');
        params.currentStatus = currentStatus.slice(1);
      } else {
        where.push('current_status = @currentStatus');
        params.currentStatus = currentStatus;
      }
    }
    if (materialStatus) {
      where.push('material_status = @materialStatus');
      params.materialStatus = materialStatus;
    }
    if (isHotJob !== undefined && isHotJob !== '') {
      where.push('is_hot_job = @isHotJob');
      params.isHotJob = isHotJob === 'true' ? 1 : 0;
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    // Validate sort column
    const validSortColumns = {
      dueDate: 'due_date', priority: 'priority', woNumber: 'wo_number',
      customer: 'customer', currentBox: 'current_box', currentStatus: 'current_status',
      createdAt: 'created_at', partNumber: 'part_number', partName: 'part_name', project: 'project',
      due_date: 'due_date', wo_number: 'wo_number', current_box: 'current_box',
      current_status: 'current_status', created_at: 'created_at', part_number: 'part_number'
    };
    const sortCol = validSortColumns[sortBy] || 'due_date';
    const order = sortOrder === 'desc' ? 'DESC' : 'ASC';

    // Special sorting logic
    let orderClause;
    if (sortCol === 'priority') {
      // Priority sort: 0 always at bottom
      orderClause = `ORDER BY CASE WHEN priority = 0 THEN 1 ELSE 0 END, priority ${order}`;
    } else if (sortCol === 'wo_number') {
      // Natural sort for work order numbers (e.g., "26-0222" before "26-1222")
      // Extract prefix (before dash) and number (after dash), sort by prefix then numeric value
      // This ensures "26-0222" (prefix=26, num=222) comes before "26-1222" (prefix=26, num=1222)
      // Using a more explicit approach with proper handling of the dash position
      orderClause = `ORDER BY 
        CAST(
          CASE 
            WHEN INSTR(wo_number, '-') > 0 THEN
              SUBSTR(wo_number, 1, INSTR(wo_number, '-') - 1)
            ELSE
              wo_number
          END AS INTEGER
        ) ${order},
        CAST(
          CASE 
            WHEN INSTR(wo_number, '-') > 0 THEN
              SUBSTR(wo_number, INSTR(wo_number, '-') + 1)
            ELSE
              '0'
          END AS INTEGER
        ) ${order}`;
    } else {
      orderClause = `ORDER BY ${sortCol} ${order}`;
    }

    // Get total count
    const countRow = db.prepare(`SELECT COUNT(*) as count FROM engineering_work_orders ${whereClause}`).get(params);
    const total = countRow.count;

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = limit === 'all' ? total : Math.max(1, parseInt(limit));
    const offset = (pageNum - 1) * limitNum;

    const rows = db.prepare(
      `SELECT * FROM engineering_work_orders ${whereClause} ${orderClause} LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit: limitNum, offset });

    res.json({
      success: true,
      data: rows.map(transformRow),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('[work-orders] GET / error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/work-orders/:id
router.get('/:id', (req, res) => {
  try {
    const db = req.db;
    const row = db.prepare('SELECT * FROM engineering_work_orders WHERE id = ?').get(req.params.id);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Work order not found' });
    }
    res.json({ success: true, data: transformRow(row) });
  } catch (err) {
    console.error('[work-orders] GET /:id error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/work-orders - Create new
router.post('/', (req, res) => {
  try {
    const db = req.db;
    const now = new Date().toISOString();
    const id = uuidv4();
    const {
      woNumber, priority = 0, isHotJob = false, dueDate, partNumber,
      revAlert, partName, project, qn, customer, estProgrammingHours,
      estEngineeringHours, price, materialStatus = 'not-ordered',
      notes, workOrderNotes, comments = [], currentBox, machineScheduled,
      currentStatus = 'engineering', metadata = {}
    } = req.body;

    if (!woNumber || !partNumber || !partName || !customer) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: woNumber, partNumber, partName, customer'
      });
    }

    // Auto-set status to 'engineering' when assigned to Rob
    // This ensures any job assigned to Rob automatically gets engineering status
    const finalStatus = currentBox === 'Rob' ? 'engineering' : currentStatus;

    const stmt = db.prepare(`
      INSERT INTO engineering_work_orders (
        id, wo_number, priority, is_hot_job, due_date, part_number, rev_alert,
        part_name, project, qn, customer, est_programming_hours, est_engineering_hours,
        price, material_status, notes, work_order_notes, comments, current_box, machine_scheduled,
        current_status, metadata, version, created_at, updated_at
      ) VALUES (
        @id, @wo_number, @priority, @is_hot_job, @due_date, @part_number, @rev_alert,
        @part_name, @project, @qn, @customer, @est_programming_hours, @est_engineering_hours,
        @price, @material_status, @notes, @work_order_notes, @comments, @current_box, @machine_scheduled,
        @current_status, @metadata, 1, @created_at, @updated_at
      )
    `);

    stmt.run({
      id,
      wo_number: woNumber,
      priority: Number(priority),
      is_hot_job: isHotJob ? 1 : 0,
      due_date: dueDate || null,
      part_number: partNumber,
      rev_alert: revAlert || null,
      part_name: partName,
      project: project || null,
      qn: qn || null,
      customer,
      est_programming_hours: estProgrammingHours != null ? Number(estProgrammingHours) : null,
      est_engineering_hours: estEngineeringHours != null ? Number(estEngineeringHours) : null,
      price: price != null ? Number(price) : null,
      material_status: materialStatus,
      notes: stripHtml(notes) || null,
      work_order_notes: stripHtml(workOrderNotes) ?? null,
      comments: JSON.stringify(comments),
      current_box: currentBox || null,
      machine_scheduled: machineScheduled || null,
      current_status: finalStatus,
      metadata: JSON.stringify(metadata),
      created_at: now,
      updated_at: now
    });

    const newRow = db.prepare('SELECT * FROM engineering_work_orders WHERE id = ?').get(id);
    const transformed = transformRow(newRow);
    eventBus.emit('work-order:created', transformed);
    res.status(201).json({ success: true, data: transformed });
  } catch (err) {
    console.error('[work-orders] POST / error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PATCH /api/work-orders/:id - Safe partial update with merge
router.patch('/:id', (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const updates = req.body;

    // 1. Load existing row
    const existing = db.prepare('SELECT * FROM engineering_work_orders WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Work order not found' });
    }

    // 2. Optimistic concurrency check
    if (updates.version !== undefined && updates.version !== existing.version) {
      return res.status(409).json({
        success: false,
        error: 'Version conflict. Record was modified by another user.',
        currentVersion: existing.version
      });
    }

    // 3. Merge: only overwrite fields that are explicitly provided
    const now = new Date().toISOString();
    const merged = {
      wo_number: updates.woNumber !== undefined ? updates.woNumber : existing.wo_number,
      priority: updates.priority !== undefined ? Number(updates.priority) : existing.priority,
      is_hot_job: updates.isHotJob !== undefined ? (updates.isHotJob ? 1 : 0) : existing.is_hot_job,
      due_date: updates.dueDate !== undefined ? updates.dueDate : existing.due_date,
      part_number: updates.partNumber !== undefined ? updates.partNumber : existing.part_number,
      rev_alert: updates.revAlert !== undefined ? updates.revAlert : existing.rev_alert,
      part_name: updates.partName !== undefined ? updates.partName : existing.part_name,
      project: updates.project !== undefined ? updates.project : existing.project,
      qn: updates.qn !== undefined ? updates.qn : existing.qn,
      customer: updates.customer !== undefined ? updates.customer : existing.customer,
      est_programming_hours: updates.estProgrammingHours !== undefined ? updates.estProgrammingHours : existing.est_programming_hours,
      est_engineering_hours: updates.estEngineeringHours !== undefined ? updates.estEngineeringHours : existing.est_engineering_hours,
      price: updates.price !== undefined ? updates.price : existing.price,
      material_status: updates.materialStatus !== undefined ? updates.materialStatus : existing.material_status,
      notes: updates.notes !== undefined ? stripHtml(updates.notes) : existing.notes,
      work_order_notes: updates.workOrderNotes !== undefined ? stripHtml(updates.workOrderNotes) : existing.work_order_notes,
      comments: updates.comments !== undefined ? JSON.stringify(updates.comments) : existing.comments,
      current_box: updates.currentBox !== undefined ? updates.currentBox : existing.current_box,
      machine_scheduled: updates.machineScheduled !== undefined ? updates.machineScheduled : existing.machine_scheduled,
      current_status: updates.currentStatus !== undefined ? updates.currentStatus : existing.current_status,
      metadata: updates.metadata !== undefined ? JSON.stringify(updates.metadata) : existing.metadata,
      version: existing.version + 1,
      updated_at: now
    };

    // 3a. Auto-set status to 'engineering' when assigned to Rob
    // This ensures any job assigned to Rob automatically gets engineering status
    // Jobs with engineering status can have multiple assignments (not just Rob)
    if (merged.current_box === 'Rob') {
      merged.current_status = 'engineering';
    }

    // 4. Save merged row
    const stmt = db.prepare(`
      UPDATE engineering_work_orders SET
        wo_number = @wo_number, priority = @priority, is_hot_job = @is_hot_job,
        due_date = @due_date, part_number = @part_number, rev_alert = @rev_alert,
        part_name = @part_name, project = @project, qn = @qn, customer = @customer,
        est_programming_hours = @est_programming_hours, est_engineering_hours = @est_engineering_hours,
        price = @price, material_status = @material_status, notes = @notes,
        work_order_notes = @work_order_notes,
        comments = @comments, current_box = @current_box, machine_scheduled = @machine_scheduled,
        current_status = @current_status, metadata = @metadata,
        version = @version, updated_at = @updated_at
      WHERE id = @id
    `);

    stmt.run({ ...merged, id });

    // 5. Return full updated row
    const updatedRow = db.prepare('SELECT * FROM engineering_work_orders WHERE id = ?').get(id);
    const transformed = transformRow(updatedRow);
    eventBus.emit('work-order:updated', transformed);
    res.json({ success: true, data: transformed });
  } catch (err) {
    console.error('[work-orders] PATCH /:id error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/work-orders/:id
router.delete('/:id', (req, res) => {
  try {
    const db = req.db;
    const existing = db.prepare('SELECT * FROM engineering_work_orders WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Work order not found' });
    }
    db.prepare('DELETE FROM engineering_work_orders WHERE id = ?').run(req.params.id);
    eventBus.emit('work-order:deleted', { id: req.params.id });
    res.json({ success: true, message: 'Work order deleted' });
  } catch (err) {
    console.error('[work-orders] DELETE /:id error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

