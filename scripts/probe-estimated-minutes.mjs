/**
 * Scratch: find source of 4680 estimated minutes for WO 26-0142.
 * Current: hoursCurrentTarget 89.5 -> 5370 min. User sees 4680 in ProShop.
 * Run: node scripts/probe-estimated-minutes.mjs 26-0142
 */
import { getProshopToken, executeGraphQLQuery } from '../server/lib/proshopClient.js';

const woNumber = process.argv[2] || '26-0142';

async function main() {
  const token = await getProshopToken();

  const q = `
    query($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
      workOrders(pageSize: $pageSize, pageStart: $pageStart, filter: $filter) {
        records {
          workOrderNumber
          quantityOrdered
          part { partNumber }
          hoursCurrentTarget
          hoursTotalSpent
          hoursSpentTargetDifference
          includeNewRevTargets
          laborRunTimePerPartPlannedTarget
          runningTimeHoursPlannedTargetLabor
          setupTimeHoursPlannedTarget
          ops(pageSize: 200, pageStart: 0) {
            totalRecords
            records {
              operationNumber
              totalCycleTime
              partOperation { estSetupMinutes estMinutesPerPart estNRInspection estNRSetup }
            }
          }
        }
      }
    }
  `;
  const data = await executeGraphQLQuery(q, {
    pageSize: 1,
    pageStart: 0,
    filter: { workOrderNumber: [woNumber] },
  }, token);

  const wo = data?.workOrders?.records?.[0];
  if (!wo) {
    console.log('WO not found');
    return;
  }

  const qty = Math.max(1, parseInt(wo.quantityOrdered, 10) || 1);
  console.log('WO:', wo.workOrderNumber, 'quantityOrdered:', wo.quantityOrdered);
  console.log('includeNewRevTargets:', wo.includeNewRevTargets);
  const raw = wo.hoursCurrentTarget;
  console.log('hoursCurrentTarget (raw):', JSON.stringify(raw), 'type:', typeof raw);
  const cleaned = raw != null ? String(raw).replace(/,/g, '').trim() : '';
  const num = parseFloat(cleaned);
  console.log('parsed number:', num);
  const asMinutes = !isNaN(num) ? (num > 500 ? num : num * 60) : null;
  console.log('interpreted as minutes:', asMinutes, num <= 500 ? '(treated as hours)' : '(treated as minutes)');

  const runH = parseFloat(String(wo.runningTimeHoursPlannedTargetLabor || '').replace(/,/g, '')) || 0;
  const setupH = parseFloat(String(wo.setupTimeHoursPlannedTarget || '').replace(/,/g, '')) || 0;
  const runSetupMinutes = (runH + setupH) * 60;
  console.log('runningTimeHoursPlannedTargetLabor:', wo.runningTimeHoursPlannedTargetLabor, '->', runH, 'h');
  console.log('setupTimeHoursPlannedTarget:', wo.setupTimeHoursPlannedTarget, '->', setupH, 'h');
  console.log('(run + setup) * 60 min:', Math.round(runSetupMinutes));
  const laborRun = wo.laborRunTimePerPartPlannedTarget;
  const laborRunNum = parseFloat(String(laborRun || '').replace(/,/g, '')) || NaN;
  console.log('laborRunTimePerPartPlannedTarget:', JSON.stringify(laborRun), '-> as hours:', laborRunNum, '-> as min (x60):', !isNaN(laborRunNum) ? Math.round(laborRunNum * 60) : 'n/a', '-> as min if already min:', !isNaN(laborRunNum) && laborRunNum > 500 ? Math.round(laborRunNum) : 'n/a');
  console.log('4680 min = 78 hours');
  console.log('');

  const ops = wo.ops?.records ?? [];
  const totalOps = wo.ops?.totalRecords != null ? parseInt(wo.ops.totalRecords, 10) : ops.length;
  let sumFromPartOp = 0;
  let sumCycleTime = 0;
  let sumNROp = 0;
  let sumNROpHours = 0;
  for (const op of ops) {
    const po = op.partOperation;
    if (po) {
      const setup = parseFloat(po.estSetupMinutes) || 0;
      const perPart = parseInt(po.estMinutesPerPart, 10) || 0;
      sumFromPartOp += setup + perPart * qty;
      const nrInsp = parseFloat(String(po.estNRInspection || '').replace(/,/g, '')) || 0;
      const nrSetup = parseFloat(String(po.estNRSetup || '').replace(/,/g, '')) || 0;
      sumNROp += nrInsp + nrSetup;
      sumNROpHours += nrInsp + nrSetup;
    }
    const ct = parseFloat(String(op.totalCycleTime || 0).replace(/,/g, '')) || 0;
    sumCycleTime += ct;
  }

  console.log('Ops (first page):', ops.length, 'totalRecords:', totalOps);
  console.log('Sum(estSetupMinutes + estMinutesPerPart*qty) from partOperation:', Math.round(sumFromPartOp));
  console.log('Sum(estNRInspection + estNRSetup) from partOperation:', sumNROp, '(if min)', sumNROpHours, '(if h)');
  console.log('Sum(totalCycleTime):', Math.round(sumCycleTime));
  console.log('Target: 4680 minutes');
  const targetMin = asMinutes;
  const withoutNRMin = targetMin != null && sumNROp > 0 ? Math.round(targetMin - sumNROp) : null;
  const withoutNRHours = targetMin != null && sumNROpHours > 0 ? Math.round(targetMin - sumNROpHours * 60) : null;
  if (withoutNRMin != null && withoutNRMin === 4680) console.log('  -> MATCH: hoursCurrentTarget - partOp NR(as min) = 4680');
  if (withoutNRHours != null && withoutNRHours === 4680) console.log('  -> MATCH: hoursCurrentTarget - partOp NR(as h)*60 = 4680');

  if (totalOps > 200) {
    console.log('\nFetching remaining ops pages for partOperation sum...');
    let pageStart = 200;
    while (pageStart < totalOps) {
      const q2 = `
        query($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
          workOrders(pageSize: 1, pageStart: 0, filter: $filter) {
            records {
              ops(pageSize: 200, pageStart: ${pageStart}) {
                records {
                  partOperation { estSetupMinutes estMinutesPerPart estNRInspection estNRSetup }
                  totalCycleTime
                }
              }
            }
          }
        }
      `;
      const d2 = await executeGraphQLQuery(q2, { pageSize: 1, pageStart: 0, filter: { workOrderNumber: [woNumber] } }, token);
      const nextOps = d2?.workOrders?.records?.[0]?.ops?.records ?? [];
      for (const op of nextOps) {
        const po = op.partOperation;
        if (po) {
          const setup = parseFloat(po.estSetupMinutes) || 0;
          const perPart = parseInt(po.estMinutesPerPart, 10) || 0;
          sumFromPartOp += setup + perPart * qty;
          const nrInsp = parseFloat(String(po.estNRInspection || '').replace(/,/g, '')) || 0;
          const nrSetup = parseFloat(String(po.estNRSetup || '').replace(/,/g, '')) || 0;
          sumNROp += nrInsp + nrSetup;
        }
        sumCycleTime += parseFloat(String(op.totalCycleTime || 0).replace(/,/g, '')) || 0;
      }
      pageStart += 200;
      if (nextOps.length < 200) break;
    }
    console.log('After full pagination:');
    console.log('Sum(partOperation est):', Math.round(sumFromPartOp));
    console.log('Sum(NR):', Math.round(sumNROp));
    console.log('Sum(totalCycleTime):', Math.round(sumCycleTime));
    const withoutNRFull = asMinutes != null && sumNROp > 0 ? Math.round(asMinutes - sumNROp) : null;
    if (withoutNRFull != null) console.log('hoursCurrentTarget - NR =', withoutNRFull, 'min');
  }

  const partNum = wo.part?.partNumber;
  if (partNum) {
    const partQuery = `
      query($partNumber: String!) {
        part(partNumber: $partNumber) {
          partNumber
          estimateIdPlainText
          operations(pageSize: 200, pageStart: 0) {
            totalRecords
            records { estSetupMinutes estMinutesPerPart }
          }
        }
      }
    `;
    try {
      const partData = await executeGraphQLQuery(partQuery, { partNumber: partNum }, token);
      const part = partData?.part;
      if (part?.operations?.records) {
        let partOpSum = 0;
        for (const op of part.operations.records) {
          partOpSum += (parseFloat(op.estSetupMinutes) || 0) + (parseInt(op.estMinutesPerPart, 10) || 0) * qty;
        }
        console.log('\nPart-level operations (part.', partNum, '):');
        console.log('  totalRecords:', part.operations.totalRecords);
        console.log('  Sum(estSetupMinutes + estMinutesPerPart*qty):', Math.round(partOpSum));
        if (Math.round(partOpSum) === 4680) {
          console.log('  -> MATCHES 4680. Use Part operations sum for estimated minutes.');
        }
      }
      const estId = part?.estimateIdPlainText;
      console.log('  estimateIdPlainText:', estId || '(none)');
      if (estId) {
        const estQuery = `
          query($estimateId: String!) {
            estimate(estimateId: $estimateId) {
              estimateId
              operations(pageSize: 200, pageStart: 0) {
                totalRecords
                records { estSetupMinutes estMinutesPerPart }
              }
            }
          }
        `;
        try {
          const estData = await executeGraphQLQuery(estQuery, { estimateId: estId }, token);
          const est = estData?.estimate;
          if (est?.operations?.records) {
            let estOpSum = 0;
            for (const op of est.operations.records) {
              estOpSum += (parseFloat(op.estSetupMinutes) || 0) + (parseInt(op.estMinutesPerPart, 10) || 0) * qty;
            }
            console.log('\nEstimate-level operations:');
            console.log('  totalRecords:', est.operations.totalRecords);
            console.log('  Sum(estSetupMinutes + estMinutesPerPart*qty):', Math.round(estOpSum));
            if (Math.round(estOpSum) === 4680) {
              console.log('  -> MATCHES 4680. Use Estimate operations sum for estimated minutes.');
            }
          }
        } catch (e2) {
          console.log('  Estimate query failed (scope?):', e2.message);
        }
      }
    } catch (e) {
      console.log('Part query failed:', e.message);
    }
  }

  console.log('\nInterpretation:');
  console.log('  hoursCurrentTarget as minutes:', asMinutes);
  console.log('  run+setup as minutes:', Math.round(runSetupMinutes));
  if (Math.round(runSetupMinutes) === 4680) {
    console.log('  -> Use (runningTimeHoursPlannedTargetLabor + setupTimeHoursPlannedTarget) * 60 for estimated minutes.');
  } else {
    console.log('  If ProShop shows 4680, prefer run+setup or Part operations sum when they match.');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
