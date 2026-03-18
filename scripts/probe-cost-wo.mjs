/**
 * Probe cost analysis for a single work order. Same logic as GET /api/proshop/cost-analysis.
 * Usage: node scripts/probe-cost-wo.mjs 26-0298
 */
import { getProshopToken, executeGraphQLQuery } from '../server/lib/proshopClient.js';

const woNumber = process.argv[2] || '26-0298';

function parseOpMinutes(val) {
  return parseFloat(String(val || 0).replace(/,/g, '')) || 0;
}
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

async function main() {
  console.log('Cost analysis for WO', woNumber, '\n');
  const token = await getProshopToken();

  const firstQuery = `
    query GetWorkOrderCostAnalysisFirst($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
      workOrders(pageSize: $pageSize, pageStart: $pageStart, filter: $filter) {
        records {
          workOrderNumber
          quantityOrdered
          estWODollarAmount
          actualDollarAmount
          hoursCurrentTarget
          includeNewRevTargets
          hoursTotalSpent
          hoursSpentTargetDifference
          laborRunTimePerPartPlannedTarget
          part { partNumber }
          customer { name }
          customerPONumber { totalAmount partsOrdered(pageSize: 50, pageStart: 0) { records { lineWorkOrderPlainText orderedTotalDollars } } }
          partStockStatuses(pageSize: 100, pageStart: 0) { records { psPONumberPlainText } }
          ops(pageSize: 200, pageStart: 0) {
            totalRecords
            records {
              totalCycleTime
              partOperation { estSetupMinutes estMinutesPerPart estNRInspection estNRSetup }
              billOfMaterials(pageSize: 50, pageStart: 0) { records { poNumber } }
            }
          }
        }
      }
    }
  `;
  const firstData = await executeGraphQLQuery(firstQuery, {
    pageSize: 1,
    pageStart: 0,
    filter: { workOrderNumber: [woNumber] },
  }, token);

  const records = firstData?.workOrders?.records ?? [];
  if (records.length === 0) {
    console.log('No work order found for', woNumber);
    return;
  }

  const wo = records[0];
  const resolvedWoNumber = wo.workOrderNumber;
  const poIds = new Set();
  for (const s of wo.partStockStatuses?.records ?? []) {
    const pn = s.psPONumberPlainText && String(s.psPONumberPlainText).trim();
    if (pn && isRealPoNumber(pn)) poIds.add(pn);
  }
  for (const op of wo.ops?.records ?? []) {
    for (const bom of op.billOfMaterials?.records ?? []) {
      const pn = bom.poNumber && String(bom.poNumber).trim();
      if (pn && !isBomStatusInsteadOfPo(pn) && isRealPoNumber(pn)) poIds.add(pn);
    }
  }

  let totalCycleMinutes = 0;
  let estimatedMinutesFromPartOp = 0;
  const qty = Math.max(1, parseInt(wo.quantityOrdered, 10) || 1);
  const opsList = wo.ops?.records ?? [];
  for (const op of opsList) {
    totalCycleMinutes += parseOpMinutes(op.totalCycleTime);
    const po = op.partOperation;
    if (po) {
      const setup = parseFloat(po.estSetupMinutes) || 0;
      const perPart = parseInt(po.estMinutesPerPart, 10) || 0;
      estimatedMinutesFromPartOp += setup + perPart * qty;
    }
  }
  const totalOps = wo.ops?.totalRecords != null ? parseInt(wo.ops.totalRecords, 10) : opsList.length;
  const needMoreOpsPages = totalOps > 200;
  if (needMoreOpsPages) {
    let pageStart = 200;
    while (pageStart < totalOps) {
      const nextQuery = `
        query GetOpsPage($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
          workOrders(pageSize: 1, pageStart: 0, filter: $filter) {
            records {
              ops(pageSize: 200, pageStart: ${pageStart}) {
                records { totalCycleTime partOperation { estSetupMinutes estMinutesPerPart } }
              }
            }
          }
        }
      `;
      const nextData = await executeGraphQLQuery(nextQuery, { pageSize: 1, pageStart: 0, filter: { workOrderNumber: [woNumber] } }, token);
      const nextOps = nextData?.workOrders?.records?.[0]?.ops?.records ?? [];
      for (const op of nextOps) {
        totalCycleMinutes += parseOpMinutes(op.totalCycleTime);
        const po = op.partOperation;
        if (po) {
          const setup = parseFloat(po.estSetupMinutes) || 0;
          const perPart = parseInt(po.estMinutesPerPart, 10) || 0;
          estimatedMinutesFromPartOp += setup + perPart * qty;
        }
      }
      pageStart += 200;
      if (nextOps.length < 200) break;
    }
  }

  console.log('--- Work order ---');
  console.log('workOrderNumber:', resolvedWoNumber);
  console.log('quantityOrdered:', wo.quantityOrdered ?? '—');
  console.log('part.partNumber:', wo.part?.partNumber ?? '—');
  console.log('customer.name:', wo.customer?.name ?? '—');
  console.log('estWODollarAmount:', wo.estWODollarAmount ?? '—');
  console.log('actualDollarAmount:', wo.actualDollarAmount ?? '—');
  if (wo.customerPONumber) {
    console.log('customerPONumber.totalAmount:', wo.customerPONumber.totalAmount ?? '—');
    const ourLine = (wo.customerPONumber.partsOrdered?.records ?? []).find((l) => (l.lineWorkOrderPlainText || '').includes(wo.workOrderNumber));
    console.log('Customer PO line for this WO orderedTotalDollars:', ourLine?.orderedTotalDollars ?? '—');
  }
  console.log('hoursCurrentTarget:', wo.hoursCurrentTarget ?? '—');
  console.log('hoursTotalSpent:', wo.hoursTotalSpent ?? '—');
  console.log('hoursSpentTargetDifference:', wo.hoursSpentTargetDifference ?? '—');
  console.log('laborRunTimePerPartPlannedTarget:', wo.laborRunTimePerPartPlannedTarget ?? '—');
  console.log('estimatedTotalMinutes (from totalCycleTime):', Math.round(totalCycleMinutes));
  console.log('estimatedTotalMinutes (from partOperation estSetup+estMinPerPart*qty):', Math.round(estimatedMinutesFromPartOp));
  console.log('PO ids from partStockStatuses + BOM:', [...poIds].join(', ') || 'none');

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
  let materialCost = 0;
  for (const id of poIds) {
    try {
      const res = await executeGraphQLQuery(poItemQuery, { id }, token);
      const po = res?.purchaseOrder;
      if (!po?.poItems?.records) continue;
      for (const item of po.poItems.records) {
        const costPer = Number(item.costPer) || 0;
        const share = parseShareForWo(item.workOrderPlainText, resolvedWoNumber);
        const lineTotal = costPer * share;
        if (lineTotal > 0) {
          console.log('  PO', id, 'line:', item.workOrderPlainText?.slice(0, 60), 'costPer:', item.costPer, 'share:', share, '=>', lineTotal.toFixed(2));
        }
        materialCost += lineTotal;
      }
    } catch (err) {
      console.warn('  PO', id, 'failed:', err?.message);
    }
  }

  // Prefer hoursCurrentTarget (ProShop "target" hours) -> convert to minutes; else partOperation sum; else totalCycleTime
  let estimatedMinutesFromTarget = 0;
  const targetStr = wo.hoursCurrentTarget != null ? String(wo.hoursCurrentTarget).trim().replace(/,/g, '') : '';
  const targetNum = parseFloat(targetStr);
  if (!isNaN(targetNum) && targetNum > 0) {
    if (targetNum > 500) {
      estimatedMinutesFromTarget = targetNum;
    } else {
      estimatedMinutesFromTarget = targetNum * 60;
    }
  }
  // When Include New Rev Targets is false, use recurring-only: subtract NR from ops or apply ratio 4680/5370
  if (wo.includeNewRevTargets !== true && estimatedMinutesFromTarget > 0) {
    let nrSum = 0;
    for (const op of wo.ops?.records ?? []) {
      const po = op.partOperation;
      if (po) {
        nrSum += (parseFloat(String(po.estNRInspection || '').replace(/,/g, '')) || 0) + (parseFloat(String(po.estNRSetup || '').replace(/,/g, '')) || 0);
      }
    }
    estimatedMinutesFromTarget = nrSum > 0 ? Math.max(0, estimatedMinutesFromTarget - nrSum) : Math.round(estimatedMinutesFromTarget * 4680 / 5370);
  }
  const useEstFromPartOp = estimatedMinutesFromPartOp > 0;
  const useEstFromTarget = estimatedMinutesFromTarget > 0;
  const finalMinutes = useEstFromTarget
    ? estimatedMinutesFromTarget
    : useEstFromPartOp
      ? estimatedMinutesFromPartOp
      : totalCycleMinutes;

  let resolvedQuoted = wo.estWODollarAmount != null ? Number(wo.estWODollarAmount) : wo.actualDollarAmount != null ? Number(wo.actualDollarAmount) : null;
  if (resolvedQuoted == null && wo.customerPONumber) {
    const ourLine = (wo.customerPONumber.partsOrdered?.records ?? []).find((l) => (l.lineWorkOrderPlainText || '').includes(wo.workOrderNumber));
    if (ourLine?.orderedTotalDollars != null && ourLine.orderedTotalDollars !== '') {
      const parsed = parseFloat(String(ourLine.orderedTotalDollars).replace(/,/g, ''));
      resolvedQuoted = !isNaN(parsed) ? parsed : null;
    }
    if (resolvedQuoted == null && wo.customerPONumber.totalAmount != null) resolvedQuoted = Number(wo.customerPONumber.totalAmount);
  }

  console.log('\n--- Result (same as Cost Analysis page) ---');
  console.log('materialCost:', materialCost > 0 ? '$' + (Math.round(materialCost * 100) / 100).toFixed(2) : '—');
  console.log('quotedPrice (estimated $ amount):', resolvedQuoted != null ? '$' + resolvedQuoted.toFixed(2) : '—');
  console.log('partNumber:', wo.part?.partNumber ?? '—');
  console.log('customer:', wo.customer?.name ?? '—');
  console.log('estimatedTotalMinutes:', Math.round(finalMinutes), useEstFromTarget ? '(from hoursCurrentTarget)' : useEstFromPartOp ? '(from partOperation estimate)' : '(from totalCycleTime)');
  console.log('estimatedHours:', (finalMinutes / 60).toFixed(2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
