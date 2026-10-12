/**
 * V2 withdrawal reconciliation report.
 *
 * V2 records native GEN withdrawal dispatches in the single contract. This
 * report remains read-only: it describes the configured dispatch boundary and
 * never retries, recredits, or treats a dispatch record as an external receipt.
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
    status: manifest.withdrawal_status === 'EVM_DISPATCH_EMITTED_UNCONFIRMED' ? 'DISPATCH_READY' : 'REVIEW_REQUIRED',
    architecture: manifest.architecture,
    chain_id: manifest.chain_id,
    receipt_v2: manifest.receipt_v2?.address || null,
    dispatch_expected: true,
    writes_performed: false,
    note: 'A dispatch record proves the contract emitted the EVM transfer request; inspect the external child receipt separately. No automatic retry or recredit is performed.',
  }, null, 2));
}
