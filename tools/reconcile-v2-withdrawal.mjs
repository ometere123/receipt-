/**
 * V2 withdrawal reconciliation report.
 *
 * V2 intentionally has no dispatch to reconcile: the contract reports a
 * fail-closed withdrawal gate and retains internal credits. This read-only
 * report makes that state explicit instead of reusing the V1 dispatch parser.
 */
import { existsSync, readFileSync } from 'node:fs';

const manifestFile = 'receipt-v2-deployment.manifest.json';
if (!existsSync(manifestFile)) {
  console.log(JSON.stringify({status: 'NOT_DEPLOYED', dispatch_expected: false, writes_performed: false}));
  process.exit(0);
}
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
if (manifest.architecture !== 'SINGLE_IC' || manifest.chain_id !== 61999) {
  console.error('Refusing a non-V2 or non-61999 manifest.');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    status: manifest.withdrawal_status === 'DISABLED_FAIL_CLOSED' ? 'DISABLED_NO_DISPATCH' : 'REVIEW_REQUIRED',
    architecture: manifest.architecture,
    chain_id: manifest.chain_id,
    receipt_v2: manifest.receipt_v2?.address || null,
    dispatch_expected: false,
    writes_performed: false,
    note: 'Internal credits are not external GEN receipts; no retry or recredit is safe without an authenticated protocol outcome.',
  }, null, 2));
}
