/** Fail-closed source provenance verification for the active ReceiptV2 deployment. */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chainPreflight } from './preflight.mjs';

const manifestFile = 'receipt-v2-deployment.manifest.json';
const sourceFile = 'contracts/ReceiptV2.py';
if (!existsSync(manifestFile)) throw Error('No ReceiptV2 deployment manifest. Deploy first; never invent an address.');
const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
if (manifest.chain_id !== 61999 || manifest.architecture !== 'SINGLE_IC') throw Error('Refusing non-61999 or non-single-contract provenance.');
if (manifest.funding_enabled !== false || manifest.withdrawal_status !== 'DISABLED_FAIL_CLOSED') throw Error('Manifest does not prove the fail-closed safety gate.');
const { rpc } = await chainPreflight();
if (rpc !== manifest.rpc) throw Error('RPC changed from the deployment manifest.');
const address = manifest.receipt_v2?.address;
if (!/^0x[0-9a-fA-F]{40}$/.test(address || '')) throw Error('ReceiptV2 address is invalid.');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const local = readFileSync(sourceFile);
const expectedHash = hash(local);
if (manifest.source_sha256?.[sourceFile] !== expectedHash) throw Error('ReceiptV2 source changed since deployment.');

async function rpcCall(method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(rpc, { method: 'POST', headers: {'content-type': 'application/json'},
      signal: controller.signal, body: JSON.stringify({jsonrpc: '2.0', id: 5, method, params}) });
    if (!response.ok) throw Error(`${method} returned HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) throw Error(`${method}: ${JSON.stringify(data.error)}`);
    return data.result;
  } finally { clearTimeout(timeout); }
}

const encoded = await rpcCall('gen_getContractCode', [address]);
if (typeof encoded !== 'string' || !encoded.length) throw Error('ReceiptV2 deployed source unavailable.');
const remote = Buffer.from(encoded, 'base64');
const exact = local.equals(remote);
console.log(`ReceiptV2 ${address} local_sha256=${expectedHash} deployed_sha256=${hash(remote)} exact_bytes=${exact}`);
if (!exact) throw Error('ReceiptV2 deployed bytes do not match the tracked source.');
console.log('SOURCE PARITY: 1/1 exact bytes on finalized Studionet. This does not prove an economic payout lifecycle.');
