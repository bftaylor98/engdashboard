import { Router } from 'express';
import { cacheLog } from '../lib/cacheLogger.js';

const router = Router();

const STOCK_GRID_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let stockGridCache = null;
let stockGridCacheTimestamp = null;

// Lazy load mssql to avoid breaking server startup if package isn't installed
let mssqlModule = null;
let mssqlLoadAttempted = false;

async function loadMssql() {
  if (mssqlLoadAttempted) {
    return mssqlModule;
  }
  mssqlLoadAttempted = true;
  try {
    const imported = await import('mssql');
    // mssql can be exported as default or named export
    mssqlModule = imported.default || imported;
    return mssqlModule;
  } catch (err) {
    console.warn('[stock-grid] mssql package not installed. Stock grid functionality will be disabled.');
    console.warn('[stock-grid] Install it with: npm install mssql');
    mssqlModule = null;
    return null;
  }
}

// EST100 Database Configuration (from .env)
const EST100_CONFIG = {
  server: process.env.EST100_SERVER || '192.168.1.36',
  database: process.env.EST100_DATABASE || 'EST100',
  user: process.env.EST100_USER || '',
  password: process.env.EST100_PASSWORD || '',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  requestTimeout: 30000,
  connectionTimeout: 10000,
};

// Matrix Vending main query - gets items with transactions and stock levels
const MATRIX_VENDING_QUERY = `
SELECT
    m.ITEM_DESCRIPTION,
    m.ITEM_CODE,
    m.ITEM_KEY,
    ISNULL(SUM(CASE 
        WHEN t.TRN_DATE >= @sinceDate 
            AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' 
                 OR tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' 
                 OR t.TRANSACTION_QTY < 0)
        THEN ABS(t.TRANSACTION_QTY) 
        ELSE 0 
    END), 0) AS TOTAL_VENDED,
    ISNULL(COUNT(DISTINCT CASE 
        WHEN t.TRN_DATE >= @sinceDate 
            AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' 
                 OR tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' 
                 OR t.TRANSACTION_QTY < 0)
        THEN t.TRANSACTION_KEY 
        ELSE NULL 
    END), 0) AS VEND_COUNT,
    ISNULL((SELECT SUM(s2.STOCK_QTY) 
            FROM dbo.ENT_STOCK_MANAGE_LEVEL s2 
            INNER JOIN dbo.ENT_BIN_MASTER b2 ON s2.BIN_KEY = b2.BIN_KEY
            WHERE s2.ITEM_KEY = m.ITEM_KEY 
              AND s2.BOOL_BITUL = 0
              AND b2.BIN_CODE IS NOT NULL), 0) AS STOCK_QTY,
    ISNULL((SELECT MAX(COALESCE(NULLIF(s2.MIN_QTY_OV, 0), s2.MIN_QTY_CALC, 0)) 
            FROM dbo.ENT_STOCK_MANAGE_LEVEL s2 
            WHERE s2.ITEM_KEY = m.ITEM_KEY 
              AND s2.BOOL_BITUL = 0), 0) AS MIN_QTY,
    ISNULL((SELECT MAX(COALESCE(NULLIF(s2.MAX_QTY_OV, 0), s2.MAX_QTY_CALC, 0)) 
            FROM dbo.ENT_STOCK_MANAGE_LEVEL s2 
            WHERE s2.ITEM_KEY = m.ITEM_KEY 
              AND s2.BOOL_BITUL = 0), 0) AS MAX_QTY,
    ISNULL((SELECT SUM(s2.ORDERED_QTY) 
            FROM dbo.ENT_STOCK_MANAGE_LEVEL s2 
            INNER JOIN dbo.ENT_BIN_MASTER b2 ON s2.BIN_KEY = b2.BIN_KEY
            WHERE s2.ITEM_KEY = m.ITEM_KEY 
              AND s2.BOOL_BITUL = 0
              AND b2.BIN_CODE IS NOT NULL), 0) AS ORDERED_QTY,
    m.ITEM_PRICE
FROM dbo.ENT_ITEM_MASTER m
LEFT JOIN dbo.ENT_TRANSACTION_LOG t ON m.ITEM_KEY = t.ITEM_KEY
LEFT JOIN dbo.TVL_TRANSACTION_TYPE tt ON t.TRANSACTION_TYPE_KEY = tt.TRANSACTION_TYPE_KEY
WHERE m.BOOL_BITUL = 0
GROUP BY m.ITEM_DESCRIPTION, m.ITEM_CODE, m.ITEM_KEY, m.ITEM_PRICE
HAVING ISNULL(COUNT(DISTINCT CASE 
    WHEN t.TRN_DATE >= @sinceDate 
        AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' 
             OR tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' 
             OR t.TRANSACTION_QTY < 0)
    THEN t.TRANSACTION_KEY 
    ELSE NULL 
END), 0) > 0
ORDER BY m.ITEM_DESCRIPTION
`;

// Monthly usage query for chart data
const MATRIX_VENDING_MONTHLY_QUERY = `
    SELECT
        YEAR(t.TRN_DATE) AS YEAR,
        MONTH(t.TRN_DATE) AS MONTH,
        SUM(ABS(t.TRANSACTION_QTY)) AS VENDED_QTY
    FROM dbo.ENT_TRANSACTION_LOG t
    LEFT JOIN dbo.TVL_TRANSACTION_TYPE tt ON t.TRANSACTION_TYPE_KEY = tt.TRANSACTION_TYPE_KEY
    WHERE t.ITEM_KEY = @itemKey
        AND t.TRN_DATE >= @sinceDate
        AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' OR tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' OR t.TRANSACTION_QTY < 0)
    GROUP BY YEAR(t.TRN_DATE), MONTH(t.TRN_DATE)
    ORDER BY YEAR(t.TRN_DATE), MONTH(t.TRN_DATE)
`;

const MONTH_ABBR = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Build complete monthly list from since_date to now, filling zeros for months with no data
 */
function buildMonthlyList(monthlyData, sinceDate) {
  const monthlyDict = {};
  for (const row of monthlyData) {
    const year = row.YEAR;
    const month = row.MONTH;
    const qty = parseFloat(row.VENDED_QTY) || 0.0;
    const key = `${year}-${String(month).padStart(2, '0')}`;
    monthlyDict[key] = qty;
  }

  const monthlyList = [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  let year = sinceDate.getFullYear();
  let month = sinceDate.getMonth() + 1;

  while (year < currentYear || (year === currentYear && month <= currentMonth)) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const qty = monthlyDict[key] || 0.0;

    const monthAbbr = MONTH_ABBR[month] || '';
    const yearAbbr = String(year).slice(-2);
    const monthLabel = `${monthAbbr}. ${yearAbbr}'`;

    monthlyList.push({
      month: monthLabel,
      monthSort: key,
      qty: qty,
    });

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return monthlyList;
}

/**
 * Calculate average monthly use and max usage
 */
function calculateStatistics(monthlyList) {
  const totalVendedPeriod = monthlyList.reduce((sum, m) => sum + m.qty, 0);
  const monthsInPeriod = monthlyList.length;
  const avgMonthlyUse = monthsInPeriod > 0 ? Math.ceil(totalVendedPeriod / monthsInPeriod) : 0;

  const maxUsage = Math.max(...monthlyList.map((m) => m.qty), 0);
  const maxUsageRounded = Math.ceil(maxUsage);

  return { avgMonthlyUse, maxUsage: maxUsageRounded };
}

/**
 * Fetch monthly data for an item
 */
async function fetchMonthlyData(mssql, pool, itemKey, sinceDate) {
  try {
    const result = await pool
      .request()
      .input('itemKey', mssql.Int, itemKey)
      .input('sinceDate', mssql.DateTime, sinceDate)
      .query(MATRIX_VENDING_MONTHLY_QUERY);

    return result.recordset;
  } catch (err) {
    cacheLog.error('stock-grid', 'Error fetching monthly data for item', itemKey, err);
    return [];
  }
}

/**
 * Build stock grid response (shared for route and cache warming).
 * Connects to EST100, runs Matrix Vending queries, returns response object.
 */
async function buildStockGridResponse() {
  const mssql = await loadMssql();
  if (!mssql) {
    throw new Error('mssql package not installed');
  }

  let pool;
  try {
    pool = new mssql.ConnectionPool(EST100_CONFIG);
    await pool.connect();
    const request = pool.request();

    const now = new Date();
    const sinceDate = new Date(now.getFullYear() - 3, 1, 1);

    const stockResult = await request.input('sinceDate', mssql.DateTime, sinceDate).query(MATRIX_VENDING_QUERY);
    const items = stockResult.recordset;

    if (!items || items.length === 0) {
      return {
        success: true,
        data: {
          items: [],
          summary: {
            totalItems: 0,
            totalBelowMinimum: 0,
            totalShortage: 0,
            totalCost: 0,
          },
          generatedAt: new Date().toISOString(),
        },
      };
    }

    const itemsWithData = [];
    let totalBelowMinimum = 0;
    let totalShortage = 0;
    let totalCost = 0;

    for (const item of items) {
      const itemDescription = String(item.ITEM_DESCRIPTION || '');
      const itemCode = String(item.ITEM_CODE || '');
      const itemKey = item.ITEM_KEY;
      const stockQty = parseFloat(item.STOCK_QTY) || 0.0;
      const minQty = parseFloat(item.MIN_QTY) || 0.0;
      const maxQty = parseFloat(item.MAX_QTY) || 0.0;
      const orderedQty = parseFloat(item.ORDERED_QTY) || 0.0;
      const itemPrice = parseFloat(item.ITEM_PRICE) || 0.0;

      const isBelowMinimum = minQty > 0 && stockQty < minQty && (orderedQty === null || orderedQty === 0);
      const shortage = isBelowMinimum ? minQty - stockQty : 0.0;
      const costToReplenish = shortage * itemPrice;

      if (isBelowMinimum) {
        totalBelowMinimum += 1;
        totalShortage += shortage;
        totalCost += costToReplenish;
      }

      const monthlyData = await fetchMonthlyData(mssql, pool, itemKey, sinceDate);
      const monthlyList = buildMonthlyList(monthlyData, sinceDate);
      const { avgMonthlyUse, maxUsage } = calculateStatistics(monthlyList);

      itemsWithData.push({
        itemDescription,
        itemCode,
        itemKey,
        stockQty,
        minQty,
        maxQty,
        shortage,
        isBelowMinimum,
        itemPrice,
        costToReplenish,
        monthlyData: monthlyList,
        avgMonthlyUse,
        maxUsage,
      });
    }

    return {
      success: true,
      data: {
        items: itemsWithData,
        summary: {
          totalItems: itemsWithData.length,
          totalBelowMinimum,
          totalShortage,
          totalCost,
        },
        generatedAt: new Date().toISOString(),
      },
    };
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (closeErr) {
        cacheLog.error('stock-grid', 'Error closing connection:', closeErr);
      }
    }
  }
}

export function warmStockGridCache() {
  buildStockGridResponse()
    .then((response) => {
      stockGridCache = response;
      stockGridCacheTimestamp = Date.now();
      cacheLog.info('stock-grid', 'Cache warmed');
    })
    .catch((err) => {
      cacheLog.error('stock-grid', 'Warm failed:', err.message || err);
    });
}

// GET /api/stock-grid
router.get('/', async (req, res) => {
  const mssql = await loadMssql();
  if (!mssql) {
    return res.status(503).json({
      success: false,
      error: 'mssql package not installed. Please run: npm install mssql',
    });
  }

  const now = Date.now();
  if (stockGridCache && stockGridCacheTimestamp && (now - stockGridCacheTimestamp) < STOCK_GRID_CACHE_TTL) {
    return res.json(stockGridCache);
  }

  try {
    const response = await buildStockGridResponse();
    stockGridCache = response;
    stockGridCacheTimestamp = now;
    res.json(response);
  } catch (err) {
    cacheLog.error('stock-grid', 'Error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to fetch stock grid data',
    });
  }
});

export default router;
