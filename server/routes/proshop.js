import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import { eventBus } from '../lib/eventBus.js';
import { executeGraphQLQuery, PROSHOP_CONFIG, isProshopRateLimitError } from '../lib/proshopClient.js';
import { cacheLog } from '../lib/cacheLogger.js';
import { setCache, setCacheError, clearCacheError, getCache, getCacheData, getCacheError } from '../lib/cacheStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

// Shared rate-limit response: 200 + this body when no cache and last refresh failed with 429/400
const RATE_LIMIT_RESPONSE = {
  error: true,
  reason: 'rate_limited',
  message: 'ProShop is temporarily unavailable. Please try again shortly.',
};

// Tooling expenses: cache filled only by background refresh; routes never call ProShop (state in cacheStore)

// Open POs: cache filled only by background refresh (state in cacheStore)

// Customer abbreviation mapping (reused from import.js logic)
let customerAbbrMap = {}; // For customer field: companyName -> abbreviation
let customerUniqueIdMap = {}; // For part number prefix: companyName -> uniqueId
const customerUniqueIdWarned = new Set(); // Log each missing customer only once

// Normalize a header string for matching
function normalizeHeader(h) {
  return String(h || '').trim().toLowerCase().replace(/[_\-\.]+/g, ' ').replace(/\s+/g, ' ');
}

// Load customer abbreviation mapping from customer_abb.csv
function loadCustomerAbbreviations() {
  try {
    const csvPath = path.join(__dirname, '..', '..', 'customer_abb.csv');
    if (!fs.existsSync(csvPath)) {
      console.warn('[proshop] customer_abb.csv not found, customer abbreviations will not be available');
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
      console.warn('[proshop] Could not find Company Name column in customer_abb.csv');
      return;
    }
    
    // Build mappings
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
              // Also map first word (e.g. "SSP" from "SSP CORPORATION") so Proshop short names match
              const firstWord = companyName.split(/[\s,]+/)[0];
              if (firstWord && !customerUniqueIdMap[firstWord]) {
                customerUniqueIdMap[firstWord] = uniqueId;
              }
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
    
    console.log(`[proshop] Loaded ${Object.keys(customerAbbrMap).length} customer abbreviations and ${Object.keys(customerUniqueIdMap).length} unique IDs`);
  } catch (err) {
    console.error('[proshop] Error loading customer_abb.csv:', err);
  }
}

// Employee ID -> display name (from employee_ID.csv in project root)
let employeeIdToName = {};

function loadEmployeeIdMap() {
  try {
    const csvPath = join(dirname(join(__dirname, '..')), 'employee_ID.csv');
    if (!fs.existsSync(csvPath)) {
      console.warn('[proshop] employee_ID.csv not found at', csvPath);
      return;
    }
    const raw = fs.readFileSync(csvPath, 'utf8');
    const lines = raw.split(/\r?\n/).filter((l) => l.trim());
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const cols = line.match(/"([^"]*)"/g);
      if (!cols || cols.length < 3) continue;
      const id = cols[0].slice(1, -1).trim();
      const firstName = cols[1].slice(1, -1).trim();
      const lastName = cols[2].slice(1, -1).trim();
      if (!id || id.toUpperCase() === 'TOTALS') continue;
      employeeIdToName[id] = firstName + (lastName ? ' ' + lastName : '');
    }
    console.log(`[proshop] Loaded ${Object.keys(employeeIdToName).length} employee ID -> name mappings`);
  } catch (err) {
    console.error('[proshop] Error loading employee_ID.csv:', err);
  }
}

// Load on module initialization
loadCustomerAbbreviations();
loadEmployeeIdMap();

// Normalize material status values
function normalizeMaterialStatus(val) {
  if (!val) return 'not-ordered';
  const v = String(val).trim().toLowerCase();
  if (v === 'arrived' || v === 'yes' || v === 'received') return 'arrived';
  if (v === 'ordered' || v === 'on order') return 'ordered';
  return 'not-ordered';
}

// Strip HTML tags and collapse whitespace (Proshop notes often contain <p>, <b>, etc.)
function stripHtml(html) {
  if (html == null || typeof html !== 'string') return null;
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

// Hyphen-like characters (ASCII hyphen, en-dash, em-dash, minus) so we split and normalize correctly
const HYPHEN_LIKE = /[\u002D\u2010-\u2015\u2212]/g;

// Transform part number: extract base part, remove leading zeros, replace underscore with hyphen, add customer prefix
function transformPartNumber(rawPartNumber, customerName) {
  if (!rawPartNumber || typeof rawPartNumber !== 'string') {
    return rawPartNumber || '';
  }
  
  const trimmed = rawPartNumber.trim();
  if (!trimmed) return rawPartNumber;
  
  try {
    // Extract base part number (everything before first space or parenthesis)
    let basePart = trimmed;
    const spaceIdx = basePart.indexOf(' ');
    const parenIdx = basePart.indexOf('(');
    
    if (spaceIdx !== -1 && (parenIdx === -1 || spaceIdx < parenIdx)) {
      basePart = basePart.substring(0, spaceIdx).trim();
    } else if (parenIdx !== -1) {
      basePart = basePart.substring(0, parenIdx).trim();
    }
    
    // Normalize hyphen-like chars to ASCII hyphen (API may return en-dash etc., so split would otherwise fail)
    basePart = basePart.replace(HYPHEN_LIKE, '-');
    
    // Remove leading zeros from every hyphen-separated segment (0000541 -> 541, 0500 -> 500, SSP0000541 -> SSP541)
    basePart = basePart.split('-').map(seg => {
      let s = String(seg).trim();
      // Strip leading zeros at start of segment (handles 0000541, 0500, and leaves SSP/NEW unchanged)
      s = s.replace(/^0+(?=\d)/, '');
      // If segment is letters then zeros then digits (no hyphen), e.g. SSP0000541
      s = s.replace(/^([A-Za-z]+)0+(\d+)(.*)$/i, '$1$2$3');
      return s;
    }).join('-');
    // Whole-string fallbacks: digits with optional suffix after underscore, or string that starts with zeros
    const partMatch = basePart.match(/^(0*)(\d+)(_[A-Z0-9_]+)$/i);
    if (partMatch) {
      basePart = `${String(Number(partMatch[2]))}${partMatch[3]}`;
    } else {
      const leadingZeroMatch = basePart.match(/^(0+)(\d+.*)$/);
      if (leadingZeroMatch) {
        basePart = leadingZeroMatch[2];
      }
    }
    
    // Replace underscore with hyphen
    let transformed = basePart.replace(/_/g, '-');
    
    // Look up customer uniqueId for part number prefix (case-insensitive)
    if (customerName && customerUniqueIdMap) {
      const customerUpper = String(customerName).trim().toUpperCase();
      let uniqueId = customerUniqueIdMap[customerUpper];
      if (!uniqueId) {
        const key = Object.keys(customerUniqueIdMap).find(k =>
          k.startsWith(customerUpper + ' ') || k.startsWith(customerUpper + ',') || customerUpper.startsWith(k)
        );
        if (key) uniqueId = customerUniqueIdMap[key];
      }
      if (uniqueId) {
        const prefix = `${uniqueId}-`;
        if (!transformed.toUpperCase().startsWith(prefix.toUpperCase())) {
          transformed = `${uniqueId}-${transformed}`;
        }
      } else if (!customerUniqueIdWarned.has(customerUpper)) {
        customerUniqueIdWarned.add(customerUpper);
        cacheLog.warn('proshop', 'Customer uniqueId not found for:', customerName, '(add to customer_abb.csv Company Name / Unique Id)');
      }
    }
    
    return transformed;
  } catch (err) {
    cacheLog.error('proshop', 'Error transforming part number:', err);
    return rawPartNumber; // Return original on error
  }
}

/**
 * Fetch part descriptions via Part(partNumber) using partDescription (API rejects "description" on Part).
 * Returns Map(partNumber -> description string or null).
 */
async function fetchPartDescriptions(partNumbers) {
  const map = new Map();
  if (!partNumbers || partNumbers.length === 0) return map;
  const unique = [...new Set(partNumbers.filter(Boolean))];
  const query = `
    query GetPart($partNumber: String!) {
      part(partNumber: $partNumber) {
        partNumber
        partDescription
      }
    }
  `;
  await Promise.all(unique.map(async (partNumber) => {
    try {
      const data = await executeGraphQLQuery(query, { partNumber });
      const desc = data?.part?.partDescription;
      map.set(partNumber, (typeof desc === 'string' && desc.trim()) ? desc.trim() : null);
    } catch (err) {
      cacheLog.warn('proshop', 'Could not fetch part description for', partNumber, err.message);
      map.set(partNumber, null);
    }
  }));
  return map;
}

/**
 * Get current month date range (first day to last day)
 */
function getCurrentMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  // First day of current month at 00:00:00
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  
  // Last day of current month at 23:59:59
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  
  return { start, end };
}

/**
 * Get rolling 30 days date range (30 days ago to today)
 */
function getRolling30DaysRange() {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - 29); // 30 days including today
  start.setHours(0, 0, 0, 0);
  
  return { start, end };
}

/**
 * Get last month date range (first day to last day of previous month)
 */
function getLastMonthRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  
  // First day of last month at 00:00:00
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  
  // Last day of last month at 23:59:59
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  
  return { start, end };
}

/**
 * Get date range for a specific month (months ago from current month)
 * @param {number} monthsAgo - Number of months ago (0 = current month, 1 = last month, etc.)
 */
function getMonthRange(monthsAgo) {
  const now = new Date();
  const targetDate = new Date(now.getFullYear(), now.getMonth() - monthsAgo, 1);
  const year = targetDate.getFullYear();
  const month = targetDate.getMonth();
  
  // First day of target month at 00:00:00
  const start = new Date(year, month, 1, 0, 0, 0, 0);
  
  // Last day of target month at 23:59:59
  const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
  
  return { start, end, month, year };
}

/**
 * Format month name for display
 */
function formatMonth(date) {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Parse date string from Proshop API
 */
function parseProshopDate(dateStr) {
  if (!dateStr) return null;
  
  if (dateStr.includes('T')) {
    return new Date(dateStr);
  } else if (dateStr.includes('/')) {
    const [month, day, year] = dateStr.split('/');
    let yearInt = parseInt(year);
    // Handle 2-digit years (assume 2000s)
    if (yearInt < 100) {
      yearInt += 2000;
    }
    return new Date(yearInt, parseInt(month) - 1, parseInt(day));
  }
  
  return new Date(dateStr);
}

/**
 * Filter POs by date range and calculate stats
 */
function calculateStatsForPeriod(allPOs, start, end) {
  const filteredPOs = allPOs.filter(po => {
    // Check supplier name (case-insensitive) - matches "rocket" or "rocket supply"
    const supplier = po.supplier?.name || '';
    const supplierLower = supplier.toLowerCase();
    if (!supplierLower.includes('rocket')) {
      return false;
    }

    // Check if PO date is within range
    const poDateStr = po.date;
    if (!poDateStr) {
      return false;
    }

    const poDate = parseProshopDate(poDateStr);
    if (!poDate || isNaN(poDate.getTime())) {
      return false;
    }

    return poDate >= start && poDate <= end;
  });

  // Sum total values using 'cost' field
  let totalExpense = 0;
  filteredPOs.forEach(po => {
    const cost = parseFloat(po.cost) || 0;
    totalExpense += cost;
  });

  return {
    totalExpense: Math.round(totalExpense * 100) / 100,
    poCount: filteredPOs.length,
  };
}

/**
 * Calculate stats by PO type for a given date range
 */
function calculateStatsByType(pos, startDate, endDate) {
  // Filter POs by supplier and date range
  const filteredPOs = pos.filter(po => {
    // Check supplier name (case-insensitive) - matches "rocket" or "rocket supply"
    const supplier = po.supplier?.name || '';
    const supplierLower = supplier.toLowerCase();
    if (!supplierLower.includes('rocket')) {
      return false;
    }

    // Check if PO date is within range
    if (!po.date) return false;
    const poDate = parseProshopDate(po.date);
    if (!poDate || isNaN(poDate.getTime())) return false;
    return poDate >= startDate && poDate <= endDate;
  });

  // Initialize type breakdown
  const typeBreakdown = {
    'Inserts': { totalExpense: 0, poCount: 0 },
    'Zoller Replenishment': { totalExpense: 0, poCount: 0 },
    'Regrinds': { totalExpense: 0, poCount: 0 },
    'General': { totalExpense: 0, poCount: 0 },
  };

  // Group and calculate by type
  filteredPOs.forEach(po => {
    const cost = parseFloat(po.cost) || 0;
    const poType = po.poType || 'General';
    
    // Normalize type name (handle variations)
    let normalizedType = 'General';
    if (poType && typeof poType === 'string') {
      const typeLower = poType.toLowerCase();
      if (typeLower.includes('insert')) {
        normalizedType = 'Inserts';
      } else if (typeLower.includes('zoller') || typeLower.includes('replenish')) {
        normalizedType = 'Zoller Replenishment';
      } else if (typeLower.includes('regrind')) {
        normalizedType = 'Regrinds';
      } else if (typeLower === 'general') {
        normalizedType = 'General';
      } else {
        // If it's a known type but with different casing, use it as-is
        if (typeBreakdown.hasOwnProperty(poType)) {
          normalizedType = poType;
        } else {
          normalizedType = 'General';
        }
      }
    }

    if (typeBreakdown[normalizedType]) {
      typeBreakdown[normalizedType].totalExpense += cost;
      typeBreakdown[normalizedType].poCount += 1;
    } else {
      // Fallback to General if type not recognized
      typeBreakdown['General'].totalExpense += cost;
      typeBreakdown['General'].poCount += 1;
    }
  });

  // Round totals
  Object.keys(typeBreakdown).forEach(type => {
    typeBreakdown[type].totalExpense = Math.round(typeBreakdown[type].totalExpense * 100) / 100;
  });

  return typeBreakdown;
}

/**
 * Build tooling expenses response from Proshop API (shared for route and cache warming).
 */
async function buildToolingExpensesResponse() {
  const currentMonthRange = getCurrentMonthRange();
  const rolling30DaysRange = getRolling30DaysRange();
  const lastMonthRange = getLastMonthRange();

  const earliestDate = new Date();
  earliestDate.setMonth(earliestDate.getMonth() - 6);
  earliestDate.setDate(1);
  earliestDate.setHours(0, 0, 0, 0);

  const query = `
    query GetPurchaseOrders($pageSize: Int!, $pageStart: Int!) {
      purchaseOrders(pageSize: $pageSize, pageStart: $pageStart) {
        totalRecords
        records {
          id
          cost
          date
          orderStatus
          poType
          supplier {
            name
          }
        }
      }
    }
  `;

  let allPOs = [];
  let pageSize = 200;
  let pageStart = 0;
  let hasMore = true;
  const MAX_PAGES = 20;
  let pagesFetched = 0;

  while (hasMore && pagesFetched < MAX_PAGES) {
    const variables = { pageSize, pageStart };
    const data = await executeGraphQLQuery(query, variables);

    if (!data || !data.purchaseOrders || !data.purchaseOrders.records) {
      break;
    }

    const records = data.purchaseOrders.records;
    const relevantRecords = records.filter(po => {
      if (!po.date) return false;
      const poDate = parseProshopDate(po.date);
      if (!poDate || isNaN(poDate.getTime())) return false;
      return poDate >= earliestDate;
    });

    allPOs = allPOs.concat(relevantRecords);
    pagesFetched++;

    if (records.length < pageSize) {
      hasMore = false;
    } else {
      pageStart += pageSize;
    }
  }

  const currentMonthStats = calculateStatsForPeriod(allPOs, currentMonthRange.start, currentMonthRange.end);
  const rolling30DaysStats = calculateStatsForPeriod(allPOs, rolling30DaysRange.start, rolling30DaysRange.end);
  const lastMonthStats = calculateStatsForPeriod(allPOs, lastMonthRange.start, lastMonthRange.end);

  const currentMonthTypeBreakdown = calculateStatsByType(allPOs, currentMonthRange.start, currentMonthRange.end);
  const rolling30DaysTypeBreakdown = calculateStatsByType(allPOs, rolling30DaysRange.start, rolling30DaysRange.end);
  const lastMonthTypeBreakdown = calculateStatsByType(allPOs, lastMonthRange.start, lastMonthRange.end);

  const sixMonthHistory = [];
  for (let i = 0; i < 6; i++) {
    const monthRange = getMonthRange(i);
    const stats = calculateStatsForPeriod(allPOs, monthRange.start, monthRange.end);
    const typeBreakdown = calculateStatsByType(allPOs, monthRange.start, monthRange.end);
    sixMonthHistory.push({
      month: formatMonth(new Date(monthRange.year, monthRange.month, 1)),
      totalExpense: stats.totalExpense,
      poCount: stats.poCount,
      monthIndex: i,
      typeBreakdown: typeBreakdown,
    });
  }

  const sixMonthTotal = sixMonthHistory.reduce((sum, month) => sum + month.totalExpense, 0);
  const sixMonthAverage = sixMonthTotal / 6;

  const currentDate = new Date();
  const currentMonthLabel = formatMonth(currentDate);
  const lastMonthLabel = formatMonth(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));

  const monthlyBudget = 25000;
  const remainingBudget = Math.max(0, monthlyBudget - currentMonthStats.totalExpense);
  const budgetUsedPercent = (currentMonthStats.totalExpense / monthlyBudget) * 100;

  const lastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const daysRemaining = Math.max(0, lastDayOfMonth.getDate() - currentDate.getDate());

  const requiredTypes = ['Inserts', 'Zoller Replenishment', 'Regrinds'];
  const verification = {};

  requiredTypes.forEach(type => {
    const typePOs = allPOs.filter(po => {
      const supplier = po.supplier?.name || '';
      const supplierLower = supplier.toLowerCase();
      if (!supplierLower.includes('rocket')) return false;
      if (!po.date) return false;
      const poDate = parseProshopDate(po.date);
      if (!poDate || isNaN(poDate.getTime())) return false;
      if (poDate < currentMonthRange.start || poDate > currentMonthRange.end) return false;
      const poType = po.poType || 'General';
      const typeLower = poType.toLowerCase();
      if (type === 'Inserts' && typeLower.includes('insert')) return true;
      if (type === 'Zoller Replenishment' && (typeLower.includes('zoller') || typeLower.includes('replenish'))) return true;
      if (type === 'Regrinds' && typeLower.includes('regrind')) return true;
      return false;
    });

    if (typePOs.length > 0) {
      const dates = typePOs
        .map(po => parseProshopDate(po.date))
        .filter(date => date && !isNaN(date.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());
      const firstPODate = dates.length > 0 ? typePOs.find(po => {
        const poDate = parseProshopDate(po.date);
        return poDate && poDate.getTime() === dates[0].getTime();
      })?.date : null;
      verification[type] = { hasPO: true, firstPODate: firstPODate || null, poCount: typePOs.length };
    } else {
      verification[type] = { hasPO: false, firstPODate: null, poCount: 0 };
    }
  });

  return {
    success: true,
    data: {
      totalExpense: currentMonthStats.totalExpense,
      month: currentMonthLabel,
      poCount: currentMonthStats.poCount,
      typeBreakdown: currentMonthTypeBreakdown,
      budget: {
        monthlyBudget,
        remaining: remainingBudget,
        usedPercent: Math.min(100, budgetUsedPercent),
        daysRemaining,
      },
      rolling30Days: {
        totalExpense: rolling30DaysStats.totalExpense,
        poCount: rolling30DaysStats.poCount,
        typeBreakdown: rolling30DaysTypeBreakdown,
      },
      lastMonth: {
        totalExpense: lastMonthStats.totalExpense,
        month: lastMonthLabel,
        poCount: lastMonthStats.poCount,
        typeBreakdown: lastMonthTypeBreakdown,
      },
      sixMonthHistory,
      sixMonthAverage: Math.round(sixMonthAverage * 100) / 100,
      verification,
      currency: 'USD',
    },
  };
}

/**
 * Warm tooling expenses cache in the background (call only from setInterval/startup; never from route).
 */
export async function warmToolingExpensesCache() {
  try {
    const response = await buildToolingExpensesResponse();
    setCache('tooling-expenses', response);
    cacheLog.info('proshop', 'Tooling expenses cache warmed');
  } catch (err) {
    if (isProshopRateLimitError(err)) {
      setCacheError('tooling-expenses', { reason: 'rate_limited', message: RATE_LIMIT_RESPONSE.message });
      cacheLog.warn('proshop', 'Tooling expenses warm rate limited (429/400), cache unchanged');
    } else {
      cacheLog.error('proshop', 'Tooling expenses warm failed:', err.message || err);
    }
    throw err;
  }
}

/**
 * Return current month tooling expense total for TV dashboard (cache-only; never calls ProShop).
 * @returns {Promise<number|null>} total expense for current month, or null if no cache
 */
export async function getToolingExpensesCurrentMonth() {
  const cached = getCacheData('tooling-expenses');
  if (!cached?.data) return null;
  const total = cached.data.totalExpense;
  return typeof total === 'number' ? total : null;
}

/**
 * GET /api/proshop/tooling-expenses
 * Returns cached tooling expenses only (never calls ProShop). Background job refreshes cache.
 */
router.get('/tooling-expenses', (req, res) => {
  const cached = getCacheData('tooling-expenses');
  if (cached) return res.json(cached);
  const err = getCacheError('tooling-expenses');
  if (err?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
  return res.status(200).json({ success: false, warming: true, error: 'Tooling data is still loading — cache is warming. Try again in a moment.' });
});

// Material status: cache filled only by background refresh; routes never call ProShop (state in cacheStore)

/**
 * Build material status response (shared for route and cache warming).
 * @param {object} db - Database instance
 * @param {string[]|null} woNumbersFromQuery - Optional WO numbers (e.g. from query); if null/empty, uses non-completed from DB.
 * @returns {Promise<{ response: { success: boolean, data: any[] }, cacheKey: string }>}
 */
async function buildMaterialStatusResponse(db, woNumbersFromQuery = null) {
  let woNumbers = Array.isArray(woNumbersFromQuery) ? woNumbersFromQuery : [];
  if (woNumbers.length === 0 && db) {
    const rows = db.prepare(
      "SELECT DISTINCT wo_number FROM engineering_work_orders WHERE current_status != 'completed'"
    ).all();
    woNumbers = rows.map(r => r.wo_number);
  }
  if (woNumbers.length === 0) {
    const cacheKey = '';
    return { response: { success: true, data: [] }, cacheKey };
  }

  const cacheKey = woNumbers.slice().sort().join(',');

    const workOrdersQuery = `
      query GetWorkOrders($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
        workOrders(pageSize: $pageSize, pageStart: $pageStart, filter: $filter) {
          totalRecords
          records {
            workOrderNumber
            status
            dueDate
            partstockNote
            part { partNumber }
            customer { name }
            partStockStatuses(pageSize: 20, pageStart: 0) {
              totalRecords
              records {
                material
                materialGrade
                partStockType
                psPONumberPlainText
                psETA
                psActualETA
                psActualQuantity
                psQuantityQrdered
                psSizeOrdered
                psSupplierPlainText
                roughStockHeight
                roughStockLength
                roughStockWidth
                stockRelatedOps
              }
            }
            ops(pageSize: 100, pageStart: 0) {
              records {
                operationNumber
                billOfMaterials(pageSize: 50, pageStart: 0) {
                  records {
                    poNumber
                    description
                    partNumber
                    orderNumber
                  }
                }
              }
            }
          }
        }
      }
    `;

    let allRecords = [];
    let pageStart = 0;
    const pageSize = 200;
    let hasMore = true;
    while (hasMore) {
      const data = await executeGraphQLQuery(workOrdersQuery, {
        pageSize,
        pageStart,
        filter: { workOrderNumber: woNumbers },
      });
      const records = data?.workOrders?.records ?? [];
      allRecords = allRecords.concat(records);
      if (records.length < pageSize) hasMore = false;
      else pageStart += pageSize;
    }

    function isRealPoNumber(val) {
      if (!val || typeof val !== 'string') return false;
      const t = val.trim();
      return /^\d+$/.test(t) || (t.length >= 2 && /^\d+[a-z]?$/i.test(t));
    }
    function isPartStockReleasedStatus(val) {
      if (!val || typeof val !== 'string') return false;
      const t = val.trim();
      if (isRealPoNumber(t)) return false; // numeric PO id = ordered, not "released"
      const s = t.toLowerCase();
      const releasedWords = ['requested', 'released', 'approved', 'ready to order', 'submitted', 'ready', 'for order', 'pending order'];
      const releasedColors = ['cyan', 'light blue', 'cyan (light blue)'];
      if (releasedWords.includes(s) || releasedColors.includes(s)) return true;
      if (s.includes('requested') || s.includes('released') || s.includes('approved')) return true;
      if (s.includes('cyan') || s.includes('light blue')) return true;
      // Proshop sometimes puts an ETA/due date (e.g. "2/27/2026") when released for order but no PO yet
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(t)) return true;
      return false;
    }

    const poIds = new Set();
    for (const wo of allRecords) {
      const statuses = wo.partStockStatuses?.records ?? [];
      for (const s of statuses) {
        const pn = s.psPONumberPlainText && String(s.psPONumberPlainText).trim();
        if (pn && isRealPoNumber(pn)) poIds.add(pn);
      }
      for (const op of wo.ops?.records ?? []) {
        for (const bom of op.billOfMaterials?.records ?? []) {
          const pn = bom.poNumber && String(bom.poNumber).trim();
          if (pn && !isBomStatusInsteadOfPo(pn)) poIds.add(pn);
        }
      }
    }

    function isBomStatusInsteadOfPo(poNumber) {
      const s = poNumber.trim().toLowerCase();
      return s === 'complete' || s === 'received' || s === 'closed' || s === 'fully released' || s === 'arrived' || s === 'in stock';
    }

    const poQuery = `
      query GetPO($id: String!) {
        purchaseOrder(id: $id) {
          id
          orderStatus
          poItems(pageSize: 100, pageStart: 0) {
            records {
              itemNumber
              description
              quantity
              costPer
              estimatedArrival
              receivedDate
              receivedQty
              releasedDate
              releasedQty
            }
          }
        }
      }
    `;

    const poMap = {};
    const poIdsArray = [...poIds];
    const PO_BATCH_SIZE = 4;
    const PO_BATCH_DELAY_MS = 400;
    for (let i = 0; i < poIdsArray.length; i += PO_BATCH_SIZE) {
      const batch = poIdsArray.slice(i, i + PO_BATCH_SIZE);
      await Promise.all(batch.map(async (id) => {
        try {
          const data = await executeGraphQLQuery(poQuery, { id });
          poMap[id] = data?.purchaseOrder ?? null;
        } catch (err) {
          cacheLog.error('proshop', 'material-status: failed to fetch PO', id, err.message);
          poMap[id] = null;
        }
      }));
      if (i + PO_BATCH_SIZE < poIdsArray.length) {
        await new Promise((r) => setTimeout(r, PO_BATCH_DELAY_MS));
      }
    }

    function findMatchingPoLine(po, stockLine) {
      if (!po?.poItems?.records?.length) return null;
      const withDesc = po.poItems.records.filter(item => item.description && String(item.description).trim());
      if (withDesc.length === 0) return null;
      const mat = (stockLine.material || '').trim();
      const grade = (stockLine.materialGrade || '').trim();
      const match = withDesc.find(item => {
        const d = String(item.description).toLowerCase();
        if (grade && d.includes(grade.toLowerCase())) return true;
        if (mat && mat !== '/na' && d.includes(mat.toLowerCase())) return true;
        return false;
      });
      return match || withDesc[0];
    }

    function poLineIsReceived(item) {
      if (!item) return false;
      if (item.receivedDate && String(item.receivedDate).trim()) return true;
      const qty = item.receivedQty;
      if (qty != null && Number(qty) > 0) return true;
      return false;
    }

    function findMatchingPoLineForBom(po, bomLine) {
      if (!po?.poItems?.records?.length) return null;
      const withDesc = po.poItems.records.filter(item => item.description && String(item.description).trim());
      if (withDesc.length === 0) return null;
      const partNum = (bomLine.partNumber || '').trim();
      const desc = (bomLine.description || '').trim();
      const match = withDesc.find(item => {
        const d = String(item.description).toLowerCase();
        if (partNum && d.includes(partNum.toLowerCase())) return true;
        if (desc && d.includes(desc.toLowerCase())) return true;
        return false;
      });
      return match || withDesc[0];
    }

    function buildDimensions(r) {
      const parts = [r.roughStockLength, r.roughStockWidth, r.roughStockHeight].filter(Boolean);
      return parts.length ? parts.map(p => String(p || '').trim()).join(' × ') : null;
    }

    const COMPLETED_STATUSES = ['Invoiced', 'Shipped', 'Complete', 'Completed', 'Closed'];

    const result = allRecords.map(wo => {
      const statuses = wo.partStockStatuses?.records ?? [];
      const stockDetails = statuses.map(s => {
        const poId = s.psPONumberPlainText ? String(s.psPONumberPlainText) : null;
        const po = poId ? poMap[poId] : null;
        const poLine = po && poId ? findMatchingPoLine(po, s) : null;
        return {
          material: s.material ?? null,
          materialGrade: s.materialGrade ?? null,
          stockType: s.partStockType ?? null,
          poNumber: poId,
          dueAtDock: poLine?.estimatedArrival ?? s.psETA ?? null,
          eta: s.psETA ?? null,
          actualArrived: s.psActualETA ?? null,
          receivedDate: poLine?.receivedDate ?? null,
          receivedQty: poLine?.receivedQty ?? null,
          quantityOrdered: s.psQuantityQrdered ?? null,
          sizeOrdered: s.psSizeOrdered ?? null,
          supplier: s.psSupplierPlainText ?? null,
          dimensions: buildDimensions(s),
        };
      });

      let materialStatus = 'unknown';
      if (COMPLETED_STATUSES.includes((wo.status || '').trim())) {
        materialStatus = 'arrived';
      } else if (stockDetails.some(sd => sd.receivedDate)) {
        materialStatus = 'arrived';
      } else if (stockDetails.some(sd => sd.actualArrived)) {
        materialStatus = 'arrived';
      } else if (stockDetails.some(sd => sd.poNumber && isRealPoNumber(sd.poNumber))) {
        materialStatus = 'ordered';
      } else if (stockDetails.some(sd => sd.poNumber && isPartStockReleasedStatus(sd.poNumber))) {
        materialStatus = 'requested';
      } else if (stockDetails.length > 0) {
        materialStatus = 'not-ordered';
      }

      const bomLines = [];
      for (const op of wo.ops?.records ?? []) {
        for (const bom of op.billOfMaterials?.records ?? []) {
          if (bom.poNumber && String(bom.poNumber).trim()) {
            bomLines.push({
              poNumber: String(bom.poNumber).trim(),
              description: bom.description ?? null,
              partNumber: bom.partNumber ?? null,
              orderNumber: bom.orderNumber ?? null,
            });
          }
        }
      }
      const bomPoNumbers = [...new Set(bomLines.map(b => b.poNumber))];
      const hasRealBomPos = bomPoNumbers.some(poId => !isBomStatusInsteadOfPo(poId));
      const allStockIsNa =
        stockDetails.length > 0 &&
        stockDetails.every(
          sd => !sd.material || String(sd.material).trim().toLowerCase() === '/na'
        );
      if (
        (materialStatus === 'not-ordered' && allStockIsNa && !hasRealBomPos) ||
        (materialStatus === 'unknown' && !hasRealBomPos)
      ) {
        materialStatus = 'not-applicable';
      }

      let bomOrdered = false;
      let bomArrived = false;
      const poStatusClosed = (status) => {
        const s = (status || '').trim().toLowerCase();
        return s === 'closed' || s === 'fully released' || s === 'received' || s === 'complete';
      };
      const checkBomArrived = () => {
        const allBomReceivedStrict = bomLines.every(bomLine => {
          if (isBomStatusInsteadOfPo(bomLine.poNumber)) return true;
          const po = poMap[bomLine.poNumber];
          const poLine = po ? findMatchingPoLineForBom(po, bomLine) : null;
          return poLine && poLineIsReceived(poLine);
        });
        const allBomPoHaveReceived =
          bomPoNumbers.length > 0 &&
          bomPoNumbers.every(poId => {
            if (isBomStatusInsteadOfPo(poId)) return true;
            const po = poMap[poId];
            if (!po) return false;
            if (poStatusClosed(po.orderStatus)) return true;
            if (!po.poItems?.records?.length) return false;
            return po.poItems.records.some(item => poLineIsReceived(item));
          });
        return allBomReceivedStrict || allBomPoHaveReceived;
      };

      if ((materialStatus === 'not-ordered' || materialStatus === 'unknown') && bomLines.length > 0) {
        materialStatus = 'ordered';
        bomOrdered = true;
        if (checkBomArrived()) {
          materialStatus = 'arrived';
          bomArrived = true;
        }
      } else if (materialStatus === 'ordered' && bomLines.length > 0) {
        if (checkBomArrived()) {
          materialStatus = 'arrived';
          bomOrdered = true;
          bomArrived = true;
        }
      }

      return {
        workOrderNumber: wo.workOrderNumber ?? '',
        status: wo.status ?? null,
        dueDate: wo.dueDate ?? null,
        partNumber: wo.part?.partNumber ?? null,
        customer: wo.customer?.name ?? null,
        partstockNote: wo.partstockNote ?? null,
        materialStatus,
        stockDetails,
        bomOrdered: bomOrdered || undefined,
        bomArrived: bomArrived || undefined,
        bomDetails: bomOrdered || bomArrived ? { poNumbers: bomPoNumbers, lines: bomLines } : undefined,
      };
    });

  const response = { success: true, data: result };
  return { response, cacheKey };
}

export async function warmMaterialStatusCache(db) {
  if (!db) {
    cacheLog.warn('proshop', 'warmMaterialStatusCache skipped: no db');
    return;
  }
  try {
    const { response } = await buildMaterialStatusResponse(db, null);
    setCache('material-status', response);
    cacheLog.info('proshop', 'Material status cache warmed');
  } catch (err) {
    if (isProshopRateLimitError(err)) {
      setCacheError('material-status', { reason: 'rate_limited', message: RATE_LIMIT_RESPONSE.message });
      cacheLog.warn('proshop', 'Material status warm rate limited (429/400), cache unchanged');
    } else {
      cacheLog.error('proshop', 'Material status warm failed:', err.message || err);
    }
    throw err;
  }
}

/**
 * Count of non-completed WOs with material status "arrived" (cache-only; never calls ProShop).
 * @param {object} _db - Unused; kept for API compatibility
 * @returns {Promise<number|null>} count, or null if no cache
 */
export async function getMaterialArrivedCount(_db) {
  const cached = getCacheData('material-status');
  if (!cached?.data || !Array.isArray(cached.data)) return null;
  return cached.data.filter((row) => row.materialStatus === 'arrived').length;
}

/**
 * GET /api/proshop/material-status
 * Returns cached material status only (never calls ProShop). Background job refreshes cache.
 * If client's woNumbers differ from cached key, we still return cache (best effort).
 */
router.get('/material-status', (req, res) => {
  const cached = getCacheData('material-status');
  if (cached) return res.json(cached);
  const err = getCacheError('material-status');
  if (err?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
  return res.status(200).json({ success: true, data: [] });
});

/**
 * Build open POs response (shared for route and cache warming).
 */
async function buildOpenPOsResponse() {
  const query = `
      query GetPurchaseOrders($pageSize: Int!, $pageStart: Int!) {
        purchaseOrders(pageSize: $pageSize, pageStart: $pageStart) {
          totalRecords
          records {
            id
            cost
            date
            orderStatus
            supplier {
              name
            }
          }
        }
      }
    `;

    // Fetch purchase orders (paginated)
    let allPOs = [];
    let pageSize = 200;
    let pageStart = 0;
    let hasMore = true;
    const MAX_PAGES = 20; // Limit to 4000 records max
    let pagesFetched = 0;

    while (hasMore && pagesFetched < MAX_PAGES) {
      const variables = { pageSize, pageStart };
      const data = await executeGraphQLQuery(query, variables);
      
      if (!data || !data.purchaseOrders || !data.purchaseOrders.records) {
        break;
      }

      const records = data.purchaseOrders.records;
      allPOs = allPOs.concat(records);
      pagesFetched++;

      if (records.length < pageSize) {
        hasMore = false;
      } else {
        pageStart += pageSize;
      }
    }

    // Filter for Rocket Supply and open status
    const openStatuses = ['Outstanding', 'Partially Released'];
    const filteredPOs = allPOs.filter(po => {
      // Check supplier name (case-insensitive)
      const supplier = po.supplier?.name || '';
      const supplierLower = supplier.toLowerCase();
      if (!supplierLower.includes('rocket')) {
        return false;
      }

      // Check status
      const status = po.orderStatus || '';
      return openStatuses.includes(status);
    });

    // Fetch detailed information for each PO including line items
    const detailedPOs = await Promise.all(
      filteredPOs.map(async (po) => {
        try {
          // Query individual PO with line items
          const detailQuery = `
            query GetPurchaseOrder($id: String!) {
              purchaseOrder(id: $id) {
                id
                cost
                date
                orderStatus
                poType
                supplier {
                  name
                }
                poItems(pageSize: 100, pageStart: 0) {
                  totalRecords
                  records {
                    description
                    quantity
                    costPer
                    total
                    itemNumber
                    orderNumber
                    statusStatus
                    statusQty
                    statusDate
                    releasedQty
                    releasedDate
                    releasedBy
                    receivedQty
                    receivedDate
                  }
                }
              }
            }
          `;
          
          const detailData = await executeGraphQLQuery(detailQuery, { id: po.id });
          const poData = detailData.purchaseOrder;
          
          // Process line items
          const lineItems = poData.poItems?.records || [];
          const processedLineItems = lineItems
            .filter(item => item.description && item.quantity) // Filter out empty items
            .map(item => ({
              description: item.description || '',
              quantity: item.quantity || '0',
              unitPrice: item.costPer || 0,
              totalPrice: item.total || (item.costPer && item.quantity ? parseFloat(item.costPer) * parseFloat(item.quantity) : 0),
              itemNumber: item.itemNumber || '',
              orderNumber: item.orderNumber || '',
              statusStatus: item.statusStatus || null,
              statusQty: item.statusQty || null,
              statusDate: item.statusDate || null,
              releasedQty: item.releasedQty || null,
              releasedDate: item.releasedDate || null,
              releasedBy: item.releasedBy || null,
              receivedQty: item.receivedQty || null,
              receivedDate: item.receivedDate || null,
            }));
          
          return {
            id: po.id,
            poNumber: po.id,
            cost: parseFloat(po.cost) || 0,
            date: po.date,
            orderStatus: po.orderStatus,
            poType: poData.poType || 'Unknown',
            supplier: po.supplier?.name || '',
            lineItems: processedLineItems.length > 0 ? processedLineItems : null,
          };
        } catch (err) {
          cacheLog.error('proshop', 'Error fetching details for PO', po.id, err);
          // Return basic info if detail query fails
          return {
            id: po.id,
            poNumber: po.id,
            cost: parseFloat(po.cost) || 0,
            date: po.date,
            orderStatus: po.orderStatus,
            poType: 'Unknown',
            supplier: po.supplier?.name || '',
            lineItems: null,
          };
        }
      })
    );

    // Sort by date (most recent first)
    detailedPOs.sort((a, b) => {
      const dateA = parseProshopDate(a.date);
      const dateB = parseProshopDate(b.date);
      if (!dateA || !dateB) return 0;
      return dateB.getTime() - dateA.getTime();
    });

  return { success: true, data: detailedPOs };
}

export async function warmOpenPOsCache() {
  try {
    const response = await buildOpenPOsResponse();
    setCache('open-pos', response);
    cacheLog.info('proshop', 'Open POs cache warmed');
  } catch (err) {
    if (isProshopRateLimitError(err)) {
      setCacheError('open-pos', { reason: 'rate_limited', message: RATE_LIMIT_RESPONSE.message });
      cacheLog.warn('proshop', 'Open POs warm rate limited (429/400), cache unchanged');
    } else {
      cacheLog.error('proshop', 'Open POs warm failed:', err.message || err);
    }
    throw err;
  }
}

/**
 * GET /api/proshop/open-pos
 * Returns cached open POs only (never calls ProShop). Background job refreshes cache.
 */
router.get('/open-pos', (req, res) => {
  const cached = getCacheData('open-pos');
  if (cached) return res.json(cached);
  const err = getCacheError('open-pos');
  if (err?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
  return res.status(200).json({ success: true, data: [] });
});

// --- NCR (Non-Conformance Reports) ---

const NCR_ASSIGNEE_NAMES = ['Damien', 'Alex', 'Thad', 'Rob'];

// Match NCR.py: nonConformanceReports takes only pageSize (no pageStart). Fetch all in one or more batches by size.
const NCR_COUNT_QUERY = `
  query GetNCRCount($pageSize: Int!) {
    nonConformanceReports(pageSize: $pageSize) {
      totalRecords
    }
  }
`;

// Exact shape from NCR.py: only pageSize, records. (partDescription optional - some APIs allow it on nested part.)
const NCR_LIST_QUERY = `
  query GetNCRs($pageSize: Int!) {
    nonConformanceReports(pageSize: $pageSize) {
      records {
        ncrRefNumber
        createdTime
        assignedToPlainText
        lastModifiedByPlainText
        notes
        status
        workOrderPlainText
        workOrder {
          workOrderNumber
          part { partNumber }
        }
      }
    }
  }
`;

/**
 * Parse ProShop createdTime. API returns compact ISO without colons, e.g. "2024-06-27T171127Z".
 * new Date() does not parse that; normalize to "2024-06-27T17:11:27Z" or parse manually.
 */
function parseNcrCreatedTime(dateStr) {
  if (dateStr == null || dateStr === '') return null;
  let normalized = dateStr;
  const compactMatch = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i);
  if (compactMatch) {
    normalized = `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}T${compactMatch[4]}:${compactMatch[5]}:${compactMatch[6]}Z`;
  }
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function getNcrCreatedTime(ncr) {
  const raw = ncr.createdTime ?? ncr.created_time ?? null;
  return parseNcrCreatedTime(raw);
}

function getYearStartEnd(year) {
  const y = year != null ? year : new Date().getFullYear();
  return {
    start: new Date(y, 0, 1, 0, 0, 0, 0),
    end: new Date(y, 11, 31, 23, 59, 59, 999),
  };
}

function getQuarterStartEnd(year, quarter) {
  const y = year != null ? year : new Date().getFullYear();
  const q = quarter != null ? quarter : Math.floor(new Date().getMonth() / 3) + 1;
  const startMonth = (q - 1) * 3;
  return {
    start: new Date(y, startMonth, 1, 0, 0, 0, 0),
    end: new Date(y, startMonth + 3, 0, 23, 59, 59, 999),
  };
}

function getMonthStartEnd(year, month) {
  const now = new Date();
  const y = year != null ? year : now.getFullYear();
  const m = month != null ? month : now.getMonth();
  return {
    start: new Date(y, m, 1, 0, 0, 0, 0),
    end: new Date(y, m + 1, 0, 23, 59, 59, 999),
  };
}

function getWeekStartEnd(date) {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay();
  const sundayOffset = day === 0 ? 0 : day;
  const start = new Date(d);
  start.setDate(d.getDate() - sundayOffset);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function matchNcrAssignee(assignedToPlainText) {
  if (!assignedToPlainText || typeof assignedToPlainText !== 'string') return null;
  const lower = assignedToPlainText.trim().toLowerCase();
  for (const name of NCR_ASSIGNEE_NAMES) {
    if (lower.includes(name.toLowerCase())) return name;
  }
  return null;
}

function normalizeNcrRecord(ncr) {
  const wo = ncr.workOrder ?? ncr.work_order;
  const part = wo?.part;
  let assignedToPlainText = ncr.assignedToPlainText ?? ncr.assigned_to_plain_text ?? null;
  if (assignedToPlainText != null && typeof assignedToPlainText === 'string') {
    const key = assignedToPlainText.trim();
    if (key && employeeIdToName[key]) {
      assignedToPlainText = employeeIdToName[key];
    }
  }
  return {
    ncrRefNumber: ncr.ncrRefNumber ?? ncr.ncr_ref_number ?? null,
    createdTime: ncr.createdTime ?? ncr.created_time ?? null,
    assignedToPlainText,
    notes: ncr.notes ?? null,
    status: ncr.status ?? null,
    workOrderNumber: wo?.workOrderNumber ?? wo?.work_order_number ?? ncr.workOrderPlainText ?? ncr.work_order_plain_text ?? null,
    partNumber: part?.partNumber ?? part?.part_number ?? null,
  };
}

// Max records to request in one call (ProShop accepts pageSize; cap to avoid huge responses).
const NCR_FETCH_CAP = 10000;

async function fetchAllNcrs(options = {}) {
  const { maxRecords = NCR_FETCH_CAP } = options;
  let totalRecords = 0;
  try {
    const countData = await executeGraphQLQuery(NCR_COUNT_QUERY, { pageSize: 1 });
    const raw = countData?.nonConformanceReports?.totalRecords;
    totalRecords = typeof raw === 'number' ? raw : parseInt(raw, 10) || 0;
  } catch (e) {
    cacheLog.warn('proshop', 'NCR count query failed, will try direct fetch:', e.message);
  }
  const pageSize = totalRecords > 0 ? Math.min(totalRecords, maxRecords) : maxRecords;
  const data = await executeGraphQLQuery(NCR_LIST_QUERY, { pageSize });
  const result = data?.nonConformanceReports;
  const records = Array.isArray(result?.records) ? result.records : [];
  return records.filter((ncr) => ncr && typeof ncr === 'object');
}

// NCR cache state in cacheStore: ncrs-all, ncrs-recent-10, ncrs-last24h, ncrs-by-assignee; error key 'ncrs'
const BY_ASSIGNEE_CACHE_TTL = 3 * 60 * 1000;
const NCR_RECENT_CACHE_TTL = 5 * 60 * 1000;
const NCR_LAST24H_CACHE_TTL = 5 * 60 * 1000;
const ALL_NCRS_CACHE_TTL = 5 * 60 * 1000;

/**
 * Get the shared "all NCRs" list. If cache is valid, return it. Otherwise fetch once from ProShop, fill cache, return.
 * @returns {Promise<object[]>} raw NCR records
 */
async function getSharedAllNcrs() {
  const now = Date.now();
  const entry = getCache('ncrs-all');
  if (entry?.data && entry.timestamp && (now - entry.timestamp) < ALL_NCRS_CACHE_TTL) {
    return entry.data;
  }
  const all = await fetchAllNcrs({ maxRecords: NCR_FETCH_CAP });
  setCache('ncrs-all', all);
  return all;
}

/**
 * GET /api/proshop/ncrs/recent
 * Returns cached recent NCRs only (never calls ProShop). Background job refreshes cache.
 */
router.get('/ncrs/recent', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
  const cached = getCacheData('ncrs-recent-' + limit);
  if (cached) return res.json(cached);
  if (getCacheError('ncrs')?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
  return res.status(200).json({ success: true, data: [] });
});

/**
 * GET /api/proshop/ncrs/last24h
 * Returns cached NCRs from last 24h only (never calls ProShop). Background job refreshes cache.
 */
router.get('/ncrs/last24h', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const cached = getCacheData('ncrs-last24h');
  if (cached) return res.json(cached);
  if (getCacheError('ncrs')?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
  return res.status(200).json({ success: true, data: [] });
});

/**
 * GET /api/proshop/ncrs/by-assignee
 * Returns cached NCRs by assignee only (never calls ProShop). Background job refreshes cache.
 */
router.get('/ncrs/by-assignee', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  const cached = getCacheData('ncrs-by-assignee');
  if (cached) return res.json(cached);
  if (getCacheError('ncrs')?.reason === 'rate_limited') return res.status(200).json(RATE_LIMIT_RESPONSE);
  return res.status(200).json({
    success: true,
    data: {
      byAssignee: {},
      allNcrsByAssignee: {},
    },
  });
});

/**
 * Warm the shared NCR cache (one fetch) and precompute recent, last24h, by-assignee caches.
 * Replaces separate warmNcrRecentCache, warmNcrLast24hCache, warmNcrByAssigneeCache.
 */
export async function warmSharedNcrCache() {
  try {
    const all = await getSharedAllNcrs();
      const now = Date.now();
      const limit = 10;
      const withDate = all.map((ncr) => ({ ncr, created: getNcrCreatedTime(ncr) }));
      withDate.sort((a, b) => {
        const ta = a.created ? a.created.getTime() : 0;
        const tb = b.created ? b.created.getTime() : 0;
        return tb - ta;
      });
      let slice = withDate.slice(0, limit).map((x) => normalizeNcrRecord(x.ncr));
      if (slice.length === 0 && all.length > 0) {
        slice = all.slice(0, limit).map((ncr) => normalizeNcrRecord(ncr));
      }
      setCache('ncrs-recent-10', { success: true, data: slice });
      const slice50 = withDate.slice(0, 50).map((x) => normalizeNcrRecord(x.ncr));
      setCache('ncrs-recent-50', { success: true, data: slice50.length ? slice50 : slice });

      const nowDate = new Date();
      const cutoff24h = new Date(nowDate.getTime() - 24 * 60 * 60 * 1000);
      const inWindow = withDate.filter((x) => x.created && x.created >= cutoff24h);
      inWindow.sort((a, b) => b.created.getTime() - a.created.getTime());
      const data24h = inWindow.map((x) => normalizeNcrRecord(x.ncr));
      setCache('ncrs-last24h', { success: true, data: data24h });

      const currentYear = new Date().getFullYear();
      const yearRange = getYearStartEnd(currentYear);
      const { start: qStart, end: qEnd } = getQuarterStartEnd();
      const { start: mStart, end: mEnd } = getMonthStartEnd();
      const { start: wStart, end: wEnd } = getWeekStartEnd();
      const byAssignee = {};
      const allNcrsByAssignee = {};
      for (const name of NCR_ASSIGNEE_NAMES) {
        byAssignee[name] = { year: 0, quarter: 0, month: 0, week: 0, monthlyAvg: 0, weeklyAvg: 0 };
        allNcrsByAssignee[name] = [];
      }
      for (const ncr of all) {
        const rawAssignee = ncr.assignedToPlainText ?? ncr.assigned_to_plain_text;
        const resolvedAssignee =
          rawAssignee && typeof rawAssignee === 'string' && employeeIdToName[rawAssignee.trim()]
            ? employeeIdToName[rawAssignee.trim()]
            : rawAssignee;
        const assignee = matchNcrAssignee(resolvedAssignee);
        if (!assignee) continue;
        const created = getNcrCreatedTime(ncr);
        if (!created) continue;
        const norm = normalizeNcrRecord(ncr);
        if (created >= yearRange.start && created <= yearRange.end) {
          byAssignee[assignee].year += 1;
          allNcrsByAssignee[assignee].push(norm);
        }
        if (created >= qStart && created <= qEnd) byAssignee[assignee].quarter += 1;
        if (created >= mStart && created <= mEnd) byAssignee[assignee].month += 1;
        if (created >= wStart && created <= wEnd) byAssignee[assignee].week += 1;
      }
      for (const name of NCR_ASSIGNEE_NAMES) {
        allNcrsByAssignee[name].sort((a, b) => {
          const ta = parseNcrCreatedTime(a.createdTime)?.getTime() ?? 0;
          const tb = parseNcrCreatedTime(b.createdTime)?.getTime() ?? 0;
          return tb - ta;
        });
        const y = byAssignee[name].year;
        byAssignee[name].monthlyAvg = Math.round((y / 12) * 100) / 100;
        byAssignee[name].weeklyAvg = Math.round((y / 52) * 100) / 100;
      }
      setCache('ncrs-by-assignee', {
        success: true,
        data: { byAssignee, allNcrsByAssignee },
      });
    clearCacheError('ncrs');
    cacheLog.info('proshop', 'Shared NCR cache warmed (recent, last24h, by-assignee)');
  } catch (err) {
    if (isProshopRateLimitError(err)) {
      setCacheError('ncrs', { reason: 'rate_limited', message: RATE_LIMIT_RESPONSE.message });
      cacheLog.warn('proshop', 'Shared NCR cache warm rate limited (429/400), cache unchanged');
    } else {
      cacheLog.error('proshop', 'Shared NCR cache warm failed:', err.message || err);
    }
    throw err;
  }
}

/**
 * Return total count of ALL NCRs created in the last 30 days (cache-only; never calls ProShop).
 * @returns {Promise<number|null>} count, or null if no cache
 */
export async function getNcrCountLast30Days() {
  const all = getCacheData('ncrs-all');
  if (!all || !Array.isArray(all)) return null;
  const now = new Date();
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const withDate = all.map((ncr) => ({ ncr, created: getNcrCreatedTime(ncr) }));
  const inWindow = withDate.filter((x) => x.created && x.created >= cutoff);
  return inWindow.length;
}

/**
 * POST /api/proshop/import-work-orders
 * 
 * Imports active work orders from Proshop API that have Engineering work center.
 * Updates existing work orders (matched by WO number) or creates new ones.
 */
router.post('/import-work-orders', async (req, res) => {
  try {
    const db = req.db;
    const now = new Date().toISOString();
    const report = {
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: []
    };

    // GraphQL query to fetch work orders with ops filtered by work center ENGINEERING.
    // Per PS-API-Schema.gql: WorkOrder.ops(filter: WorkOrderOperationFilter) returns operations;
    // WorkOrderOperationFilter has workCenter: [String]; WorkOrderOperation has workCenterPlainText.
    // We request ops with filter workCenter: ["ENGINEERING"] and keep only WOs that have at least one such op.
    const query = `
      query GetWorkOrders($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
        workOrders(pageSize: $pageSize, pageStart: $pageStart, filter: $filter) {
          totalRecords
          records {
            workOrderNumber
            status
            dueDate
            notes
            defaultRouting
            type
            class
            part {
              partNumber
            }
            customer {
              name
            }
            ops(filter: { workCenter: ["ENGINEERING"] }, pageSize: 50) {
              records {
                operationNumber
              }
            }
          }
        }
      }
    `;

    // Fetch work orders (paginated) with filter for Active status
    let allWorkOrders = [];
    let pageSize = 200;
    let pageStart = 0;
    let hasMore = true;
    const MAX_PAGES = 50; // Limit to 10,000 records max
    let pagesFetched = 0;

    while (hasMore && pagesFetched < MAX_PAGES) {
      // Filter for Active status work orders (Engineering work orders)
      const variables = { 
        pageSize, 
        pageStart,
        filter: {
          status: ['Active']
        }
      };
      let data;
      try {
        data = await executeGraphQLQuery(query, variables);
      } catch (queryError) {
        cacheLog.error('proshop', 'GraphQL query failed at page', pagesFetched + 1, queryError);
        // If it's the first page, fail completely; otherwise, continue with what we have
        if (pagesFetched === 0) {
          return res.status(500).json({
            success: false,
            error: `Failed to fetch work orders from Proshop API: ${queryError.message}`,
          });
        }
        // Break and process what we have so far
        break;
      }
      
      if (!data || !data.workOrders) {
        cacheLog.warn('proshop', 'Unexpected response structure at page', pagesFetched + 1);
        break;
      }

      const records = data.workOrders.records || [];
      // Keep only work orders that have at least one operation with work center ENGINEERING
      const engineeringOnly = records.filter(wo => (wo.ops?.records?.length ?? 0) > 0);
      allWorkOrders = allWorkOrders.concat(engineeringOnly);
      pagesFetched++;

      // Check if there are more pages
      if (records.length < pageSize) {
        hasMore = false;
      } else {
        pageStart += pageSize;
      }
    }

    cacheLog.info('proshop', 'Found', allWorkOrders.length, 'Active work orders with Ops; Work Center = ENGINEERING to import');
    cacheLog.info('proshop', 'Using filter: status: ["Active"] + ops.workCenter: ["ENGINEERING"]');

    // Fetch part descriptions via Part(partNumber).partDescription (API rejects "description" field)
    const rawPartNumbers = allWorkOrders.map(wo => wo.part?.partNumber).filter(Boolean);
    let partDescriptionMap = new Map();
    if (rawPartNumbers.length > 0) {
      try {
        partDescriptionMap = await fetchPartDescriptions(rawPartNumbers);
        const withDesc = [...partDescriptionMap.values()].filter(Boolean).length;
        if (withDesc > 0) cacheLog.info('proshop', 'Fetched part descriptions for', withDesc, 'parts');
      } catch (err) {
        cacheLog.warn('proshop', 'Part description fetch failed, using Unnamed for part names:', err.message);
      }
    }

    // Prepare SQL statements
    const insertStmt = db.prepare(`
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

    const updateStmt = db.prepare(`
      UPDATE engineering_work_orders SET
        priority = @priority,
        is_hot_job = @is_hot_job,
        due_date = @due_date,
        part_number = @part_number,
        part_name = @part_name,
        project = @project,
        qn = @qn,
        customer = @customer,
        price = @price,
        work_order_notes = @work_order_notes,
        updated_at = @updated_at,
        version = version + 1
      WHERE wo_number = @wo_number
    `);

    const checkExistsStmt = db.prepare('SELECT id, wo_number FROM engineering_work_orders WHERE wo_number = ?');

    if (allWorkOrders.length === 0) {
      cacheLog.info('proshop', 'No active Engineering work orders found to import');
      return res.json({
        success: true,
        data: {
          schedule: {
            imported: 0,
            updated: 0,
            skipped: 0,
            errors: []
          },
          revisions: { imported: 0 },
          construction: { imported: 0 }
        }
      });
    }

    // Process work orders in a transaction
    const importWorkOrders = db.transaction((workOrders) => {
      for (const wo of workOrders) {
        try {
            // Extract and validate required fields
            const woNumber = wo.workOrderNumber;
          if (!woNumber) {
            report.skipped++;
            report.errors.push({
              wo: 'unknown',
              error: 'Missing work order number'
            });
            continue;
          }

          const partNumber = wo.part?.partNumber || '';
          const partDesc = partDescriptionMap.get(partNumber);
          const partName = (partDesc && String(partDesc).trim()) ? String(partDesc).trim() : 'Unnamed';
          const customerName = wo.customer?.name || 'Unknown';

          // Transform part number
          const transformedPartNumber = partNumber 
            ? transformPartNumber(partNumber, customerName)
            : 'UNKNOWN';

          // Use abbreviation for customer field if available
          let customerValue = String(customerName);
          if (customerName && customerAbbrMap) {
            const customerUpper = customerName.trim().toUpperCase();
            const abbreviation = customerAbbrMap[customerUpper];
            if (abbreviation) {
              customerValue = abbreviation;
            }
          }

          // Priority not available from Proshop API, default to 0
          // Users can set priority manually after import
          const priority = 0;
          const isHotJob = 0;

          // Parse due date
          let dueDate = null;
          if (wo.dueDate) {
            if (wo.dueDate instanceof Date) {
              dueDate = wo.dueDate.toISOString().split('T')[0];
            } else if (typeof wo.dueDate === 'string') {
              // Try to parse various date formats
              const dateMatch = wo.dueDate.match(/(\d{4})-(\d{2})-(\d{2})/);
              if (dateMatch) {
                dueDate = wo.dueDate.split('T')[0]; // Extract date part if ISO string
              } else {
                // Try other formats
                const parsed = new Date(wo.dueDate);
                if (!isNaN(parsed.getTime())) {
                  dueDate = parsed.toISOString().split('T')[0];
                }
              }
            }
          }

          // Check if work order already exists
          const existing = checkExistsStmt.get(String(woNumber));

          if (existing) {
            // Update existing work order
            // Preserve user-edited fields: current_box, notes, comments, current_status, machine_scheduled
            updateStmt.run({
              wo_number: String(woNumber),
              priority: priority,
              is_hot_job: isHotJob,
              due_date: dueDate,
              part_number: transformedPartNumber,
              part_name: String(partName),
              project: null, // Project field not available in Proshop API
              qn: null, // Quote number not available in Proshop API
              customer: customerValue,
              price: null, // Price not available in Proshop API
              work_order_notes: stripHtml(wo.notes),
              updated_at: now
            });
            report.updated++;
          } else {
            // Create new work order
            insertStmt.run({
              id: uuidv4(),
              wo_number: String(woNumber),
              priority: priority,
              is_hot_job: isHotJob,
              due_date: dueDate,
              part_number: transformedPartNumber,
              rev_alert: null,
              part_name: String(partName),
              project: null, // Project field not available in Proshop API
              qn: null, // Quote number not available in Proshop API
              customer: customerValue,
              est_programming_hours: null,
              est_engineering_hours: null,
              price: null, // Price not available in Proshop API
              material_status: 'not-ordered',
              notes: null, // Engineering internal notes; Proshop notes go to work_order_notes
              work_order_notes: stripHtml(wo.notes),
              comments: '[]',
              current_box: null,
              machine_scheduled: null,
              current_status: 'engineering',
              metadata: '{}',
              created_at: now,
              updated_at: now
            });
            report.imported++;
          }
        } catch (rowErr) {
          cacheLog.error('proshop', 'Error processing work order', wo.workOrderNumber || 'unknown', rowErr);
          report.errors.push({
            wo: wo.workOrderNumber || 'unknown',
            error: rowErr.message
          });
        }
      }
    });

    try {
      importWorkOrders(allWorkOrders);
    } catch (transErr) {
      cacheLog.error('proshop', 'Database transaction failed:', transErr);
      return res.status(500).json({
        success: false,
        error: `Database error during import: ${transErr.message}. Partial import may have occurred.`,
        partialReport: report
      });
    }

    // Broadcast import event for SSE listeners
    eventBus.emit('import:completed', report);

    res.json({
      success: true,
      data: {
        schedule: {
          imported: report.imported,
          updated: report.updated,
          skipped: report.skipped,
          errors: report.errors
        },
        revisions: { imported: 0 },
        construction: { imported: 0 }
      }
    });
  } catch (error) {
    cacheLog.error('proshop', 'Error importing work orders:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to import work orders from Proshop API';
    if (error.message) {
      errorMessage = error.message;
    } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = 'Network error: Could not connect to Proshop API. Please check your network connection.';
    } else if (error.message && error.message.includes('authentication')) {
      errorMessage = 'Authentication failed: Invalid Proshop API credentials.';
    }
    
    res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
});

/**
 * GET /api/proshop/test-query
 * 
 * Test endpoint to try different GraphQL query structures.
 * Use ?fields= to specify which fields to try (comma-separated).
 * Example: /api/proshop/test-query?fields=workOrderNumber,status,dueDate
 */
router.get('/test-query', async (req, res) => {
  try {
    const fieldsParam = req.query.fields || 'workOrderNumber';
    const fields = fieldsParam.split(',').map(f => f.trim());
    
    // Build query dynamically based on requested fields
    const fieldSelections = fields.map(field => {
      // Handle nested fields
      if (field === 'part') {
        return `part { partNumber description }`;
      }
      if (field === 'customer') {
        return `customer { name }`;
      }
      return field;
    }).join('\n            ');

    const query = `
      query GetWorkOrders($pageSize: Int!, $pageStart: Int!) {
        workOrders(pageSize: $pageSize, pageStart: $pageStart) {
          totalRecords
          records {
            ${fieldSelections}
          }
        }
      }
    `;

    cacheLog.info('proshop', 'Testing query with fields:', fields);
    cacheLog.info('proshop', 'Query:', query);

    // Try the query
    const variables = { pageSize: 5, pageStart: 0 };
    let data;
    let error = null;
    
    try {
      data = await executeGraphQLQuery(query, variables);
    } catch (queryError) {
      error = queryError.message;
      cacheLog.error('proshop', 'Query failed:', queryError);
    }

    res.json({
      success: !error,
      fieldsTested: fields,
      query: query,
      error: error,
      result: data,
      sampleRecord: data?.workOrders?.records?.[0] || null,
      totalRecords: data?.workOrders?.totalRecords || 0,
      recordsReturned: data?.workOrders?.records?.length || 0
    });
  } catch (error) {
    cacheLog.error('proshop', 'Error in test query:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to test query',
      stack: error.stack
    });
  }
});

/**
 * Parse operation time string (e.g. totalCycleTime) to minutes; strip commas, treat null/non-numeric as 0.
 */
function parseOpMinutes(val) {
  return parseFloat(String(val || 0).replace(/,/g, '')) || 0;
}

/**
 * GET /api/proshop/cost-analysis
 * Query: woNumber (e.g. 26-0310)
 * Returns material cost from local DB and estimated total completion time (minutes) from Proshop (sum of ops totalCycleTime).
 */
router.get('/cost-analysis', async (req, res) => {
  try {
    const woNumber = req.query.woNumber ? String(req.query.woNumber).trim() : '';
    if (!woNumber) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid woNumber. Use ?woNumber=26-0310',
      });
    }

    const db = req.db;
    const data = {
      woNumber,
      materialCost: null,
      quotedPrice: null,
      costWithoutMaterial: null,
      pricePerHour: null,
      estimatedTotalMinutes: null,
      estimatedHours: null,
      partNumber: null,
      partName: null,
      customer: null,
    };

    // Material cost and WO metadata from local DB (exact, TRIM, LIKE, then normalized e.g. 26-0310 <-> 26-310)
    if (db) {
      let row = db.prepare(
        'SELECT price, part_number, part_name, customer FROM engineering_work_orders WHERE wo_number = ?'
      ).get(woNumber);
      if (!row) {
        row = db.prepare(
          'SELECT price, part_number, part_name, customer FROM engineering_work_orders WHERE TRIM(wo_number) = TRIM(?)'
        ).get(woNumber);
      }
      if (!row) {
        const likePattern = `%${woNumber.replace(/%/g, '')}%`;
        row = db.prepare(
          'SELECT price, part_number, part_name, customer FROM engineering_work_orders WHERE wo_number LIKE ? LIMIT 1'
        ).get(likePattern);
      }
      if (!row && /^\d+-\d+$/.test(woNumber)) {
        const [prefix, suffix] = woNumber.split('-');
        const suffixNoLeadingZeros = String(parseInt(suffix, 10));
        const alt1 = `${prefix}-${suffixNoLeadingZeros}`;
        const alt2 = `${prefix}-${suffix.padStart(4, '0')}`;
        row = db.prepare(
          'SELECT price, part_number, part_name, customer FROM engineering_work_orders WHERE wo_number = ? OR wo_number = ? LIMIT 1'
        ).get(alt1, alt2);
      }
      if (row) {
        data.materialCost = row.price != null ? Number(row.price) : null;
        data.partNumber = row.part_number ?? null;
        data.partName = row.part_name ?? null;
        data.customer = row.customer ?? null;
      }
    }

    const OPS_PAGE_SIZE = 100;
    const MAX_OPS_PAGES = 30; // 3000 ops max to avoid long timeouts
    let totalMinutes = 0;
    let woMeta = null;
    let resolvedWoNumber = null;
    let opsPageStart = 0;
    let hasMoreOps = true;
    let opsPagesFetched = 0;
    const poIds = new Set();

    function isRealPoNumber(val) {
      if (!val || typeof val !== 'string') return false;
      const t = val.trim();
      return /^\d+$/.test(t) || (t.length >= 2 && /^\d+[a-z]?$/i.test(t));
    }
    function isBomStatusInsteadOfPo(poNumber) {
      const s = String(poNumber).trim().toLowerCase();
      return s === 'complete' || s === 'received' || s === 'closed' || s === 'fully released' || s === 'arrived' || s === 'in stock';
    }
    function parseShareForWo(txt, woNum) {
      if (!txt || !woNum) return 0;
      const escaped = woNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped + '\\((\\d+)\\)', 'i');
      const m = String(txt).match(re);
      return m ? parseInt(m[1], 10) : 0;
    }

    // First request: get WO with part, customer, estWODollarAmount, hoursCurrentTarget, partStockStatuses, and first page of ops (with billOfMaterials for PO ids)
    const firstQuery = `
      query GetWorkOrderCostAnalysisFirst($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
        workOrders(pageSize: $pageSize, pageStart: $pageStart, filter: $filter) {
          records {
            workOrderNumber
            estWODollarAmount
            actualDollarAmount
            hoursCurrentTarget
            includeNewRevTargets
            part { partNumber }
            customer { name }
            customerPONumber { totalAmount partsOrdered(pageSize: 50, pageStart: 0) { records { lineWorkOrderPlainText orderedTotalDollars } } }
            partStockStatuses(pageSize: 100, pageStart: 0) { records { psPONumberPlainText } }
            ops(pageSize: ${OPS_PAGE_SIZE}, pageStart: 0) {
              totalRecords
              records { totalCycleTime billOfMaterials(pageSize: 50, pageStart: 0) { records { poNumber } } partOperation { estNRInspection estNRSetup } }
            }
          }
        }
      }
    `;
    let firstData;
    try {
      firstData = await executeGraphQLQuery(firstQuery, {
        pageSize: 1,
        pageStart: 0,
        filter: { workOrderNumber: [woNumber] },
      });
    } catch (queryError) {
      cacheLog.warn('proshop', 'cost-analysis: Proshop query failed, returning DB-only data:', queryError?.message);
      data.estimatedTotalMinutes = totalMinutes > 0 ? Math.round(totalMinutes) : null;
      data.estimatedHours = totalMinutes > 0 ? Math.round((totalMinutes / 60) * 100) / 100 : null;
      return res.json({ success: true, data });
    }

    const firstRecords = firstData?.workOrders?.records ?? [];
    if (firstRecords.length === 0) {
      return res.json({ success: true, data });
    }
    const firstWo = firstRecords[0];
    woMeta = firstWo;
    resolvedWoNumber = firstWo.workOrderNumber;
    // Estimated $ amount: prefer estWODollarAmount, then actualDollarAmount, then Customer PO line total for this WO, then Customer PO totalAmount
    if (firstWo.estWODollarAmount != null) {
      data.quotedPrice = Number(firstWo.estWODollarAmount);
    } else if (firstWo.actualDollarAmount != null) {
      data.quotedPrice = Number(firstWo.actualDollarAmount);
    } else if (firstWo.customerPONumber) {
      const custPO = firstWo.customerPONumber;
      const lines = custPO.partsOrdered?.records ?? [];
      const ourLine = lines.find((l) => (l.lineWorkOrderPlainText || '').includes(resolvedWoNumber));
      if (ourLine?.orderedTotalDollars != null && ourLine.orderedTotalDollars !== '') {
        const parsed = parseFloat(String(ourLine.orderedTotalDollars).replace(/,/g, ''));
        data.quotedPrice = !isNaN(parsed) ? parsed : null;
      } else if (custPO.totalAmount != null) {
        data.quotedPrice = Number(custPO.totalAmount);
      }
    }
    if (!data.partNumber && firstWo.part?.partNumber) data.partNumber = firstWo.part.partNumber;
    if (!data.customer && firstWo.customer?.name) data.customer = firstWo.customer.name;

    for (const s of firstWo.partStockStatuses?.records ?? []) {
      const pn = s.psPONumberPlainText && String(s.psPONumberPlainText).trim();
      if (pn && isRealPoNumber(pn)) poIds.add(pn);
    }
    const firstOps = firstWo.ops?.records ?? [];
    const totalOps = firstWo.ops?.totalRecords != null ? parseInt(firstWo.ops.totalRecords, 10) : 0;
    for (const op of firstOps) {
      totalMinutes += parseOpMinutes(op.totalCycleTime);
      for (const bom of op.billOfMaterials?.records ?? []) {
        const pn = bom.poNumber && String(bom.poNumber).trim();
        if (pn && !isBomStatusInsteadOfPo(pn) && isRealPoNumber(pn)) poIds.add(pn);
      }
    }
    opsPagesFetched = 1;
    opsPageStart = OPS_PAGE_SIZE;
    const hasTarget = (() => {
      const s = firstWo.hoursCurrentTarget != null ? String(firstWo.hoursCurrentTarget).trim().replace(/,/g, '') : '';
      const n = parseFloat(s);
      return !isNaN(n) && n > 0;
    })();
    hasMoreOps = !hasTarget && firstOps.length >= OPS_PAGE_SIZE && (totalOps === 0 || firstOps.length < totalOps);

    // Paginate remaining ops for totalCycleTime only when we don't have hoursCurrentTarget (avoids many ProShop calls)
    while (hasMoreOps && opsPagesFetched < MAX_OPS_PAGES) {
      const opsOnlyQuery = `
        query GetWorkOrderCostAnalysisOps($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
          workOrders(pageSize: $pageSize, pageStart: $pageStart, filter: $filter) {
            records {
              ops(pageSize: ${OPS_PAGE_SIZE}, pageStart: ${opsPageStart}) {
                totalRecords
                records { totalCycleTime }
              }
            }
          }
        }
      `;
      let opsData;
      try {
        opsData = await executeGraphQLQuery(opsOnlyQuery, {
          pageSize: 1,
          pageStart: 0,
          filter: { workOrderNumber: [woNumber] },
        });
      } catch (opsErr) {
        cacheLog.warn('proshop', 'cost-analysis: ops pagination failed:', opsErr?.message);
        break;
      }
      const recs = opsData?.workOrders?.records ?? [];
      if (recs.length === 0) break;
      const opsResult = recs[0].ops;
      const ops = opsResult?.records ?? [];
      for (const op of ops) totalMinutes += parseOpMinutes(op.totalCycleTime);
      opsPagesFetched++;
      const fetchedSoFar = opsPageStart + ops.length;
      hasMoreOps = ops.length >= OPS_PAGE_SIZE && (totalOps === 0 || fetchedSoFar < totalOps);
      opsPageStart += OPS_PAGE_SIZE;
    }

    // Fetch each PO and sum material cost for this WO from poItems (workOrderPlainText share parsing)
    const PO_BATCH_SIZE = 4;
    const PO_BATCH_DELAY_MS = 400;
    const poIdsArray = [...poIds];
    const poItemQuery = `
      query GetPOMaterial($id: String!) {
        purchaseOrder(id: $id) {
          id
          poItems(pageSize: 100, pageStart: 0) {
            records { workOrderPlainText costPer quantity total }
          }
        }
      }
    `;
    let proshopMaterialTotal = 0;
    for (let i = 0; i < poIdsArray.length; i += PO_BATCH_SIZE) {
      const batch = poIdsArray.slice(i, i + PO_BATCH_SIZE);
      await Promise.all(batch.map(async (id) => {
        try {
          const poRes = await executeGraphQLQuery(poItemQuery, { id });
          const po = poRes?.purchaseOrder;
          if (!po?.poItems?.records) return;
          for (const item of po.poItems.records) {
            const costPer = Number(item.costPer) || 0;
            const share = parseShareForWo(item.workOrderPlainText, resolvedWoNumber);
            proshopMaterialTotal += costPer * share;
          }
        } catch (err) {
          cacheLog.warn('proshop', 'cost-analysis: failed to fetch PO', id, err?.message);
        }
      }));
      if (i + PO_BATCH_SIZE < poIdsArray.length) {
        await new Promise((r) => setTimeout(r, PO_BATCH_DELAY_MS));
      }
    }
    if (proshopMaterialTotal > 0) {
      data.materialCost = Math.round(proshopMaterialTotal * 100) / 100;
    }

    // Prefer hoursCurrentTarget (ProShop target hours) for estimated minutes when present; else sum(ops.totalCycleTime)
    let estimatedMinutes = totalMinutes;
    const targetStr = firstWo.hoursCurrentTarget != null ? String(firstWo.hoursCurrentTarget).trim().replace(/,/g, '') : '';
    const targetNum = parseFloat(targetStr);
    if (!isNaN(targetNum) && targetNum > 0) {
      if (targetNum > 500) {
        estimatedMinutes = targetNum;
      } else {
        estimatedMinutes = targetNum * 60;
      }
    }
    // When Include New Rev Targets is false, ProShop shows recurring-only target. Subtract NR from ops when present; else apply observed ratio (26-0142: 4680/5370).
    const includeNewRev = firstWo.includeNewRevTargets === true;
    if (!includeNewRev && estimatedMinutes > 0) {
      let nrSumMinutes = 0;
      for (const op of firstWo.ops?.records ?? []) {
        const po = op.partOperation;
        if (po) {
          const nrInsp = parseFloat(String(po.estNRInspection || '').replace(/,/g, '')) || 0;
          const nrSetup = parseFloat(String(po.estNRSetup || '').replace(/,/g, '')) || 0;
          nrSumMinutes += nrInsp + nrSetup;
        }
      }
      if (nrSumMinutes > 0) {
        estimatedMinutes = Math.max(0, estimatedMinutes - nrSumMinutes);
      } else {
        estimatedMinutes = Math.round(estimatedMinutes * 4680 / 5370);
      }
    }
    if (estimatedMinutes > 0 || woMeta) {
      data.estimatedTotalMinutes = Math.round(estimatedMinutes);
      data.estimatedHours = Math.round((estimatedMinutes / 60) * 100) / 100;
    }

    // Cost without material = estimated amount − material cost (treat null/zero material as 0); price per hour = cost without material / hours
    const quoted = data.quotedPrice != null ? Number(data.quotedPrice) : null;
    const material = data.materialCost != null ? Number(data.materialCost) : 0;
    const hours = data.estimatedHours != null ? Number(data.estimatedHours) : null;
    if (quoted != null && !isNaN(quoted)) {
      const materialVal = typeof material === 'number' && !isNaN(material) ? material : 0;
      data.costWithoutMaterial = Math.round((quoted - materialVal) * 100) / 100;
      if (hours != null && !isNaN(hours) && hours > 0 && data.costWithoutMaterial != null) {
        data.pricePerHour = Math.round((data.costWithoutMaterial / hours) * 100) / 100;
      }
    }

    res.json({ success: true, data });
  } catch (error) {
    cacheLog.error('proshop', 'cost-analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to get cost analysis',
    });
  }
});

/**
 * GET /api/proshop/debug-work-orders
 * 
 * Debug endpoint to fetch raw work orders from Proshop and return as JSON
 * so we can inspect the structure and available fields.
 */
router.get('/debug-work-orders', async (req, res) => {
  try {
    // GraphQL query - using only tested working fields
    const query = `
      query GetWorkOrders($pageSize: Int!, $pageStart: Int!) {
        workOrders(pageSize: $pageSize, pageStart: $pageStart) {
          totalRecords
          records {
            workOrderNumber
            status
            dueDate
            notes
            part {
              partNumber
            }
            customer {
              name
            }
          }
        }
      }
    `;

    // Fetch first page only for debugging
    const variables = { pageSize: 10, pageStart: 0 };
    let data;
    try {
      data = await executeGraphQLQuery(query, variables);
    } catch (queryError) {
      cacheLog.error('proshop', 'GraphQL query failed:', queryError);
      return res.status(500).json({
        success: false,
        error: `Failed to fetch work orders from Proshop API: ${queryError.message}`,
        details: queryError
      });
    }

    if (!data || !data.workOrders) {
      return res.status(500).json({
        success: false,
        error: 'Unexpected response structure from Proshop API',
        response: data
      });
    }

      const records = data.workOrders.records || [];
      
      // Filter for active work orders (workCenter field not available)
      const activeWOs = records.filter(wo => {
        const status = wo.status || '';
        const statusLower = status.toLowerCase();
        return !statusLower.includes('completed') && 
               !statusLower.includes('cancelled') && 
               !statusLower.includes('closed');
      });

    res.json({
      success: true,
      data: {
        totalRecords: data.workOrders.totalRecords,
        recordsFetched: records.length,
        activeRecords: activeWOs.length,
        sampleRecords: records.slice(0, 5), // First 5 records
        activeSample: activeWOs.slice(0, 5), // First 5 active records
        allRecords: records, // All records for inspection
        rawResponse: data // Full response for debugging
      }
    });
  } catch (error) {
    cacheLog.error('proshop', 'Error in debug endpoint:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch work orders from Proshop API',
      stack: error.stack
    });
  }
});

/**
 * GET /api/proshop/export-work-orders-csv
 * 
 * Exports raw work orders from Proshop to CSV format for inspection.
 */
router.get('/export-work-orders-csv', async (req, res) => {
  try {
    // GraphQL query - using only tested working fields
    const query = `
      query GetWorkOrders($pageSize: Int!, $pageStart: Int!) {
        workOrders(pageSize: $pageSize, pageStart: $pageStart) {
          totalRecords
          records {
            workOrderNumber
            status
            dueDate
            notes
            part {
              partNumber
            }
            customer {
              name
            }
          }
        }
      }
    `;

    // Fetch work orders (paginated, but limit for CSV export)
    let allWorkOrders = [];
    let pageSize = 200;
    let pageStart = 0;
    let hasMore = true;
    const MAX_PAGES = 10; // Limit to 2000 records for CSV
    let pagesFetched = 0;

    while (hasMore && pagesFetched < MAX_PAGES) {
      const variables = { pageSize, pageStart };
      let data;
      try {
      data = await executeGraphQLQuery(query, variables);
      } catch (queryError) {
        cacheLog.error('proshop', 'GraphQL query failed at page', pagesFetched + 1, queryError);
        if (pagesFetched === 0) {
          return res.status(500).json({
            success: false,
            error: `Failed to fetch work orders: ${queryError.message}`,
          });
        }
        break;
      }
      
      if (!data || !data.workOrders) {
        break;
      }

      const records = data.workOrders.records || [];
      allWorkOrders = allWorkOrders.concat(records);
      pagesFetched++;

      if (records.length < pageSize) {
        hasMore = false;
      } else {
        pageStart += pageSize;
      }
    }

    // Convert to flat structure for CSV
    const csvData = allWorkOrders.map(wo => ({
      'Work Order Number': wo.workOrderNumber || '',
      'Status': wo.status || '',
      'Due Date': wo.dueDate || '',
      'Part Number': wo.part?.partNumber || '',
      'Customer Name': wo.customer?.name || '',
      'Notes': wo.notes || '',
    }));

    // Create CSV using XLSX
    const ws = XLSX.utils.json_to_sheet(csvData);
    const csv = XLSX.utils.sheet_to_csv(ws);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="Proshop_WorkOrders_${timestamp}.csv"`);
    res.send(csv);
  } catch (error) {
    cacheLog.error('proshop', 'Error exporting work orders to CSV:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export work orders to CSV',
    });
  }
});

export default router;

