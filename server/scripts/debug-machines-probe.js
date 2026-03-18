/**
 * Temporary debug script: probe ProShop GraphQL for three known work orders
 * (26-0337, 26-0217, 26-0344) to see exact field names and values for
 * work center and time. Run from repo root: node server/scripts/debug-machines-probe.js
 */

import { executeGraphQLQuery } from '../lib/proshopClient.js';

const WO_NUMBERS = ['26-0337', '26-0217', '26-0344'];

const query = `
  query GetWorkOrderByNumber($pageSize: Int!, $pageStart: Int!, $filter: WorkOrderFilter) {
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
            workCenterPlainText
            operationDescription
            setupTime
            runTime
            totalCycleTime
            setupTimeSpent
            runTimeSpent
            workCenter {
              commonName
              shortName
              potId
              description
            }
          }
        }
      }
    }
  }
`;

async function main() {
  console.log('[probe] Fetching work orders...');

  const findings = {
    workCenterField: null,
    workCenterValues: [],
    estimatedTimeFields: [],
    completedTimeFields: [],
    opsSamples: [],
  };

  for (const wo of WO_NUMBERS) {
    console.log('\n' + '='.repeat(80));
    console.log(`[probe] Work order: ${wo}`);
    console.log('='.repeat(80));

    try {
      const data = await executeGraphQLQuery(query, {
        pageSize: 1,
        pageStart: 0,
        filter: { workOrderNumber: [wo] },
      });

      console.log(JSON.stringify(data, null, 2));

      const records = data?.workOrders?.records ?? [];
      if (records.length === 0) {
        console.log(`[probe] No record returned for ${wo}`);
        continue;
      }

      const woRecord = records[0];
      const ops = woRecord.ops?.records ?? [];

      for (const op of ops) {
        const wcPlain = op.workCenterPlainText;
        const wcObj = op.workCenter;
        const wcName = wcObj?.commonName ?? wcObj?.shortName ?? null;
        if (wcPlain || wcName) {
          findings.workCenterValues.push({
            wo,
            op: op.operationNumber,
            workCenterPlainText: wcPlain,
            workCenter_commonName: wcObj?.commonName,
            workCenter_shortName: wcObj?.shortName,
          });
        }
        if (op.setupTime != null || op.runTime != null || op.totalCycleTime != null) {
          findings.opsSamples.push({
            wo,
            operationNumber: op.operationNumber,
            setupTime: op.setupTime,
            runTime: op.runTime,
            totalCycleTime: op.totalCycleTime,
            setupTimeSpent: op.setupTimeSpent,
            runTimeSpent: op.runTimeSpent,
          });
        }
      }
    } catch (err) {
      console.error(`[probe] Error for ${wo}:`, err.message || err);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('STEP 2 — SUMMARY OF FINDINGS');
  console.log('='.repeat(80));

  if (findings.workCenterValues.length > 0) {
    console.log('\n1. Machine / work center:');
    console.log('   Sample values from ops:');
    findings.workCenterValues.forEach((v) => {
      console.log(`   WO ${v.wo} op ${v.op}: workCenterPlainText="${v.workCenterPlainText}" workCenter.commonName="${v.workCenter_commonName}" workCenter.shortName="${v.workCenter_shortName}"`);
    });
    const withPlain = findings.workCenterValues.filter((v) => v.workCenterPlainText);
    const withCommon = findings.workCenterValues.filter((v) => v.workCenter_commonName);
    console.log('   Use workCenterPlainText when non-empty:', withPlain.length > 0);
    console.log('   Use workCenter.commonName when non-empty:', withCommon.length > 0);
  } else {
    console.log('\n1. Machine / work center: No ops with work center data found.');
  }

  console.log('\n2. Estimated and completed time (field names from schema):');
  console.log('   Estimated: setupTime, runTime, totalCycleTime');
  console.log('   Completed: setupTimeSpent, runTimeSpent');
  if (findings.opsSamples.length > 0) {
    console.log('   Sample op time values:', JSON.stringify(findings.opsSamples[0], null, 2));
  }

  console.log('\n[probe] Done.');
}

main().catch((err) => {
  console.error('[probe] Fatal:', err);
  process.exit(1);
});
