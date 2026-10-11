/** Fail-closed source provenance verification; does not fabricate deployments. */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chainPreflight } from './preflight.mjs';

const file = 'receipt-deployment.manifest.json';
if (!existsSync(file)) throw Error('No real deployment manifest. Deploy first; never invent addresses.');
const manifest = JSON.parse(readFileSync(file, 'utf8'));
if (manifest.chain_id !== 61999) throw Error('Refusing non-61999 provenance check');
const { rpc } = await chainPreflight();
if (rpc !== manifest.rpc) throw Error('RPC changed from deployment manifest');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function rpcCall(method, params) {
  const c = new AbortController(); const timeout = setTimeout(()=>c.abort(),15000);
  try {
    const res = await fetch(rpc,{method:'POST',headers:{'content-type':'application/json'},
      signal:c.signal,body:JSON.stringify({jsonrpc:'2.0',id:5,method,params})});
    if (!res.ok) throw Error(`${method} returned HTTP ${res.status}`);
    const data=await res.json();if (data.error) throw Error(`${method}: ${JSON.stringify(data.error)}`);
    return data.result;
  } finally {clearTimeout(timeout);}
}
const sourceChecks = [
  ['ProofEngine', manifest.proof_engine?.address,'contracts/ProofEngine.py'],
  ['PromiseVault',manifest.promise_vault?.address,'contracts/PromiseVault.py'],
];
for (const [name,address,path] of sourceChecks) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address||'')) throw Error(`${name} address is invalid`);
  const local = readFileSync(path); const expectedHash = hash(local);
  if (manifest.source_sha256?.[path] !== expectedHash) throw Error(`${name} source changed since deployment`);
  const b64 = await rpcCall('gen_getContractCode',[address]);
  if (typeof b64 !== 'string'||!b64.length) throw Error(`${name}: deployed source unavailable`);
  const remote=Buffer.from(b64,'base64');
  const exact=local.equals(remote);
  console.log(`${name} ${address} local_sha256=${expectedHash} deployed_sha256=${hash(remote)} exact_bytes=${exact}`);
  if (!exact) throw Error(`${name}: deployed source bytes do not match LOCAL TRACKED SOURCE`);
}
console.log('SOURCE PARITY: 2/2 exact bytes on finalized Studionet. This does NOT prove a live economic lifecycle.');
