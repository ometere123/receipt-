/**
 * Reproducible two-wallet Studionet lifecycle probe.
 *
 * Reads already-unlocked repository-local CLI accounts from the OS keychain;
 * private keys never enter output, files, or source control. This script is a
 * deliberate live transaction tool, not a mock or a frontend test.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import keytar from 'keytar';
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant, TransactionStatus } from 'genlayer-js/types';

const RPC = 'https://studio.genlayer.com/api';
const CHAIN = 61999;
const SPONSOR_NAME = process.env.RECEIPT_SPONSOR || 'walletA';
const CHALLENGER_NAME = process.env.RECEIPT_CHALLENGER || 'walletB';
const BOUNTY = 10n ** 15n;
const BOND = 10n ** 14n;
const EVIDENCE_FILE = 'receipt-live-lifecycle.json';
const manifest = JSON.parse(readFileSync('receipt-deployment.manifest.json', 'utf8'));
const VAULT = manifest.promise_vault.address;
const ENGINE = manifest.proof_engine.address;
const COMMIT = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const DOC_PATH = 'docs/ADVERSARIAL_LIVE_CLAIM.md';
const SOURCE_PATH = 'contracts/PromiseVault.py';
const ENGINE_SOURCE_PATH = 'contracts/ProofEngine.py';
const CLAIM = 'For this validation case, an EOA `withdraw` keeps the account\'s claimable credit intact until the external GEN transfer has been confirmed.';
const SOURCE_ANCHOR = 'self.credits[recipient] = u256(0)';
const BAD_ANCHOR = '# EVM child is created after finalization.';
const RESUME_CASE_ID = Number(process.env.RECEIPT_RESUME_CASE_ID || 0);
const RESUME_CREATE_TX = process.env.RECEIPT_RESUME_CREATE_TX || '';

const priorEvidence = existsSync(EVIDENCE_FILE) ? JSON.parse(readFileSync(EVIDENCE_FILE, 'utf8')) : null;
if (priorEvidence && priorEvidence.result !== 'BLOCKED') throw new Error(`Refusing to overwrite ${EVIDENCE_FILE}; inspect the prior live run first.`);
const evidence = priorEvidence || {
  chain_id: CHAIN, rpc: RPC, repository_commit: COMMIT,
  deployment: manifest, sponsor_account: SPONSOR_NAME,
  challenger_account: CHALLENGER_NAME, cases: [], unauthorized: [], replay: [],
};
function save() { writeFileSync(EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`); }
function plain(value) {
  return JSON.parse(JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v));
}
function assertFinal(receipt, label) {
  const status = String(receipt.statusName || receipt.status || '').toUpperCase();
  const result = String(receipt.txExecutionResultName || '').toUpperCase();
  const leader = receipt.consensus_data?.leader_receipt?.find(item => item.mode === 'leader') || receipt.consensus_data?.leader_receipt?.[0];
  const leaderSuccess = String(leader?.execution_result || '').toUpperCase() === 'SUCCESS';
  if (status !== 'FINALIZED' && status !== '7' || (result && result !== 'FINISHED_WITH_RETURN') || (!result && !leaderSuccess)) {
    throw new Error(`${label} was not successful: ${status} / ${result}`);
  }
}
function assertFailed(receipt, label) {
  const status = String(receipt.statusName || receipt.status || '').toUpperCase();
  const result = String(receipt.txExecutionResultName || '').toUpperCase();
  const leader = receipt.consensus_data?.leader_receipt?.find(item => item.mode === 'leader') || receipt.consensus_data?.leader_receipt?.[0];
  const leaderError = String(leader?.execution_result || '').toUpperCase() === 'ERROR';
  if (status !== 'FINALIZED' && status !== '7' || (result && result !== 'FINISHED_WITH_ERROR') || (!result && !leaderError)) {
    throw new Error(`${label} did not produce the expected finalized rejection: ${status} / ${result}`);
  }
}
async function account(name) {
  const privateKey = await keytar.getPassword('genlayer-cli', `account:${name}`);
  if (!privateKey) throw new Error(`CLI account ${name} is not unlocked in the OS keychain.`);
  return createAccount(privateKey);
}
async function raw(method, params) {
  const response = await fetch(RPC, { method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({jsonrpc: '2.0', id: Date.now(), method, params}) });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${method}: ${JSON.stringify(body.error || body)}`);
  return body.result;
}
async function nativeBalance(address) { return BigInt(await raw('eth_getBalance', [address, 'latest'])); }
async function remoteDigest(path) {
  const url = `https://raw.githubusercontent.com/ometere123/receipt-/${COMMIT}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GitHub fetch failed for ${url}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  return createHash('sha256').update(bytes).digest('hex');
}
async function readValue(client, address, functionName, args = []) {
  return client.readContract({ address, functionName, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
}
async function readJSON(client, address, functionName, args = []) {
  const value = await readValue(client, address, functionName, args);
  return typeof value === 'string' ? JSON.parse(value) : value;
}
async function childrenOf(client, hash) {
  for (let i = 0; i < 20; i += 1) {
    const children = await client.getTriggeredTransactionIds({ hash });
    if (children.length) return children;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  return [];
}
async function waitFinal(client, hash, label) {
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 5000, retries: 100 });
  assertFinal(receipt, label);
  return receipt;
}
async function waitError(client, hash, label) {
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 5000, retries: 100 });
  assertFailed(receipt, label);
  return receipt;
}
async function writeTx(client, address, functionName, args, value, label) {
  const hash = await client.writeContract({ address, functionName, args, value });
  console.log(`${label}: ${hash}`);
  const receipt = await waitFinal(client, hash, label);
  const children = await childrenOf(client, hash);
  return { hash, children, receipt: plain(receipt) };
}
async function rejectedTx(client, address, functionName, args, value, label) {
  const hash = await client.writeContract({ address, functionName, args, value });
  console.log(`${label}: ${hash}`);
  const receipt = await waitError(client, hash, label);
  return { hash, receipt: plain(receipt) };
}
async function settleChildren(client, parent, label) {
  const settled = [];
  for (const child of parent.children) {
    const receipt = await waitFinal(client, child, `${label} child ${child}`);
    const nested = await childrenOf(client, child);
    settled.push({ hash: child, receipt: plain(receipt), children: nested });
    for (const grandchild of nested) {
      const grandReceipt = await waitFinal(client, grandchild, `${label} grandchild ${grandchild}`);
      settled.push({ hash: grandchild, receipt: plain(grandReceipt), children: await childrenOf(client, grandchild) });
    }
  }
  return settled;
}
async function inspectExternalTransfer(client, parent, recipient, label) {
  if (!parent.children.length) throw new Error(`${label} emitted no observable child transaction.`);
  const transfers = [];
  for (const child of parent.children) {
    const transaction = await client.getTransaction({ hash: child });
    const evmReceipt = await raw('eth_getTransactionReceipt', [child]);
    const evmStatus = String(evmReceipt?.status || '').toLowerCase();
    if (String(transaction.recipient || '').toLowerCase() !== recipient.toLowerCase() || evmStatus !== '0x1' || transaction.value_credited !== true) {
      throw new Error(`${label} child ${child} did not prove EVM receipt success and value credit.`);
    }
    transfers.push({ hash: child, genlayer: plain(transaction), evm_receipt: evmReceipt });
  }
  return transfers;
}
function commitment(vault, caseId, claimant, salt, anchor, thesis) {
  const canonical = JSON.stringify([String(CHAIN), vault.toLowerCase(), String(caseId), claimant.toLowerCase(), salt, anchor, thesis]);
  return createHash('sha256').update(canonical).digest('hex');
}
function saltFor(label) { return createHash('sha256').update(`receipt-live-${label}`).digest('hex'); }

async function main() {
  const readClient = createClient({ chain: studionet });
  const sponsor = await account(SPONSOR_NAME);
  const challenger = await account(CHALLENGER_NAME);
  if (sponsor.address.toLowerCase() === challenger.address.toLowerCase()) throw new Error('Sponsor and challenger must be distinct wallets.');
  const sponsorClient = createClient({ chain: studionet, account: sponsor });
  const challengerClient = createClient({ chain: studionet, account: challenger });
  const docDigest = await remoteDigest(DOC_PATH);
  const sourceDigest = await remoteDigest(SOURCE_PATH);
  const engineSourceDigest = await remoteDigest(ENGINE_SOURCE_PATH);
  const badSourceDigest = '0'.repeat(64);
  evidence.wallets = { sponsor: sponsor.address, challenger: challenger.address };
  evidence.evidence = { doc_path: DOC_PATH, source_path: SOURCE_PATH, doc_digest: docDigest, source_digest: sourceDigest };
  save();

  async function createCase(label, digest = sourceDigest, sourcePath = SOURCE_PATH) {
    const counts = await readJSON(readClient, VAULT, 'get_counts');
    const id = Number(counts.cases) + 1;
    const tx = await writeTx(sponsorClient, VAULT, 'create_case', [
      `Live ${label} validation`, 'ometere123', 'receipt-', COMMIT, DOC_PATH, sourcePath,
      CLAIM, docDigest, digest, 24,
    ], BOUNTY, `${label} create_case`);
    const state = await readJSON(readClient, VAULT, 'get_case', [id]);
    if (state.status !== 'OPEN' || state.sponsor.toLowerCase() !== sponsor.address.toLowerCase()) throw new Error(`${label} case did not open for sponsor.`);
    const item = { label, id, create: tx, initial: state, bounty_wei: BOUNTY.toString(), bond_wei: BOND.toString() };
    evidence.cases.push(item); save(); return item;
  }
  async function commitAndReveal(item, label, anchor, thesis) {
    const salt = saltFor(label);
    const hash = commitment(VAULT, item.id, challenger.address, salt, anchor, thesis);
    item.commitment = { hash, salt, anchor, thesis };
    item.commit = await writeTx(challengerClient, VAULT, 'commit_attempt', [item.id, hash], BOND, `${label} commit_attempt`);
    item.attempt_after_commit = await readJSON(readClient, VAULT, 'get_attempt', [item.id]);
    item.unauthorized_reveal = await rejectedTx(sponsorClient, VAULT, 'reveal_attempt', [item.attempt_after_commit.id, salt, anchor, thesis], 0n, `${label} unauthorized reveal`);
    item.reveal = await writeTx(challengerClient, VAULT, 'reveal_attempt', [item.attempt_after_commit.id, salt, anchor, thesis], 0n, `${label} reveal_attempt`);
    item.assessment_children = await settleChildren(readClient, item.reveal, `${label} reveal`);
    item.engine_verdict = await readValue(readClient, ENGINE, 'get_verdict', [item.attempt_after_commit.id]);
    item.final_attempt = await readJSON(readClient, VAULT, 'get_attempt', [item.attempt_after_commit.id]);
    item.final_case = await readJSON(readClient, VAULT, 'get_case', [item.id]);
    item.sponsor_credit = String(await readValue(readClient, VAULT, 'get_credit', [sponsor.address]));
    item.challenger_credit = String(await readValue(readClient, VAULT, 'get_credit', [challenger.address]));
    save();
  }

  let positive;
  const existingPositive = evidence.cases.find(item => item.label === 'positive contradiction' && item.withdraw?.hash);
  if (existingPositive) {
    positive = existingPositive;
    positive.withdraw_children = positive.withdraw.children.map(hash => ({hash}));
    positive.withdraw_child_transactions = await inspectExternalTransfer(readClient, positive.withdraw, challenger.address, 'positive withdrawal');
    positive.balance_after_withdraw = (await nativeBalance(challenger.address)).toString();
    positive.dispatch = await readJSON(readClient, VAULT, 'get_dispatch', [1]);
    positive.external_child_evidence = positive.withdraw_child_transactions;
    save();
  } else if (RESUME_CASE_ID) {
    if (!RESUME_CREATE_TX) throw new Error('RECEIPT_RESUME_CREATE_TX is required with RECEIPT_RESUME_CASE_ID.');
    const state = await readJSON(readClient, VAULT, 'get_case', [RESUME_CASE_ID]);
    if (state.status !== 'OPEN' || state.active_attempt) throw new Error(`Resume case ${RESUME_CASE_ID} is not still open and attempt-free.`);
    positive = { label: 'positive contradiction', id: RESUME_CASE_ID, create: { hash: RESUME_CREATE_TX }, initial: state, bounty_wei: BOUNTY.toString(), bond_wei: BOND.toString() };
    evidence.cases.push(positive); save();
  } else {
    positive = await createCase('positive contradiction');
  }
  if (!existingPositive) {
    await commitAndReveal(positive, 'positive', SOURCE_ANCHOR,
      'The frozen code contradicts the published claim: withdraw clears the credit before it emits the external transfer, and the dispatch is explicitly EMITTED_UNCONFIRMED.');
    if (positive.final_attempt.verdict !== 'CONTRADICTED' || positive.final_case.status !== 'WON') throw new Error(`Positive case did not settle as CONTRADICTED/WON: ${positive.final_attempt.verdict}/${positive.final_case.status}`);
    positive.replay = await rejectedTx(challengerClient, VAULT, 'reveal_attempt', [positive.final_attempt.id, positive.commitment.salt, positive.commitment.anchor, positive.commitment.thesis], 0n, 'positive replay reveal');
    positive.balance_before_withdraw = (await nativeBalance(challenger.address)).toString();
    save();
    positive.withdraw = await writeTx(challengerClient, VAULT, 'withdraw', [], 0n, 'positive challenger withdraw');
    positive.withdraw_children = positive.withdraw.children.map(hash => ({hash}));
    positive.withdraw_child_transactions = await inspectExternalTransfer(readClient, positive.withdraw, challenger.address, 'positive withdrawal');
    positive.balance_after_withdraw = (await nativeBalance(challenger.address)).toString();
    positive.dispatch = await readJSON(readClient, VAULT, 'get_dispatch', [1]);
    positive.external_child_evidence = positive.withdraw_child_transactions;
  }
  if (BigInt(positive.balance_after_withdraw) <= BigInt(positive.balance_before_withdraw)) throw new Error('Successful adjudication did not produce a measurable recipient balance increase.');
  save();

  const priorNegative = evidence.cases.find(item => item.label === 'negative insufficient evidence' && item.final_attempt?.verdict === 'NOT_ESTABLISHED');
  const negative = priorNegative || await createCase(
    evidence.cases.some(item => item.label === 'negative insufficient evidence') ? 'negative unrelated source' : 'negative insufficient evidence',
    engineSourceDigest, ENGINE_SOURCE_PATH);
  if (!priorNegative) await commitAndReveal(negative, 'negative-unrelated', 'self.is_bound = False',
    'The selected source file is the unrelated adjudication engine and does not contain the withdraw path. This evidence is insufficient to establish a contradiction about external payment custody.');
  if (negative.final_attempt.verdict !== 'NOT_ESTABLISHED' || negative.final_case.status !== 'OPEN') throw new Error(`Negative case did not settle as NOT_ESTABLISHED/OPEN: ${negative.final_attempt.verdict}/${negative.final_case.status}`);
  if (BigInt(negative.sponsor_credit) < BOND) throw new Error('Negative case did not credit the forfeited bond to the sponsor.');
  save();

  const inconclusive = await createCase('inconclusive integrity failure', badSourceDigest);
  await commitAndReveal(inconclusive, 'inconclusive', SOURCE_ANCHOR,
    'The source digest is intentionally invalid, so no substantive contradiction can be established from authenticated evidence.');
  if (inconclusive.final_attempt.verdict !== 'INCONCLUSIVE' || inconclusive.final_case.status !== 'OPEN') throw new Error(`Inconclusive case did not settle neutrally: ${inconclusive.final_attempt.verdict}/${inconclusive.final_case.status}`);
  if (BigInt(inconclusive.challenger_credit) < BOND) throw new Error('Inconclusive case did not refund the challenger bond.');
  save();
  evidence.result = 'SUCCESS'; save();
  console.log(JSON.stringify({ result: evidence.result, cases: evidence.cases.map(c => ({label: c.label, id: c.id, verdict: c.final_attempt.verdict, status: c.final_case.status})), payout_dispatch: evidence.cases[0].dispatch, recipient_balance_delta: (BigInt(positive.balance_after_withdraw) - BigInt(positive.balance_before_withdraw)).toString() }, null, 2));
}

main().catch(error => { evidence.result = 'BLOCKED'; evidence.error = String(error?.stack || error); save(); console.error('LIVE LIFECYCLE BLOCKED:', error?.message || error); process.exitCode = 1; });
