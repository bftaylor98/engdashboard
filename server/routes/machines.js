import express from 'express';
import { getProshopToken, executeGraphQLQuery, isProshopRateLimitError } from '../lib/proshopClient.js';
import { cacheLog } from '../lib/cacheLogger.js';

const router = express.Router();

const RATE_LIMIT_RESPONSE = {
  error: true,
  reason: 'rate_limited',
  message: 'ProShop temporarily unavailable.',
};

const MACHINE_KEYS = ['VMX 84-1', 'VMX 64-1', 'VMX 64-2'];

/**
 * Normalize work center to one of the three machine keys.
 * ProShop returns workCenter.commonName e.g. "Hurco VMX 64-1". Match case-insensitive
 * for VMX 84-1, VMX 64-1, VMX 64-2 and strip "Hurco " prefix so keys are VMX 84-1, VMX 64-1, VMX 64-2.
 */
function matchMachineKey(op) {
  const commonName = op?.workCenter?.commonName;
  if (!commonName || typeof commonName !== 'string') return null;
  const wc = commonName.trim().toLowerCase();
  if (wc.includes('vmx 84-1')) return 'VMX 84-1';
  if (wc.includes('vmx 64-1')) return 'VMX 64-1';
  if (wc.includes('vmx 64-2')) return 'VMX 64-2';
  return null;
}

/**
 * Remaining hours for one op. Time fields are Strings; parse with parseFloat, treat null/non-numeric as 0.
 * Estimated = totalCycleTime/60 (minutes to hours). Completed = (setupTimeSpent + runTimeSpent)/60.
 * Remaining = max(0, estimated - completed) rounded to 2 decimals.
 */
function opRemainingHours(op) {
  const estimatedMinutes = parseFloat(String(op.totalCycleTime || 0).replace(/,/g, '')) || 0;
  const completedMinutes = (parseFloat(String(op.setupTimeSpent || 0).replace(/,/g, '')) || 0) +
    (parseFloat(String(op.runTimeSpent || 0).replace(/,/g, '')) || 0);
  const estimatedHours = estimatedMinutes / 60;
  const completedHours = completedMinutes / 60;
  const remaining = Math.max(0, estimatedHours - completedHours);
  return Math.round(remaining * 100) / 100;
}

let machinesCache = null;
let machinesLastError = null;

function emptyMachinesData() {
  return {
    success: true,
    data: { 'VMX 84-1': [], 'VMX 64-1': [], 'VMX 64-2': [] },
    lastUpdated: new Date().toISOString(),
  };
}

/** Only include ops that are not complete and match one of the three machines. */
function isIncompleteOpForMachine(op, key) {
  if (op.isOpComplete === true) return false;
  return matchMachineKey(op) === key;
}

/**
 * Build machines response from ProShop only. Query all active WOs, filter to ops where
 * isOpComplete is false and workCenter.commonName contains one of the three machine names.
 */
export async function buildMachinesResponse() {
  cacheLog.info('machines', 'buildMachinesResponse started');
  cacheLog.info('machines', 'fetching ProShop token...');
  let token;
  try {
    token = await Promise.race([
      getProshopToken(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getProshopToken timed out after 30s')), 30000)
      )
    ]);
  } catch (err) {
    cacheLog.error('machines', 'Token fetch failed:', err.message);
    throw err;
  }
  cacheLog.info('machines', 'token acquired, starting pagination...');
  const query = `
    query GetWorkOrdersForMachines($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
      workOrders(pageSize: $pageSize, pageStart: $pageStart, filter: $filter) {
        totalRecords
        records {
          workOrderNumber
          status
          dueDate
          part { partNumber }
          customer { name }
          ops(pageSize: 50, pageStart: 0) {
            records {
              operationNumber
              workCenter { commonName }
              workCenterPlainText
              isOpComplete
              scheduledStartDate
              scheduledEndDate
              setupTime
              runTime
              totalCycleTime
              setupTimeSpent
              runTimeSpent
            }
          }
        }
      }
    }
  `;

  let allWorkOrders = [];
  const pageSize = 200;
  let pageStart = 0;
  let hasMore = true;
  const MAX_PAGES = 20;
  let pagesFetched = 0;

  try {
    cacheLog.info('machines', 'starting pagination loop...');
    while (hasMore && pagesFetched < MAX_PAGES) {
      cacheLog.info('machines', 'fetching page', pagesFetched + 1, '(pageStart', pageStart, ')...');
      const data = await executeGraphQLQuery(query, {
        pageSize,
        pageStart,
        filter: { status: ['Active'] },
      }, token);
      cacheLog.info('machines', 'page', pagesFetched + 1, 'returned', data?.workOrders?.records?.length ?? 'null', 'records');

      if (!data?.workOrders?.records) break;

      const records = data.workOrders.records;
      const withIncompleteVmcOps = records.filter((wo) => {
        const ops = wo.ops?.records ?? [];
        return ops.some((op) => {
          const key = matchMachineKey(op);
          return key && op.isOpComplete !== true;
        });
      });
      allWorkOrders = allWorkOrders.concat(withIncompleteVmcOps);
      pagesFetched++;

      if (records.length < pageSize) hasMore = false;
      else pageStart += pageSize;
    }
    cacheLog.info('machines', 'pagination complete, total records:', allWorkOrders.length);
  } catch (err) {
    cacheLog.error('machines', 'Error inside buildMachinesResponse:', err.message, err.stack);
    throw err;
  }

  const byMachine = { 'VMX 84-1': [], 'VMX 64-1': [], 'VMX 64-2': [] };

  for (const wo of allWorkOrders) {
    const ops = wo.ops?.records ?? [];
    const partNumber = wo.part?.partNumber ?? '';
    const customer = wo.customer?.name ?? '';
    const dueDate = wo.dueDate ?? null;

    for (const key of MACHINE_KEYS) {
      const matchingOps = ops.filter((op) => isIncompleteOpForMachine(op, key));
      if (matchingOps.length === 0) continue;

      let totalEstimatedHours = 0;
      for (const op of matchingOps) {
        totalEstimatedHours += opRemainingHours(op);
      }
      totalEstimatedHours = Math.round(totalEstimatedHours * 100) / 100;

      const firstOp = matchingOps[0];
      const scheduledStartDate = firstOp?.scheduledStartDate ?? null;

      byMachine[key].push({
        workOrderNumber: wo.workOrderNumber,
        partNumber,
        customer,
        dueDate,
        scheduledStartDate,
        scheduledOps: matchingOps.map((op) => ({
          operationNumber: op.operationNumber,
          workCenter: op.workCenter?.commonName ?? null,
          workCenterPlainText: op.workCenterPlainText ?? null,
          isOpComplete: op.isOpComplete,
          scheduledStartDate: op.scheduledStartDate,
          scheduledEndDate: op.scheduledEndDate,
          estimatedSetupTime: op.setupTime,
          estimatedRunTime: op.runTime,
          estimatedTotalTime: op.totalCycleTime,
          completedTime: op.runTimeSpent != null || op.setupTimeSpent != null
            ? { setupTimeSpent: op.setupTimeSpent, runTimeSpent: op.runTimeSpent }
            : null,
        })),
        totalEstimatedHours,
      });
    }
  }

  for (const key of MACHINE_KEYS) {
    byMachine[key].sort((a, b) => {
      const aStart = a.scheduledStartDate ? new Date(a.scheduledStartDate).getTime() : null;
      const bStart = b.scheduledStartDate ? new Date(b.scheduledStartDate).getTime() : null;
      if (aStart == null && bStart == null) {
        const aDue = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
        const bDue = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
        return aDue - bDue;
      }
      if (aStart == null) return 1;
      if (bStart == null) return -1;
      return aStart - bStart;
    });
  }

  return {
    success: true,
    data: byMachine,
    lastUpdated: new Date().toISOString(),
  };
}

export function warmMachinesCache() {
  cacheLog.info('machines', 'warmMachinesCache called');
  buildMachinesResponse()
    .then((response) => {
      machinesCache = response;
      machinesLastError = null;
      cacheLog.info('machines', 'Machines cache warmed');
    })
    .catch((err) => {
      cacheLog.error('machines', 'buildMachinesResponse FAILED:', err.message);
      cacheLog.error('machines', err.stack);
      if (isProshopRateLimitError(err)) {
        machinesLastError = { reason: 'rate_limited', message: 'ProShop temporarily unavailable.' };
      }
    });
}

router.get('/', (req, res) => {
  if (machinesCache) {
    return res.json(machinesCache);
  }
  if (machinesLastError?.reason === 'rate_limited') {
    return res.status(200).json(RATE_LIMIT_RESPONSE);
  }
  return res.status(200).json({ success: true, data: null });
});

export default router;
