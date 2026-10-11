/**
 * Active *repository-local* CLI 0.39.1 wallet deployment, crash-safe journal.
 * No private key extraction. A network or ambiguous execution failure halts.
 * Run only after studying README. This script makes real network transactions.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chainPreflight, hashes } from './preflight.mjs';

// npm installs the repository-local CLI as a POSIX shim plus a Windows .cmd
// launcher. Node's spawnSync does not resolve the latter when given the bare
// shim path, so select the platform launcher explicitly and never fall back
// to a globally installed CLI.
const cli = resolve(process.platform === 'win32'
  ? 'node_modules/.bin/genlayer.cmd'
  : 'node_modules/.bin/genlayer');
const journal='receipt-deployment.state.json';
const safe = s=>s.replace(/\x1b\[[0-9;]*m/g,'');
const readJson=p=>existsSync(p)?JSON.parse(readFileSync(p,'utf8')):{};
const run=(args)=>{
  console.log(`\n> genlayer ${args.join(' ')}`);
  const result=spawnSync(cli,args,{encoding:'utf8',timeout:480000,env:process.env,
    shell:process.platform === 'win32'});
  const output=safe(`${result.stdout||''}\n${result.stderr||''}`);
  console.log(output.slice(0,12000));
  if(result.error)throw result.error;
  if(result.status!==0)throw Error(`CLI failed: ${args.join(' ')}`);
  return output;
};
function save(state) {writeFileSync(journal,JSON.stringify(state,null,2)+'\n');}
function matchAddress(output,label) {
  const m=output.match(new RegExp(`${label}\\s*[:=]\\s*(0x[0-9a-fA-F]{40})`,'i'));
  if(!m)throw Error(`Could not parse ${label}. Inspect CLI output before retrying; the transaction may already exist.`);
  return m[1];
}
function matchTx(output) {
  const m=output.match(/(?:Transaction Hash|Transaction ID|Tx Hash|Tx ID)\s*[:=]\s*(0x[0-9a-fA-F]{64})/i);
  if(!m)throw Error('Transaction hash not parsed. Do not blindly retry a deployment.');
  return m[1];
}
function confirmFinalized(hash) {
  const text=run(['receipt',hash,'--status','FINALIZED']);
  if(!/FINALIZED/i.test(text) || !/FINISHED_WITH_RETURN|EXECUTION\s*(?:SUCCESS|SUCCEEDED)|"txExecutionResultName"\s*:\s*"FINISHED_WITH_RETURN"/i.test(text)) {
    throw Error(`Unable to prove FINALIZED + GenVM success for ${hash}; inspect the receipt manually. No automatic retry.`);
  }
}
function deploy(state,key,path,args) {
  if (state[key]?.verified) return state[key].address;
  // If a prior submission returned an unparseable output, stop rather than
  // silently broadcasting a duplicate that would orphan a deployed contract.
  if (state[key]?.ambiguous) throw Error(`Ambiguous prior ${key} deployment. Inspect saved CLI output and the network; do not resubmit blindly.`);
  if (state[key]?.hash) {
    confirmFinalized(state[key].hash);
    if (!state[key].address) throw Error(`Existing ${key} tx confirmed but address missing in journal; inspect receipt and update journal manually.`);
    state[key].verified=true;save(state);return state[key].address;
  }
  // Write a durable pre-submit intent FIRST: if this process is interrupted
  // or the CLI output is ambiguous, a later run must not broadcast again.
  state[key]={ambiguous:true,contract:path,verified:false};save(state);
  const out=run(['deploy','--contract',path,...(args.length?['--args',...args]:[])]);
  state[key]={ambiguous:true,raw_output:out.slice(0,16000),verified:false};save(state);
  state[key]={hash:matchTx(out),address:matchAddress(out,'Contract Address'),verified:false};save(state);
  confirmFinalized(state[key].hash);
  state[key].verified=true;save(state);
  return state[key].address;
}
async function main() {
  if(process.argv.includes('--help')) {console.log('Use: npm run deploy:61999 -- --deploy   (real transactions, resumable)');return;}
  if(!process.argv.includes('--deploy'))throw Error('This sends live transactions. Rerun with --deploy to confirm intentional deployment.');
  if(!existsSync(cli))throw Error('Repository-local CLI missing. Run npm install at the repository root.');
  const cliVersion=run(['--version']);
  if(!/(?:^|[^0-9])0\.39\.1(?:[^0-9]|$)/.test(cliVersion)) throw Error(`Refusing mismatched CLI: required repository-local 0.39.1; observed ${cliVersion.slice(0,160)}`);
  const network=await chainPreflight();
  const info=run(['network','info']);
  if(!/studionet|studio\.genlayer\.com/i.test(info))throw Error('CLI is not configured for Studionet. Run: npm run cli -- network set studionet');
  const account=run(['account','show']);
  const signer=(account.match(/0x[0-9a-fA-F]{40}/)||[])[0];
  if(!signer)throw Error('No active CLI wallet detected. Unlock the active wallet before deployment.');
  console.log('Active CLI wallet:',signer);
  const state=readJson(journal);
  if(state.source_hashes && JSON.stringify(state.source_hashes)!==JSON.stringify(hashes()))throw Error('Source changed since deployment began. Do not mix contract versions.');
  if(state.signer && state.signer.toLowerCase()!==signer.toLowerCase())throw Error('Active wallet changed mid-deployment.');
  if(state.chain_id && state.chain_id!==61999)throw Error('State belongs to another network.');
  state.signer=signer;state.chain_id=61999;state.rpc=network.rpc;state.source_hashes=hashes();save(state);
  const engine=deploy(state,'engine','contracts/ProofEngine.py',[]);
  const vault=deploy(state,'vault','contracts/PromiseVault.py',[engine]);
  if(!state.binding?.verified){
    if(state.binding?.ambiguous)throw Error('Ambiguous earlier vault-binding write: inspect recorded CLI output before retrying.');
    if(state.binding?.hash){confirmFinalized(state.binding.hash);}else{
      state.binding={ambiguous:true,verified:false};save(state);
      const out=run(['write',engine,'bind_vault','--args',vault]);
      state.binding={ambiguous:true,raw_output:out.slice(0,16000),verified:false};save(state);
      state.binding={hash:matchTx(out),verified:false};save(state);
      confirmFinalized(state.binding.hash);
    }
    state.binding.verified=true;save(state);
  }
  const actual=run(['call',engine,'get_vault']);
  if(!actual.toLowerCase().includes(vault.toLowerCase()))throw Error('ProofEngine binding did not read back expected PromiseVault address.');
  // Binding triggers a separate finalized child transaction into PromiseVault.
  // Never mistake successful binding for the completed child activation.
  const ready=run(['call',vault,'get_config']);
  if(!/engine_ready[\\"\s:]+true/i.test(ready)){
    console.error('ENGINE ACTIVATION STILL PENDING. Inspect the finalized activation child, then run engine.resend_activation if it was lost. Funding MUST remain blocked.');
    throw Error('PromiseVault has not confirmed the finalized activation child; no safe funding yet.');
  }
  const manifest={project:'RECEIPT!',chain_id:61999,rpc:network.rpc,signer,source_sha256:state.source_hashes,
    proof_engine:{address:engine,deploy_tx:state.engine.hash},promise_vault:{address:vault,deploy_tx:state.vault.hash},bind_tx:state.binding.hash,
    observed_binding:vault,verified_at:new Date().toISOString()};
  writeFileSync('receipt-deployment.manifest.json',JSON.stringify(manifest,null,2)+'\n');
  writeFileSync('frontend/.env.local',`NEXT_PUBLIC_PROOF_ENGINE_ADDRESS=${engine}\nNEXT_PUBLIC_PROMISE_VAULT_ADDRESS=${vault}\nNEXT_PUBLIC_EXPLORER_URL=https://explorer-studio.genlayer.com\n`);
  console.log('\nDeployment recorded. The UI is configured. Complete the independent browser economic-lifecycle verification before publishing an assurance claim.');
}
main().catch(e=>{console.error('DEPLOY BLOCKED:',e.message);process.exitCode=1;});
