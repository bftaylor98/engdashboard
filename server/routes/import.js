import { Router } from 'express';
import multer from 'multer';
import XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { eventBus } from '../lib/eventBus.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// Normalize a header string for matching (needed by loadCustomerAbbreviations)
function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[_\-\.]+/g, ' ').replace(/\s+/g, ' ');
}

// Load customer abbreviation mapping from customer_abb.csv
let customerAbbrMap = {}; // For customer field: companyName -> abbreviation
let customerUniqueIdMap = {}; // For part number prefix: companyName -> uniqueId
function loadCustomerAbbreviations() {
  try {
    const csvPath = path.join(__dirname, '..', '..', 'customer_abb.csv');
    if (!fs.existsSync(csvPath)) {
      console.warn('[import] customer_abb.csv not found, customer abbreviations will not be available');
      return;
    }
    
    const workbook = XLSX.readFile(csvPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    
    // Find header row (should be row 0)
    const headers = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c })];
      headers.push(cell ? String(cell.v || '').trim() : '');
    }
    
    const companyNameIdx = headers.findIndex(h => {
      const norm = normalizeHeader(h);
      return norm.includes('company') || norm.includes('name');
    });
    const uniqueIdIdx = headers.findIndex(h => {
      const norm = normalizeHeader(h);
      return norm.includes('unique') || norm.includes('id');
    });
    const abbreviationIdx = headers.findIndex(h => {
      const norm = normalizeHeader(h);
      return norm.includes('abbreviation') || norm.includes('abbr');
    });
    
    if (companyNameIdx === -1) {
      console.warn('[import] Could not find Company Name column in customer_abb.csv');
      return;
    }
    
    // Build mappings:
    // 1. customerAbbrMap: companyName -> abbreviation (for customer field)
    // 2. customerUniqueIdMap: companyName -> uniqueId (for part number prefix)
    for (let r = 1; r <= range.e.r; r++) {
      const companyCell = sheet[XLSX.utils.encode_cell({ r, c: companyNameIdx })];
      
      if (companyCell) {
        const companyName = String(companyCell.v || '').trim().toUpperCase();
        
        if (!companyName || companyName === 'TOTALS') continue;
        
        // Store uniqueId for part number prefix (if available)
        if (uniqueIdIdx !== -1) {
          const idCell = sheet[XLSX.utils.encode_cell({ r, c: uniqueIdIdx })];
          if (idCell) {
            const uniqueId = String(idCell.v || '').trim();
            if (uniqueId) {
              customerUniqueIdMap[companyName] = uniqueId;
            }
          }
        }
        
        // Store abbreviation for customer field (only if it exists)
        if (abbreviationIdx !== -1) {
          const abbrCell = sheet[XLSX.utils.encode_cell({ r, c: abbreviationIdx })];
          if (abbrCell) {
            const abbreviation = String(abbrCell.v || '').trim();
            if (abbreviation) {
              customerAbbrMap[companyName] = abbreviation;
            }
          }
        }
      }
    }
    
    console.log(`[import] Loaded ${Object.keys(customerAbbrMap).length} customer abbreviations and ${Object.keys(customerUniqueIdMap).length} unique IDs`);
  } catch (err) {
    console.error('[import] Error loading customer_abb.csv:', err);
  }
}

// Load on module initialization
loadCustomerAbbreviations();

// Configure multer for file uploads
const uploadsDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xlsm', '.xls', '.csv'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xlsm, .xls) and CSV files are supported'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// Known column mappings (fuzzy match targets)
const COLUMN_MAP = {
  'priority': 'priority',
  'wo number': 'wo_number',
  'wo#': 'wo_number',
  'work order': 'wo_number',
  'work order #': 'wo_number',
  'due date': 'due_date',
  'duedate': 'due_date',
  'cust due': 'due_date',
  'cust. due': 'due_date',
  'pn': 'part_number',
  'part number': 'part_number',
  'part#': 'part_number',
  'part #': 'part_number',
  'partnumber': 'part_number',
  'rev. alert': 'rev_alert',
  'rev alert': 'rev_alert',
  'revalert': 'rev_alert',
  'revision alert': 'rev_alert',
  'part name': 'part_name',
  'parts part name': 'part_name',
  'parts, part name': 'part_name',
  'partname': 'part_name',
  'description': 'part_name',
  'project': 'project',
  'qn': 'qn',
  'quote': 'qn',
  'quote number': 'qn',
  'customer': 'customer',
  'est. prog. time (hrs)': 'est_programming_hours',
  'est prog time': 'est_programming_hours',
  'programming hours': 'est_programming_hours',
  'est. eng time (hrs)': 'est_engineering_hours',
  'est eng time': 'est_engineering_hours',
  'engineering hours': 'est_engineering_hours',
  'price': 'price',
  'material ordered': 'material_status',
  'material status': 'material_status',
  'material': 'material_status',
  'notes': 'notes',
  'current box': 'current_box',
  'currentbox': 'current_box',
  'assignee': 'current_box',
  'assigned to': 'current_box',
  'machine scheduled': 'machine_scheduled',
  'machine': 'machine_scheduled'
};

// Detect header row in a sheet (scan first 5 rows)
function detectHeaderRow(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  let bestRow = 0;
  let bestScore = 0;

  // Check first 5 rows for header
  for (let r = range.s.r; r <= Math.min(range.e.r, 4); r++) {
    let score = 0;
    let headerLikeCount = 0;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === 's' && cell.v && String(cell.v).trim().length > 0) {
        const cellValue = String(cell.v).trim();
        const normalized = normalizeHeader(cellValue);
        
        // Check if this looks like a header (contains #, or common header words)
        if (cellValue.includes('#') || 
            cellValue.toLowerCase().includes('work order') ||
            cellValue.toLowerCase().includes('part') ||
            cellValue.toLowerCase().includes('customer') ||
            cellValue.toLowerCase().includes('due')) {
          headerLikeCount++;
        }
        
        if (COLUMN_MAP[normalized]) {
          score += 3; // Known column = high score
        } else {
          score += 1; // Any string = some score
        }
      }
    }
    // Boost score if row looks like headers (multiple header-like cells)
    if (headerLikeCount >= 2) {
      score += 5;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }

  return bestRow;
}

// Parse sheet data starting from detected header row
function parseSheet(sheet, headerRow) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  
  // Extract headers
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cell = sheet[XLSX.utils.encode_cell({ r: headerRow, c })];
    headers.push(cell ? String(cell.v || '').trim() : '');
  }

  // Map headers to DB columns
  const mappings = headers.map((h, idx) => {
    const normalized = normalizeHeader(h);
    const dbColumn = COLUMN_MAP[normalized] || null;
    return {
      index: idx,
      original: h,
      normalized,
      dbColumn,
      mapped: dbColumn !== null
    };
  });

  // Extract data rows
  const rows = [];
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const row = {};
    let hasData = false;
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })];
      const colIdx = c - range.s.c;
      if (colIdx < headers.length) {
        let value = cell ? cell.v : null;
        // Handle Excel dates
        if (cell && cell.t === 'n' && cell.w && /\d{4}[-\/]\d{2}[-\/]\d{2}/.test(cell.w)) {
          value = cell.w;
        } else if (cell && cell.t === 'd') {
          value = cell.v instanceof Date ? cell.v.toISOString().split('T')[0] : cell.v;
        }
        row[headers[colIdx] || `col_${colIdx}`] = value;
        if (value !== null && value !== undefined && String(value).trim() !== '') {
          hasData = true;
        }
      }
    }
    if (hasData) {
      rows.push(row);
    }
  }

  return { headers, mappings, rows };
}

// Normalize material status values
function normalizeMaterialStatus(val) {
  if (!val) return 'not-ordered';
  const v = String(val).trim().toLowerCase();
  if (v === 'arrived' || v === 'yes' || v === 'received') return 'arrived';
  if (v === 'ordered' || v === 'on order') return 'ordered';
  return 'not-ordered';
}

// Transform part number: extract base part, remove leading zeros, replace underscore with hyphen, add customer prefix
function transformPartNumber(rawPartNumber, customerName, customerUniqueIdMap) {
  if (!rawPartNumber || typeof rawPartNumber !== 'string') {
    return rawPartNumber || '';
  }
  
  const trimmed = rawPartNumber.trim();
  if (!trimmed) return rawPartNumber;
  
  try {
    // Extract base part number (everything before first space or parenthesis)
    // Pattern: "0004852_MATERIAL (description)" -> "0004852_MATERIAL"
    let basePart = trimmed;
    const spaceIdx = basePart.indexOf(' ');
    const parenIdx = basePart.indexOf('(');
    
    if (spaceIdx !== -1 && (parenIdx === -1 || spaceIdx < parenIdx)) {
      basePart = basePart.substring(0, spaceIdx).trim();
    } else if (parenIdx !== -1) {
      basePart = basePart.substring(0, parenIdx).trim();
    }
    
    // Remove leading zeros from the numeric part before underscore
    // "0004852_MATERIAL" -> "4852_MATERIAL"
    // Pattern: digits_letters -> remove leading zeros from digits part
    const partMatch = basePart.match(/^(0*)(\d+)(_[A-Z0-9_]+)$/i);
    if (partMatch) {
      // Found pattern with underscore: remove leading zeros from numeric part
      basePart = `${partMatch[2]}${partMatch[3]}`;
    } else {
      // Try simpler pattern: just remove leading zeros from start
      const leadingZeroMatch = basePart.match(/^(0+)(\d+.*)$/);
      if (leadingZeroMatch) {
        basePart = leadingZeroMatch[2];
      }
    }
    
    // Replace underscore with hyphen
    // "4852_MATERIAL" -> "4852-MATERIAL"
    let transformed = basePart.replace(/_/g, '-');
    
    // Look up customer uniqueId for part number prefix (case-insensitive)
    if (customerName && customerUniqueIdMap) {
      const customerUpper = String(customerName).trim().toUpperCase();
      const uniqueId = customerUniqueIdMap[customerUpper];
      
      if (uniqueId) {
        // Prefix with customer uniqueId
        // "BFPA-4852-MATERIAL"
        transformed = `${uniqueId}-${transformed}`;
      } else {
        console.warn(`[import] Customer uniqueId not found for: ${customerName}`);
      }
    }
    
    return transformed;
  } catch (err) {
    console.error('[import] Error transforming part number:', err);
    return rawPartNumber; // Return original on error
  }
}

// POST /api/import/upload - Upload Excel file, return preview
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const workbook = XLSX.readFile(req.file.path, { cellDates: true, cellText: true });
    const sheetNames = workbook.SheetNames;
    const result = { filename: req.file.originalname, sheets: {} };

    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name];
      const headerRow = detectHeaderRow(sheet);
      const parsed = parseSheet(sheet, headerRow);
      
      result.sheets[name] = {
        headerRow,
        headers: parsed.headers,
        mappings: parsed.mappings,
        rowCount: parsed.rows.length,
        sampleRows: parsed.rows.slice(0, 5)
      };
    }

    // Store filepath for confirm step
    result.filePath = req.file.path;

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[import] upload error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/import/confirm - Confirm import with optional mapping overrides
router.post('/confirm', (req, res) => {
  try {
    const db = req.db;
    const { filePath, mappingOverrides, mode = 'replace' } = req.body;

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ success: false, error: 'File not found. Please upload again.' });
    }

    const workbook = XLSX.readFile(filePath, { cellDates: true, cellText: true });
    const now = new Date().toISOString();
    const report = { schedule: { imported: 0, skipped: 0, errors: [] }, revisions: { imported: 0 }, construction: { imported: 0 } };

    // If replace mode, clear existing data
    if (mode === 'replace') {
      db.exec('DELETE FROM engineering_work_orders');
      db.exec('DELETE FROM revision_alerts');
      db.exec('DELETE FROM construction_metrics');
    }

    // --- Import Schedule sheet ---
    const scheduleSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('schedule')) || workbook.SheetNames[0];
    if (scheduleSheetName && workbook.Sheets[scheduleSheetName]) {
      const sheet = workbook.Sheets[scheduleSheetName];
      const headerRow = detectHeaderRow(sheet);
      const parsed = parseSheet(sheet, headerRow);

      // Build column index map
      const colMap = {};
      for (const m of parsed.mappings) {
        if (m.dbColumn) {
          colMap[m.original] = m.dbColumn;
        }
      }
      // Apply overrides
      if (mappingOverrides) {
        for (const [orig, dbCol] of Object.entries(mappingOverrides)) {
          colMap[orig] = dbCol;
        }
      }

      const insertStmt = db.prepare(`
        INSERT INTO engineering_work_orders (
          id, wo_number, priority, is_hot_job, due_date, part_number, rev_alert,
          part_name, project, qn, customer, est_programming_hours, est_engineering_hours,
          price, material_status, notes, comments, current_box, machine_scheduled,
          current_status, metadata, version, created_at, updated_at
        ) VALUES (
          @id, @wo_number, @priority, @is_hot_job, @due_date, @part_number, @rev_alert,
          @part_name, @project, @qn, @customer, @est_programming_hours, @est_engineering_hours,
          @price, @material_status, @notes, @comments, @current_box, @machine_scheduled,
          @current_status, @metadata, 1, @created_at, @updated_at
        )
      `);

      const importRow = db.transaction((rows) => {
        for (const row of rows) {
          try {
            // Map row values to DB columns
            const mapped = {};
            const extra = {};
            for (const [header, value] of Object.entries(row)) {
              const dbCol = colMap[header];
              if (dbCol) {
                mapped[dbCol] = value;
              } else if (header.trim() && header.trim() !== '' && header !== 'Link' && header !== ' ') {
                extra[header] = value;
              }
            }

            // Skip rows that look like headers (e.g., "Work Order #", "Part #", etc.)
            const woNumberStr = String(mapped.wo_number || '').trim().toLowerCase();
            if (woNumberStr === 'work order #' || woNumberStr === 'wo number' || woNumberStr === 'work order' || 
                woNumberStr === 'part #' || woNumberStr === 'part number' || woNumberStr === 'customer' ||
                woNumberStr === 'totals' || woNumberStr === 'total') {
              report.schedule.skipped++;
              continue;
            }

            // Skip rows without WO number
            if (!mapped.wo_number) {
              report.schedule.skipped++;
              continue;
            }

            const priority = mapped.priority != null ? Number(mapped.priority) || 0 : 0;
            
            // Handle date conversion
            let dueDate = mapped.due_date;
            if (dueDate instanceof Date) {
              dueDate = dueDate.toISOString().split('T')[0];
            } else if (typeof dueDate === 'number') {
              // Excel serial date
              const d = XLSX.SSF.parse_date_code(dueDate);
              if (d) dueDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
            } else if (typeof dueDate === 'string') {
              // Handle CSV date formats like "3/27/2026"
              const dateMatch = dueDate.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
              if (dateMatch) {
                const [, month, day, year] = dateMatch;
                dueDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
              }
            }

            // Transform part number
            const rawPartNumber = mapped.part_number ? String(mapped.part_number) : '';
            const customerName = mapped.customer ? String(mapped.customer) : '';
            const transformedPartNumber = rawPartNumber 
              ? transformPartNumber(rawPartNumber, customerName, customerUniqueIdMap)
              : 'UNKNOWN';

            // Use abbreviation for customer field if available, otherwise use original customer name
            let customerValue = String(mapped.customer || 'Unknown');
            if (customerName && customerAbbrMap) {
              const customerUpper = customerName.trim().toUpperCase();
              const abbreviation = customerAbbrMap[customerUpper];
              if (abbreviation) {
                customerValue = abbreviation;
              }
            }

            insertStmt.run({
              id: uuidv4(),
              wo_number: String(mapped.wo_number || ''),
              priority: Math.min(11, Math.max(0, priority)),
              is_hot_job: priority === 11 ? 1 : 0,
              due_date: dueDate || null,
              part_number: transformedPartNumber,
              rev_alert: mapped.rev_alert ? String(mapped.rev_alert) : null,
              part_name: String(mapped.part_name || 'Unnamed'),
              project: mapped.project ? String(mapped.project) : null,
              qn: mapped.qn ? String(mapped.qn) : null,
              customer: customerValue,
              est_programming_hours: mapped.est_programming_hours != null ? Number(mapped.est_programming_hours) || null : null,
              est_engineering_hours: mapped.est_engineering_hours != null ? Number(mapped.est_engineering_hours) || null : null,
              price: mapped.price != null ? Number(mapped.price) || null : null,
              material_status: normalizeMaterialStatus(mapped.material_status),
              notes: mapped.notes ? String(mapped.notes) : null,
              comments: '[]',
              current_box: mapped.current_box ? String(mapped.current_box) : null,
              machine_scheduled: mapped.machine_scheduled ? String(mapped.machine_scheduled) : null,
              current_status: 'engineering',
              metadata: JSON.stringify(extra),
              created_at: now,
              updated_at: now
            });
            report.schedule.imported++;
          } catch (rowErr) {
            report.schedule.errors.push({ wo: row['WO Number'] || 'unknown', error: rowErr.message });
          }
        }
      });

      importRow(parsed.rows);
    }

    // --- Import Needed Revisions sheet ---
    const revSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('revision'));
    if (revSheetName && workbook.Sheets[revSheetName]) {
      const sheet = workbook.Sheets[revSheetName];
      const headerRow = detectHeaderRow(sheet);
      const parsed = parseSheet(sheet, headerRow);

      const insertRev = db.prepare(`
        INSERT INTO revision_alerts (part_number, part_name, revision_date, created_at, updated_at)
        VALUES (@part_number, @part_name, @revision_date, @created_at, @updated_at)
      `);

      for (const row of parsed.rows) {
        const pn = row['Part Number'] || row['PN'] || Object.values(row)[0];
        if (!pn) continue;

        let revDate = row['Date of Revision'] || row['Revision Date'] || null;
        if (revDate instanceof Date) {
          revDate = revDate.toISOString().split('T')[0];
        }

        insertRev.run({
          part_number: String(pn),
          part_name: row['Part Name'] ? String(row['Part Name']) : null,
          revision_date: revDate ? String(revDate) : null,
          created_at: now,
          updated_at: now
        });
        report.revisions.imported++;
      }
    }

    // --- Import Construction sheet ---
    const constSheetName = workbook.SheetNames.find(n => n.toLowerCase().includes('construction'));
    if (constSheetName && workbook.Sheets[constSheetName]) {
      const sheet = workbook.Sheets[constSheetName];
      const headerRow = detectHeaderRow(sheet);
      const parsed = parseSheet(sheet, headerRow);
      const snapshotDate = now.split('T')[0];

      const assigneeColumns = ['Rob', 'Thad', 'Damien', 'Review', 'Eng Comp', 'Brad', 'Prog. Que', 'Alex', 'Mike', 'Phillip'];
      
      const insertConst = db.prepare(`
        INSERT INTO construction_metrics (box_name, percentage_of_jobs, jobs_to_go, jobs_scheduled, total_jobs, assignee_counts, snapshot_date, created_at)
        VALUES (@box_name, @percentage_of_jobs, @jobs_to_go, @jobs_scheduled, @total_jobs, @assignee_counts, @snapshot_date, @created_at)
      `);

      for (const row of parsed.rows) {
        const boxName = row['Box List'] || Object.values(row)[0];
        if (!boxName) continue;

        const assigneeCounts = {};
        for (const col of assigneeColumns) {
          if (row[col] != null && row[col] !== '') {
            assigneeCounts[col] = Number(row[col]) || 0;
          }
        }

        const pctVal = row['Percentage of Jobs'];
        const jobsToGo = row['Jobs to Go'];
        const jobsSched = row['Jobs Scheduled'];
        const totalJobs = row['Total Jobs'];

        insertConst.run({
          box_name: String(boxName),
          percentage_of_jobs: pctVal != null && !isNaN(Number(pctVal)) ? Number(pctVal) : null,
          jobs_to_go: jobsToGo != null && !isNaN(Number(jobsToGo)) ? Number(jobsToGo) : null,
          jobs_scheduled: jobsSched != null && !isNaN(Number(jobsSched)) ? Number(jobsSched) : null,
          total_jobs: totalJobs != null && !isNaN(Number(totalJobs)) ? Number(totalJobs) : null,
          assignee_counts: JSON.stringify(assigneeCounts),
          snapshot_date: snapshotDate,
          created_at: now
        });
        report.construction.imported++;
      }
    }

    // Save import history
    db.prepare(`
      INSERT INTO import_history (filename, rows_imported, rows_skipped, rows_errored, import_report, imported_at)
      VALUES (@filename, @rows_imported, @rows_skipped, @rows_errored, @import_report, @imported_at)
    `).run({
      filename: path.basename(filePath),
      rows_imported: report.schedule.imported,
      rows_skipped: report.schedule.skipped,
      rows_errored: report.schedule.errors.length,
      import_report: JSON.stringify(report),
      imported_at: now
    });

    // Cleanup uploaded file
    try { fs.unlinkSync(filePath); } catch {}

    // Broadcast import event for SSE listeners
    eventBus.emit('import:completed', report);

    res.json({ success: true, data: report });
  } catch (err) {
    console.error('[import] confirm error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;

