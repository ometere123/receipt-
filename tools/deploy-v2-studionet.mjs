/**
 * Crash-safe single-contract ReceiptV2 deployment to GenLayer Studionet 61999.
 * This script refuses the legacy ProofEngine/PromiseVault pair, requires the
 * repository-local CLI 0.39.1, and never retries an ambiguous broadcast.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chainPreflight, hashes } from './preflight.mjs';

// On Windows invoke the pinned CLI's JS entry with the current Node process;
// spawning the npm-generated .cmd shim through a shell is not reliable in a
// non-interactive agent process.
const cli = process.platform === 'win32'
  ? process.execPath
  : resolve('node_modules/.bin/genlayer');
const cliEntry = process.platform === 'win32'
  ? resolve('node_modules/genlayer/dist/index.js')
  : '';
const journal = 'receipt-v2-deployment.state.json';
const contractPath = 'contracts/ReceiptV2.py';
let signerName = '';

const safe = value => String(value || '').replace(/\x1b\[[0-9;]*m/g, '');
const readJson = path => existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
const save = state => writeFileSync(journal, JSON.stringify(state, null, 2) + '\n');

function run(args) {
  console.log(`\n> genlayer ${args.join(' ')}`);
  const invocation = cliEntry ? [cliEntry, ...args] : args;
  const result = spawnSync(cli, invocation, {
    encoding: 'utf8', timeout: 480000, env: process.env,
    // The explicit .cmd path is executable through Node on Windows. Using a
    // shell here can leave the CLI waiting on inherited stdin in automation.
    shell: false,
  });
  const output = safe(`${result.stdout || ''}\n${result.stderr || ''}`);
  console.log(output.slice(0, 12000));
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`CLI failed: ${args.join(' ')}`);
  return output;
}

function matchAddress(output) {
  const match = output.match(/(?:Contract\s+Address|contract_address)\s*[:=]\s*["']?(0x[0-9a-fA-F]{40})/i);
  if (!match) throw Error('Could not parse the ReceiptV2 contract address. Inspect the saved output before retrying.');
  return match[1];
}

function matchTx(output) {
  const match = output.match(/(?:Transaction Hash|Transaction ID|Tx Hash|Tx ID)\s*[:=]\s*(0x[0-9a-fA-F]{64})/i);
  if (!match) throw Error('Could not parse the deployment transaction hash. Do not retry blindly.');
  return match[1];
}

function confirmFinalized(hash) {
  const text = run(['receipt', hash, '--status', 'FINALIZED']);
  const finalized = /status_name["']?\s*[:=]\s*["']FINALIZED["']|status["']?\s*[:=]\s*7\b/i.test(text);
  const successful = /txExecutionResultName["']?\s*[:=]\s*["']FINISHED_WITH_RETURN["']|execution_result\s*[:=]\s*["']SUCCESS["']/i.test(text);
  if (!finalized || !successful) throw Error(`Unable to prove FINALIZED + GenVM success for ${hash}; no retry was sent.`);
  return text;
}

function runAsSigner(args) {
  if (!signerName) throw Error('No active CLI signer name available.');
  run(['account', 'use', signerName]);
  return run(args);
}

function deploy(state) {
  if (state.contract?.verified) return state.contract;
  if (state.contract?.ambiguous) {
    const prior = state.contract.raw_output || '';
    if (!prior) throw Error('Ambiguous prior deployment has no saved output. Inspect Studionet before retrying.');
    const hash = matchTx(prior);
    const address = matchAddress(prior);
    state.contract = { ...state.contract, ambiguous: false, hash, address, verified: false };
    save(state);
    confirmFinalized(hash);
    state.contract.verified = true;
    save(state);
    return state.contract;
  }
  if (state.contract?.hash) {
    confirmFinalized(state.contract.hash);
    if (!state.contract.address) throw Error('Confirmed deployment has no address in the journal; inspect manually.');
    state.contract.verified = true;
    save(state);
    return state.contract;
  }
  state.contract = { ambiguous: true, contract: contractPath, verified: false };
  save(state);
  const output = runAsSigner(['deploy', '--contract', contractPath]);
  state.contract = { ambiguous: true, raw_output: output.slice(0, 16000), verified: false };
  save(state);
  state.contract = { hash: matchTx(output), address: matchAddress(output), verified: false };
  save(state);
  confirmFinalized(state.contract.hash);
  state.contract.verified = true;
  save(state);
  return state.contract;
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Use: npm run deploy:61999 -- --deploy (real Studionet transaction; resumable)');
    return;
  }
  if (!process.argv.includes('--deploy')) throw Error('This sends a live transaction. Add --deploy to confirm intentional deployment.');
  if (!existsSync(cli)) throw Error('Repository-local CLI missing. Run npm install at the repository root.');
  const version = run(['--version']);
  if (!/(?:^|[^0-9])0\.39\.1(?:[^0-9]|$)/.test(version)) throw Error(`Refusing mismatched CLI; required 0.39.1, observed ${version.slice(0, 160)}`);
  const network = await chainPreflight();
  if (network.chain_id !== 61999 || network.rpc !== 'https://studio.genlayer.com/api') throw Error('Refusing non-StudioNet-61999 deployment target.');
  const info = run(['network', 'info']);
  if (!/studionet|studio\.genlayer\.com/i.test(info)) throw Error('CLI is not configured for Studionet.');
  const account = run(['account', 'show']);
  const signer = (account.match(/0x[0-9a-fA-F]{40}/) || [])[0];
  signerName = (account.match(/name:\s*["']([^"']+)["']/i) || [])[1] || '';
  if (!signer || !signerName) throw Error('No active CLI wallet name/address detected.');

  const state = readJson(journal);
  const sourceHashes = hashes();
  if (state.source_hashes && JSON.stringify(state.source_hashes) !== JSON.stringify(sourceHashes)) throw Error('ReceiptV2 source changed since deployment began. Do not mix versions.');
  if (state.signer && state.signer.toLowerCase() !== signer.toLowerCase()) throw Error('Active wallet changed since deployment began.');
  if (state.chain_id && state.chain_id !== 61999) throw Error('Deployment journal belongs to another chain.');
  state.signer = signer;
  state.signer_name = signerName;
  state.chain_id = 61999;
  state.rpc = network.rpc;
  state.source_hashes = sourceHashes;
  save(state);

  const contract = deploy(state);
  const config = run(['call', contract.address, 'get_config']);
  if (!/SINGLE_IC/i.test(config) || !/funding_enabled[\\"']?\s*[:=]\s*false/i.test(config) || !/DISABLED_FAIL_CLOSED/i.test(config)) {
    throw Error('ReceiptV2 post-deploy safety readback failed; funding must remain disabled.');
  }
  const treasury = run(['call', contract.address, 'get_treasury_status']);
  if (!/accepted_wei[\\"']?\s*[:=]\s*[\\"']?0|outstanding_wei[\\"']?\s*[:=]\s*[\\"']?0/i.test(treasury)) throw Error('Fresh ReceiptV2 treasury is not zero; deployment evidence is inconsistent.');
  const manifest = {
    project: 'RECEIPT!', architecture: 'SINGLE_IC', chain_id: 61999,
    rpc: network.rpc, signer, source_sha256: sourceHashes,
    receipt_v2: { address: contract.address, deploy_tx: contract.hash },
    funding_enabled: false, withdrawal_status: 'DISABLED_FAIL_CLOSED',
    verified_at: new Date().toISOString(),
  };
  writeFileSync('receipt-v2-deployment.manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync('frontend/.env.local', `NEXT_PUBLIC_RECEIPT_V2_ADDRESS=${contract.address}\nNEXT_PUBLIC_EXPLORER_URL=https://explorer-studio.genlayer.com\nNEXT_PUBLIC_FUNDING_ENABLED=false\nNEXT_PUBLIC_HISTORICAL_PROOF_ENGINE_ADDRESS=0xa2E4DaFe86229e6A3d1C92C6dCEb680dd4a55128\nNEXT_PUBLIC_HISTORICAL_PROMISE_VAULT_ADDRESS=0x6A5366Dcc45E6fb137534BA09f44632593c18880\n`);
  console.log(`ReceiptV2 finalized at ${contract.address}. Funding and withdrawals remain disabled by verified safety gate.`);
}

main().catch(error => { console.error('DEPLOY BLOCKED:', error.message); process.exitCode = 1; });
