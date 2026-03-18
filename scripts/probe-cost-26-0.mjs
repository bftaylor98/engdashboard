/**
 * Scratch script to probe ProShop API for work order 26-0 / part AICHI-0004949_NEW.
 * Use woNumber 26-0310 in the app (the WO for that part); filter "26-0" returns 26-0001.
 * Expected: Material from PO 263161 = $361.40 (costPer * share for 26-0310). Part = AICHI-0004949_NEW.
 * Quoted $3885 would need customerPo scope; estWODollarAmount was null. 2355 hours not in totalCycleTime.
 * Run from repo root: node scripts/probe-cost-26-0.mjs
 */
import { getProshopToken, executeGraphQLQuery } from '../server/lib/proshopClient.js';

// Try exact formats ProShop might use for "26-0"
const WO_CANDIDATES = ['26-0', '26-0000'];
const PO_ID = '263161';
const EXPECTED_PART = 'AICHI-0004949_NEW';

function parseOpMinutes(val) {
  return parseFloat(String(val || 0).replace(/,/g, '')) || 0;
}

async function main() {
  console.log('Probing ProShop for WO 26-0 (part', EXPECTED_PART, ') and PO', PO_ID, '...\n');

  const token = await getProshopToken();

  // 1) Work order: quoted amount (estWO or customer PO), part, ops (totalCycleTime + est minutes for 2355)
  const woQuery = `
    query GetWorkOrderCostProbe($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
      workOrders(pageSize: $pageSize, pageStart: $pageStart, filter: $filter) {
        totalRecords
        records {
          workOrderNumber
          estWODollarAmount
          part { partNumber }
          customer { name }
          ops(pageSize: 200, pageStart: 0) {
            totalRecords
            records { totalCycleTime }
          }
        }
      }
    }
  `;

  let wo = null;
  for (const candidate of WO_CANDIDATES) {
    const woData = await executeGraphQLQuery(woQuery, {
      pageSize: 1,
      pageStart: 0,
      filter: { workOrderNumber: [candidate] },
    }, token);
    const records = woData?.workOrders?.records ?? [];
    if (records.length > 0 && records[0].workOrderNumber === candidate) {
      wo = records[0];
      console.log('--- Work order (exact match for "' + candidate + '") ---');
      break;
    }
    if (records.length > 0) {
      console.log('Filter workOrderNumber: ["' + candidate + '"] returned first WO:', records[0].workOrderNumber);
    }
  }

  // If no exact match, search by part number
  if (!wo) {
    console.log('No exact match; searching by part number', EXPECTED_PART, '...');
    const partFilterData = await executeGraphQLQuery(woQuery, {
      pageSize: 50,
      pageStart: 0,
      filter: { part: [EXPECTED_PART] },
    }, token);
    const byPart = partFilterData?.workOrders?.records ?? [];
    wo = byPart.find((r) => (r.part?.partNumber || '').includes('AICHI-0004949')) || byPart[0];
    if (wo) console.log('--- Work order (by part filter) ---');
  }

  if (!wo) {
    console.log('No work order found for 26-0 or part', EXPECTED_PART);
  } else {
    console.log('workOrderNumber:', wo.workOrderNumber);
    console.log('estWODollarAmount (quoted):', wo.estWODollarAmount, '(scope has no customerPo so Customer PO total not available)');
    console.log('part.partNumber:', wo.part?.partNumber);
    console.log('customer.name:', wo.customer?.name);
    const ops = wo.ops?.records ?? [];
    let totalMinutes = 0;
    for (const op of ops) totalMinutes += parseOpMinutes(op.totalCycleTime);
    console.log('ops count:', ops.length, '| totalRecords:', wo.ops?.totalRecords);
    console.log('sum(totalCycleTime) as minutes:', totalMinutes, '-> hours:', (totalMinutes / 60).toFixed(2));
    if (wo.ops?.totalRecords > 200) {
      console.log('(Note: more ops exist; would need to paginate to get full sum)');
    }
  }

  // 2) Purchase order 263161: cost and poItems with workOrder for 26-0
  const poQuery = `
    query GetPO($id: String!) {
      purchaseOrder(id: $id) {
        id
        cost
        date
        orderStatus
        poItems(pageSize: 100, pageStart: 0) {
          totalRecords
          records {
            workOrderPlainText
            total
            costPer
            quantity
            description
            workOrder { workOrderNumber }
          }
        }
      }
    }
  `;
  const poData = await executeGraphQLQuery(poQuery, { id: PO_ID }, token);
  const po = poData?.purchaseOrder;
  console.log('\n--- Purchase order query (id=', PO_ID, ') ---');
  const woNumForPo = wo?.workOrderNumber || '26-0';
  if (!po) {
    console.log('PO not found');
  } else {
    console.log('id:', po.id);
    console.log('cost (PO total):', po.cost);
    console.log('date:', po.date);
    console.log('orderStatus:', po.orderStatus);
    const items = po.poItems?.records ?? [];
    console.log('poItems totalRecords:', po.poItems?.totalRecords);
    // Parse workOrderPlainText e.g. "26-0305(1), 26-0306(1), 26-0310(1)" -> for our WO take the (n) and costPer * n
    function parseShareForWo(txt, woNum) {
      if (!txt || !woNum) return 0;
      const re = new RegExp(woNum.replace(/[.*+?^${}()|[\]\\]/g, '\\\\$&') + '\\((\\d+)\\)', 'i');
      const m = txt.match(re);
      return m ? parseInt(m[1], 10) : 0;
    }
    let materialForWo = 0;
    for (const i of items) {
      const txt = (i.workOrderPlainText || '').trim();
      const costPer = Number(i.costPer) || 0;
      const share = parseShareForWo(txt, woNumForPo);
      const lineForWo = share > 0 ? costPer * share : 0;
      materialForWo += lineForWo;
      if (txt || costPer) {
        console.log('  - costPer:', i.costPer, 'qty:', i.quantity, 'workOrder:', txt || i.workOrder?.workOrderNumber, '-> share for', woNumForPo, ':', share, '=>', lineForWo.toFixed(2));
      }
    }
    console.log('Material cost for WO', woNumForPo, '(from PO lines):', materialForWo.toFixed(2));
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
