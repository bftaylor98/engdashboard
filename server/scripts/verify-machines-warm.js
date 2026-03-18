/**
 * One-off verification: run buildMachinesResponse() (ProShop-only) and confirm known WOs appear.
 * Run from repo root: node server/scripts/verify-machines-warm.js
 */

import { buildMachinesResponse } from '../routes/machines.js';

const EXPECTED = {
  '26-0337': 'VMX 64-1',
  '26-0217': 'VMX 64-2',
  '26-0344': 'VMX 84-1',
};

async function main() {
  console.log('[verify] Calling buildMachinesResponse()...');
  const result = await buildMachinesResponse();
  console.log('[verify] Result:', JSON.stringify(result, null, 2));

  const data = result?.data ?? {};
  const found = {};
  for (const [wo, machine] of Object.entries(EXPECTED)) {
    const list = data[machine] ?? [];
    const inList = list.some((entry) => entry.workOrderNumber === wo);
    found[wo] = inList ? machine : null;
  }

  console.log('\n[verify] Expected work orders:');
  let ok = true;
  for (const [wo, machine] of Object.entries(EXPECTED)) {
    const actual = found[wo] ? `in ${found[wo]}` : 'MISSING';
    const pass = found[wo] === machine;
    if (!pass) ok = false;
    console.log(`  ${wo} -> ${machine} : ${actual} ${pass ? 'OK' : 'FAIL'}`);
  }
  console.log(ok ? '\n[verify] All three work orders found under correct machines.' : '\n[verify] Some work orders missing or under wrong machine.');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('[verify] Error:', err);
  process.exit(1);
});
