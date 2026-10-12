import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
const rpc = process.env.RECEIPT_RPC_URL || 'https://studio.genlayer.com/api';
const want = 61999;
export async function chainPreflight() {
  const url = new URL(rpc);
  if (url.protocol !== 'https:' && !['localhost','127.0.0.1'].includes(url.hostname)) throw Error('Refusing non-HTTPS RPC.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const r = await fetch(rpc, { method:'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]}), signal: controller.signal });
    if (!r.ok) throw Error(`RPC HTTP ${r.status}`);
    const obj=await r.json();
    if (obj.error) throw Error(`RPC ${JSON.stringify(obj.error)}`);
    if (parseInt(String(obj.result),16)!==want) throw Error(`Wrong chain. Expected ${want}; got ${String(obj.result)}.`);
    return {rpc,chain_id:want,chain_hex:obj.result};
  } finally {clearTimeout(timer);}
}
export function hashes() {
  const files=['contracts/ReceiptV2.py'];
  return Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
}
if (process.argv[1] && process.argv[1].endsWith('preflight.mjs')) {
  chainPreflight().then(x=>{console.log('PASS Studionet chain identity',x);console.log('Source SHA-256',hashes());}).catch(e=>{console.error('BLOCK',e.message);process.exitCode=1;});
}
