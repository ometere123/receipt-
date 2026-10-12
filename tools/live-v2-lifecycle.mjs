/**
 * Controlled live lifecycle for the final, funded ReceiptV2 deployment.
 *
 * This is an evidence-producing operator tool, not a mock or frontend test.
 * It uses two distinct wallets for sponsor/challenger and a third wallet for
 * permissionless adjudication. It never retries an ambiguous transaction and
 * enforces the approved aggregate value-transfer cap before broadcasting.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import keytar from 'keytar';
import { createAccount, createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant, TransactionStatus } from 'genlayer-js/types';

const RPC = 'https://studio.genlayer.com/api';
const CHAIN = 61999;
const CONTRACT = JSON.parse(readFileSync('receipt-v2-deployment.manifest.json', 'utf8')).receipt_v2.address;
const COMMIT = process.env.RECEIPT_V2_COMMIT || '4e93e8c7b38774a4be1344e3585b749125bfb086';
const SPONSOR_NAME = process.env.RECEIPT_V2_SPONSOR || 'walletA';
const CHALLENGER_NAME = process.env.RECEIPT_V2_CHALLENGER || 'walletB';
const ASSESSOR_NAME = process.env.RECEIPT_V2_ASSESSOR || 'praest-deployer';
const BOUNTY = 10n ** 15n;
const BOND = 10n ** 14n;
const MAX_SPEND = 45n * 10n ** 18n;
const EVIDENCE_FILE = 'artifacts/receipt-v2-live-evidence.json';
const POSITIVE_DOC = 'docs/ADVERSARIAL_LIVE_CLAIM.md';
// The full deployed source remains parity-verified separately. GenVM's
// deterministic web evidence guard rejects files over 18 KB, so live
// adjudication pins this verbatim, provenance-bearing excerpt instead.
const SOURCE = 'docs/RECEIPT_V2_WITHDRAWAL_EXCERPT.py';
const NEGATIVE_DOC = 'README.md';
const NEGATIVE_CLAIM = 'RECEIPT! is a source-grounded documentation-claim registry for GenLayer Studionet 61999. V2 consolidates the active adjudication and economic state machine into exactly one Intelligent Contract, `contracts/ReceiptV2.py`.';
const POSITIVE_CLAIM = 'For this validation case, an EOA `withdraw` keeps the account\'s claimable credit intact until the external GEN transfer has been confirmed.';
const POSITIVE_ANCHOR = 'self.credits[recipient] = u256(0)';
const NEGATIVE_ANCHOR = 'class ReceiptV2(gl.Contract):';
const WRONG_SOURCE_DIGEST = '0'.repeat(64);
const PRIOR_SPEND = BigInt(process.env.RECEIPT_V2_ALREADY_SPENT_WEI || '0');
const EXPECTED_EXISTING_ACCEPTED = BigInt(process.env.RECEIPT_V2_EXPECTED_EXISTING_ACCEPTED_WEI || '0');
const EXPECTED_EXISTING_CREDITED = BigInt(process.env.RECEIPT_V2_EXPECTED_EXISTING_CREDITED_WEI || '0');

let valueSpent = PRIOR_SPEND;
mkdirSync('artifacts', { recursive: true });

const evidence = {
  result: 'RUNNING',
  chain_id: CHAIN,
  rpc: RPC,
  contract: CONTRACT,
  repository_commit: COMMIT,
  approved_max_spend_wei: MAX_SPEND.toString(),
  approved_max_spend_gen: '45',
  prior_value_spent_wei: PRIOR_SPEND.toString(),
  expected_existing_accepted_wei: EXPECTED_EXISTING_ACCEPTED.toString(),
  expected_existing_credited_wei: EXPECTED_EXISTING_CREDITED.toString(),
  bounty_wei: BOUNTY.toString(),
  bond_wei: BOND.toString(),
  cases: [],
  rejected_transactions: [],
};

function save() {
  evidence.value_spent_wei = valueSpent.toString();
  evidence.value_spent_gen = Number(valueSpent) / 1e18;
  evidence.within_approved_cap = valueSpent <= MAX_SPEND;
  writeFileSync(EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value, (_, item) => typeof item === 'bigint' ? item.toString() : item));
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function account(name) {
  const privateKey = await keytar.getPassword('genlayer-cli', `account:${name}`);
  if (!privateKey) throw new Error(`CLI account ${name} is not unlocked in the OS keychain.`);
  return createAccount(privateKey);
}

async function raw(method, params) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${method}: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

async function readValue(client, functionName, args = []) {
  return client.readContract({
    address: CONTRACT,
    functionName,
    args,
    transactionHashVariant: TransactionHashVariant.LATEST_FINAL,
  });
}

async function readJSON(client, functionName, args = []) {
  const value = await readValue(client, functionName, args);
  return typeof value === 'string' ? JSON.parse(value) : value;
}

async function remoteDigest(path) {
  const url = `https://raw.githubusercontent.com/ometere123/receipt-/${COMMIT}/${path}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`GitHub fetch failed for ${url}: HTTP ${response.status}`);
  return { url, digest: digest(Buffer.from(await response.arrayBuffer())) };
}

function resultName(receipt) {
  return String(receipt.txExecutionResultName || receipt.executionResultName || receipt.resultName || receipt.result || '').toUpperCase();
}

function statusName(receipt) {
  return String(receipt.statusName || receipt.status || '').toUpperCase();
}

function leaderSucceeded(receipt) {
  const leader = receipt.consensus_data?.leader_receipt?.find(item => item.mode === 'leader') || receipt.consensus_data?.leader_receipt?.[0];
  return String(leader?.execution_result || '').toUpperCase() === 'SUCCESS';
}

function leaderFailed(receipt) {
  const leader = receipt.consensus_data?.leader_receipt?.find(item => item.mode === 'leader') || receipt.consensus_data?.leader_receipt?.[0];
  return String(leader?.execution_result || '').toUpperCase() === 'ERROR';
}

function assertFinal(receipt, label) {
  const status = statusName(receipt);
  const result = resultName(receipt);
  const statusOk = status === 'FINALIZED' || status === '7';
  const resultOk = !result || result === 'FINISHED_WITH_RETURN' || result === 'SUCCESS' || result === '6' || leaderSucceeded(receipt);
  if (!statusOk || !resultOk) throw new Error(`${label} was not a successful finalized transaction: ${status} / ${result}`);
}

function assertRejected(receipt, label) {
  const status = statusName(receipt);
  const result = resultName(receipt);
  const statusOk = status === 'FINALIZED' || status === '7';
  const resultOk = result === 'FINISHED_WITH_ERROR' || result === 'ERROR' || result === '5' || leaderFailed(receipt);
  if (!statusOk || !resultOk) throw new Error(`${label} did not finalize as a contract rejection: ${status} / ${result}`);
}

async function waitFinal(client, hash, label) {
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 5000, retries: 100 });
  assertFinal(receipt, label);
  return receipt;
}

async function waitRejected(client, hash, label) {
  const receipt = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, interval: 5000, retries: 100 });
  assertRejected(receipt, label);
  return receipt;
}

async function triggered(client, hash, attempts = 20) {
  for (let index = 0; index < attempts; index += 1) {
    const children = await client.getTriggeredTransactionIds({ hash });
    if (children.length) return children;
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  return [];
}

async function spend(value, label) {
  if (value < 0n) throw new Error(`${label}: negative value`);
  if (valueSpent + value > MAX_SPEND) {
    throw new Error(`${label}: approved 45 GEN cap would be exceeded before broadcast`);
  }
  valueSpent += value;
  save();
}

async function writeTx(client, functionName, args, value, label) {
  await spend(value, label);
  const hash = await client.writeContract({ address: CONTRACT, functionName, args, value });
  console.log(`${label}: ${hash}`);
  const receipt = await waitFinal(client, hash, label);
  save();
  return { hash, receipt: plain(receipt) };
}

async function rejectedTx(client, functionName, args, label) {
  const hash = await client.writeContract({ address: CONTRACT, functionName, args, value: 0n });
  console.log(`${label}: ${hash}`);
  const receipt = await waitRejected(client, hash, label);
  const record = { label, hash, receipt: plain(receipt) };
  evidence.rejected_transactions.push(record);
  save();
  return record;
}

function commitment(caseId, claimant, salt, anchor, thesis) {
  const canonical = JSON.stringify([String(CHAIN), CONTRACT.toLowerCase(), String(caseId), claimant.toLowerCase(), salt, anchor, thesis]);
  return digest(Buffer.from(canonical));
}

function saltFor(label) {
  return digest(Buffer.from(`receipt-v2-live-${label}`));
}

function assertInvariant(treasury, label) {
  const accepted = BigInt(treasury.accepted_wei);
  const outstanding = BigInt(treasury.outstanding_wei);
  const dispatched = BigInt(treasury.external_dispatch_wei);
  if (accepted !== outstanding + dispatched) {
    throw new Error(`${label}: conservation invariant failed (${accepted} != ${outstanding} + ${dispatched})`);
  }
}

async function inspectExternalChildren(readClient, parent, recipient, label) {
  const children = await triggered(readClient, parent.hash, 20);
  const observations = [];
  for (const hash of children) {
    try {
      const transaction = await readClient.getTransaction({ hash });
      const evmReceipt = await raw('eth_getTransactionReceipt', [hash]);
      observations.push({
        hash,
        recipient: transaction.recipient || null,
        recipient_matches: String(transaction.recipient || '').toLowerCase() === recipient.toLowerCase(),
        value_credited: transaction.value_credited === true,
        evm_receipt: evmReceipt,
        evm_success: String(evmReceipt?.status || '').toLowerCase() === '0x1',
        transaction: plain(transaction),
      });
    } catch (error) {
      observations.push({ hash, observation_error: String(error?.message || error) });
    }
  }
  return { label, observable_children: children, observations };
}

async function main() {
  const readClient = createClient({ chain: studionet });
  const sponsor = await account(SPONSOR_NAME);
  const challenger = await account(CHALLENGER_NAME);
  const assessor = await account(ASSESSOR_NAME);
  if (new Set([sponsor.address.toLowerCase(), challenger.address.toLowerCase(), assessor.address.toLowerCase()]).size !== 3) {
    throw new Error('Sponsor, challenger and assessor must be three distinct wallets.');
  }
  const sponsorClient = createClient({ chain: studionet, account: sponsor });
  const challengerClient = createClient({ chain: studionet, account: challenger });
  const assessorClient = createClient({ chain: studionet, account: assessor });
  const config = await readJSON(readClient, 'get_config');
  const initialTreasury = await readJSON(readClient, 'get_treasury_status');
  if (config.architecture !== 'SINGLE_IC' || config.chain !== CHAIN || config.funding_enabled !== true || config.funding_mode !== 'NATIVE_GEN') {
    throw new Error(`Unexpected deployed config: ${JSON.stringify(config)}`);
  }
  if (BigInt(initialTreasury.accepted_wei) !== 0n || BigInt(initialTreasury.outstanding_wei) !== 0n) {
    const knownExistingCase = EXPECTED_EXISTING_ACCEPTED > 0n &&
      BigInt(initialTreasury.accepted_wei) === EXPECTED_EXISTING_ACCEPTED &&
      BigInt(initialTreasury.outstanding_wei) === EXPECTED_EXISTING_ACCEPTED &&
      BigInt(initialTreasury.credited_wei) === EXPECTED_EXISTING_CREDITED &&
      BigInt(initialTreasury.external_dispatch_wei) === 0n &&
      Number(initialTreasury.dispatch_count) === 0;
    if (!knownExistingCase) throw new Error(`Deployment treasury is not zero: ${JSON.stringify(initialTreasury)}`);
    evidence.preexisting_failed_case_treasury = initialTreasury;
  }
  evidence.wallets = { sponsor: sponsor.address, challenger: challenger.address, assessor: assessor.address };
  evidence.config = config;
  evidence.initial_treasury = initialTreasury;
  evidence.evidence_files = {
    positive_doc: await remoteDigest(POSITIVE_DOC),
    source: await remoteDigest(SOURCE),
    negative_doc: await remoteDigest(NEGATIVE_DOC),
  };
  save();

  async function createCase(label, docPath, sourcePath, claim, docDigest, sourceDigest) {
    const counts = await readJSON(readClient, 'get_counts');
    const id = Number(counts.cases) + 1;
    const create = await writeTx(sponsorClient, 'create_case', [
      `Live ${label} validation`, 'ometere123', 'receipt-', COMMIT,
      docPath, sourcePath, claim, docDigest, sourceDigest, 24,
    ], BOUNTY, `${label} create_case`);
    const state = await readJSON(readClient, 'get_case', [id]);
    if (state.status !== 'OPEN' || state.sponsor.toLowerCase() !== sponsor.address.toLowerCase()) {
      throw new Error(`${label}: case was not opened for sponsor`);
    }
    const item = { label, id, create, initial_case: state, bounty_wei: BOUNTY.toString(), bond_wei: BOND.toString() };
    evidence.cases.push(item);
    save();
    return item;
  }

  async function commitRevealAdjudicate(item, label, anchor, thesis) {
    const salt = saltFor(label);
    const hash = commitment(item.id, challenger.address, salt, anchor, thesis);
    item.commitment = { hash, salt, anchor, thesis };
    item.commit = await writeTx(challengerClient, 'commit_attempt', [item.id, hash], BOND, `${label} commit_attempt`);
    item.attempt_after_commit = await readJSON(readClient, 'get_attempt', [item.id]);
    item.unauthorized_reveal = await rejectedTx(sponsorClient, 'reveal_attempt', [item.attempt_after_commit.id, salt, anchor, thesis], `${label} unauthorized reveal`);
    item.reveal = await writeTx(challengerClient, 'reveal_attempt', [item.attempt_after_commit.id, salt, anchor, thesis], 0n, `${label} reveal_attempt`);
    item.adjudication = await writeTx(assessorClient, 'adjudicate_attempt', [item.attempt_after_commit.id], 0n, `${label} adjudicate_attempt`);
    item.final_attempt = await readJSON(readClient, 'get_attempt', [item.attempt_after_commit.id]);
    item.final_case = await readJSON(readClient, 'get_case', [item.id]);
    item.verdict_record = await readJSON(readClient, 'get_verdict', [item.attempt_after_commit.id]);
    item.sponsor_credit = await readValue(readClient, 'get_credit', [sponsor.address]);
    item.challenger_credit = await readValue(readClient, 'get_credit', [challenger.address]);
    item.treasury_after_settlement = await readJSON(readClient, 'get_treasury_status');
    assertInvariant(item.treasury_after_settlement, `${label} settlement`);
    save();
  }

  const positiveDoc = evidence.evidence_files.positive_doc.digest;
  const sourceDigest = evidence.evidence_files.source.digest;
  const negativeDoc = evidence.evidence_files.negative_doc.digest;

  const positive = await createCase('positive contradiction', POSITIVE_DOC, SOURCE, POSITIVE_CLAIM, positiveDoc, sourceDigest);
  await commitRevealAdjudicate(positive, 'positive', POSITIVE_ANCHOR,
    'The frozen source contradicts the published claim because withdraw clears the recipient credit before emitting the external transfer and records EMITTED_UNCONFIRMED.');
  if (positive.final_attempt.verdict !== 'CONTRADICTED' || positive.final_case.status !== 'WON') {
    throw new Error(`Positive case did not settle as CONTRADICTED/WON: ${positive.final_attempt.verdict}/${positive.final_case.status}`);
  }
  positive.duplicate_adjudication = await rejectedTx(assessorClient, 'adjudicate_attempt', [positive.final_attempt.id], 'positive duplicate adjudication');
  positive.treasury_before_withdraw = await readJSON(readClient, 'get_treasury_status');
  assertInvariant(positive.treasury_before_withdraw, 'positive before withdrawal');
  positive.withdraw = await writeTx(challengerClient, 'withdraw', [], 0n, 'positive challenger withdraw');
  positive.dispatch = await readJSON(readClient, 'get_dispatch', [1]);
  positive.challenger_credit_after_withdraw = await readValue(readClient, 'get_credit', [challenger.address]);
  positive.external_transfer = await inspectExternalChildren(readClient, positive.withdraw, challenger.address, 'positive withdrawal');
  positive.treasury_after_withdraw = await readJSON(readClient, 'get_treasury_status');
  assertInvariant(positive.treasury_after_withdraw, 'positive after withdrawal');
  positive.duplicate_withdraw = await rejectedTx(challengerClient, 'withdraw', [], 'positive duplicate withdrawal');
  save();

  const negative = await createCase('negative supported claim', NEGATIVE_DOC, SOURCE, NEGATIVE_CLAIM, negativeDoc, sourceDigest);
  await commitRevealAdjudicate(negative, 'negative-supported', NEGATIVE_ANCHOR,
    'The pinned source defines the sole ReceiptV2 contract and contains no secondary Intelligent Contract, so the published architecture claim is supported rather than contradicted.');
  if (negative.final_attempt.verdict !== 'NOT_ESTABLISHED' || negative.final_case.status !== 'OPEN') {
    throw new Error(`Negative case did not settle as NOT_ESTABLISHED/OPEN: ${negative.final_attempt.verdict}/${negative.final_case.status}`);
  }
  if (BigInt(negative.sponsor_credit) < BOND) throw new Error('Negative case did not credit the sponsor bond entitlement.');
  save();

  const neutral = await createCase('neutral digest mismatch', POSITIVE_DOC, SOURCE, POSITIVE_CLAIM, positiveDoc, WRONG_SOURCE_DIGEST);
  await commitRevealAdjudicate(neutral, 'neutral-digest-mismatch', POSITIVE_ANCHOR,
    'The source digest is intentionally wrong, so no authenticated contradiction can be established from the pinned evidence.');
  if (neutral.final_attempt.verdict !== 'INCONCLUSIVE' || neutral.final_case.status !== 'OPEN') {
    throw new Error(`Neutral case did not settle as INCONCLUSIVE/OPEN: ${neutral.final_attempt.verdict}/${neutral.final_case.status}`);
  }
  if (BigInt(neutral.challenger_credit) < BOND) throw new Error('Neutral case did not refund the challenger bond.');
  evidence.final_treasury = await readJSON(readClient, 'get_treasury_status');
  assertInvariant(evidence.final_treasury, 'final lifecycle');
  evidence.result = 'PASS';
  save();
  console.log(JSON.stringify({
    result: evidence.result,
    contract: CONTRACT,
    value_spent_gen: evidence.value_spent_gen,
    cases: evidence.cases.map(item => ({
      label: item.label,
      id: item.id,
      verdict: item.final_attempt?.verdict,
      case_status: item.final_case?.status,
      create: item.create.hash,
      commit: item.commit.hash,
      reveal: item.reveal.hash,
      adjudication: item.adjudication.hash,
      withdraw: item.withdraw?.hash || null,
    })),
    dispatch: positive.dispatch,
    external_transfer: positive.external_transfer,
    final_treasury: evidence.final_treasury,
  }, null, 2));
}

main().catch(error => {
  evidence.result = 'FAIL';
  evidence.error = String(error?.stack || error);
  save();
  console.error(`LIVE V2 LIFECYCLE FAILED: ${error?.message || error}`);
  process.exitCode = 1;
});
