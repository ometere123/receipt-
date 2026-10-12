/**
 * Read-only reconciliation for an external PromiseVault withdrawal.
 *
 * This tool never writes to GenLayer, the EVM layer, or PromiseVault. It
 * records independently observable facts and classifies the dispatch off
 * chain. A classification is evidence for an operator, never a settlement
 * instruction and never an authenticated contract state transition.
 */
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionHashVariant } from 'genlayer-js/types';
import { pathToFileURL } from 'node:url';

export const RPC = 'https://studio.genlayer.com/api';
export const CHAIN_ID = 61999;
export const DEFAULT_PARENT = '0xc8ef0315e6edebacbb5cc8a70b68bdb442bd707f8939c050a246ec44771e2f28';
export const DEFAULT_VAULT = '0x6A5366Dcc45E6fb137534BA09f44632593c18880';
export const DEFAULT_DISPATCH_ID = 1;

export const CLASSIFICATIONS = Object.freeze({
  RECEIPT_VERIFIED: 'RECEIPT_VERIFIED',
  FAILED_UNRECOVERED: 'FAILED_UNRECOVERED',
  AMBIGUOUS: 'AMBIGUOUS',
  AWAITING_EVIDENCE: 'AWAITING_EVIDENCE',
});

const FINAL_STATUSES = new Set(['FINALIZED', '7']);
const SUCCESSFUL_RECEIPT = '0x1';
const FAILED_RECEIPT = '0x0';

function text(value) {
  return value === undefined || value === null ? '' : String(value);
}

function lower(value) {
  return text(value).toLowerCase();
}

function parseMaybeJson(value) {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function jsonSafe(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, jsonSafe(item)]));
  return value;
}

function decimal(value) {
  if (value === undefined || value === null || value === '') return null;
  try {
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
    const raw = String(value);
    return (raw.startsWith('0x') || raw.startsWith('0X')) ? BigInt(raw).toString() : BigInt(raw).toString();
  } catch { return null; }
}

function firstDefined(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function statusName(transaction) {
  return text(firstDefined(transaction?.status_name, transaction?.statusName, transaction?.status));
}

function resultName(transaction) {
  return text(firstDefined(transaction?.result_name, transaction?.txExecutionResultName, transaction?.result));
}

function recipientOf(transaction) {
  return firstDefined(transaction?.recipient, transaction?.to_address, transaction?.to, transaction?.toAddress) || null;
}

function amountOf(transaction) {
  return decimal(firstDefined(transaction?.value, transaction?.amount_wei, transaction?.amount));
}

function isFinal(transaction) {
  return FINAL_STATUSES.has(statusName(transaction).toUpperCase());
}

function receiptStatus(receipt) {
  return lower(firstDefined(receipt?.status, receipt?.receipt_status));
}

function logMentions(log, address) {
  const wanted = lower(address).replace(/^0x/, '').padStart(64, '0');
  return lower(log?.address) === lower(address) || (Array.isArray(log?.topics) && log.topics.some(topic => lower(topic).replace(/^0x/, '').padStart(64, '0') === wanted));
}

function receiptEvidence(receipt, transaction, expectedRecipient, expectedAmount) {
  if (!receipt) return { available: false, success: false, recipient_match: false, amount_match: false, log_match: false };
  const observedRecipient = firstDefined(receipt.to, receipt.to_address, transaction?.to_address, transaction?.recipient);
  const observedAmount = amountOf(transaction);
  const recipientMatch = Boolean(expectedRecipient && observedRecipient && lower(expectedRecipient) === lower(observedRecipient));
  const amountMatch = Boolean(expectedAmount !== null && observedAmount !== null && expectedAmount === observedAmount);
  const logMatch = Boolean(expectedRecipient && Array.isArray(receipt.logs) && receipt.logs.some(log => logMentions(log, expectedRecipient)));
  return {
    available: true,
    status: receiptStatus(receipt),
    success: receiptStatus(receipt) === SUCCESSFUL_RECEIPT,
    failed: receiptStatus(receipt) === FAILED_RECEIPT,
    recipient: observedRecipient || null,
    amount_wei: observedAmount,
    recipient_match: recipientMatch,
    amount_match: amountMatch,
    log_match: logMatch,
    logs: Array.isArray(receipt.logs) ? receipt.logs.length : 0,
  };
}

function uniqueHashes(hashes) {
  return [...new Set((hashes || []).filter(Boolean).map(String))];
}

/**
 * Classify one dispatch from a fully captured, read-only evidence snapshot.
 * The observedAt value is supplied by the caller so repeated reconciliation
 * of the same fixture can be compared byte-for-byte in tests.
 */
export function classifyDispatch({ dispatch, child, evmTransaction, evmReceipt, refundEvidence = false }) {
  const parsedDispatch = parseMaybeJson(dispatch) || null;
  const parsedChild = parseMaybeJson(child) || null;
  const usableEvmTransaction = evmTransaction?.unavailable ? null : evmTransaction;
  const usableEvmReceipt = evmReceipt?.unavailable ? null : evmReceipt;
  const expectedRecipient = firstDefined(parsedDispatch?.recipient, parsedChild?.recipient);
  const expectedAmount = decimal(firstDefined(parsedDispatch?.amount_wei, parsedChild?.value));
  const evidence = receiptEvidence(usableEvmReceipt, usableEvmTransaction, expectedRecipient, expectedAmount);
  const childStatus = statusName(parsedChild).toUpperCase();
  const childResult = resultName(parsedChild).toUpperCase();
  const notes = [];

  if (!parsedChild) {
    return { classification: CLASSIFICATIONS.AWAITING_EVIDENCE, notes: ['No triggered child transaction is observable yet.'], evidence };
  }
  if (!evidence.available) {
    if (childStatus === 'CANCELED' || childResult === 'ERROR' || childResult === 'FAILED') {
      return {
        classification: refundEvidence ? CLASSIFICATIONS.AMBIGUOUS : CLASSIFICATIONS.FAILED_UNRECOVERED,
        notes: [refundEvidence ? 'The child failed, but refund evidence changes this from a clean unrecovered classification.' : 'The child is terminally failed and no returned value is established.'],
        evidence,
      };
    }
    return { classification: CLASSIFICATIONS.AWAITING_EVIDENCE, notes: ['The child exists but its independent EVM receipt is not observable yet.'], evidence };
  }
  if (evidence.success && evidence.recipient_match && evidence.amount_match) {
    notes.push('Independent receipt status and recipient/value observations match the dispatch.');
    if (parsedChild.result_name && parsedChild.result_name !== 'MAJORITY_AGREE') {
      notes.push(`GenLayer child consensus is ${parsedChild.result_name}; this does not erase the receipt observation.`);
    }
    if (!evidence.log_match) notes.push('No log topic/address independently names the recipient; retain the raw receipt for review.');
    return { classification: CLASSIFICATIONS.RECEIPT_VERIFIED, notes, evidence };
  }
  if (evidence.failed) {
    return {
      classification: refundEvidence ? CLASSIFICATIONS.AMBIGUOUS : CLASSIFICATIONS.FAILED_UNRECOVERED,
      notes: [refundEvidence ? 'The external receipt failed, but refund evidence was supplied; no payout classification is asserted.' : 'The external receipt failed and returned value is not established.'],
      evidence,
    };
  }
  notes.push('The available receipt evidence is inconsistent with the dispatch recipient or amount.');
  return { classification: CLASSIFICATIONS.AMBIGUOUS, notes, evidence };
}

/**
 * Build a deterministic reconciliation report from captured observations.
 * Duplicate child identifiers are collapsed without changing their first
 * observed record. This function has no network or write side effects.
 */
export function reconcileSnapshot({
  parentHash,
  parent,
  childHashes = [],
  children = [],
  vaultAddress = DEFAULT_VAULT,
  dispatchId = DEFAULT_DISPATCH_ID,
  dispatch,
  claimantCreditWei,
  treasuryStatus,
  observedAt,
  rpc = RPC,
}) {
  const byHash = new Map(children.filter(Boolean).map(child => [String(child.hash || child.tx_id || child.transactionHash), child]));
  const hashes = uniqueHashes(childHashes.length ? childHashes : [...byHash.keys()]);
  const reconciledChildren = hashes.map(hash => {
    const record = byHash.get(hash) || {};
    const child = record.genlayer || record.child || record.transaction || record;
    const evmTransaction = record.evm_transaction || record.evmTransaction || null;
    const evmReceipt = record.evm_receipt || record.evmReceipt || null;
    const outcome = classifyDispatch({ dispatch, child, evmTransaction, evmReceipt, refundEvidence: record.refund_evidence === true });
    return {
      hash,
      genlayer: jsonSafe(child),
      status_name: statusName(child) || null,
      result_name: resultName(child) || null,
      recipient: recipientOf(child),
      amount_wei: amountOf(child),
      value_credited: child?.value_credited ?? null,
      evm_transaction: jsonSafe(evmTransaction),
      evm_receipt: jsonSafe(evmReceipt),
      read_errors: [record.evm_transaction_error, record.evm_receipt_error].filter(Boolean),
      classification: outcome.classification,
      notes: outcome.notes,
      receipt_evidence: outcome.evidence,
    };
  });
  return {
    schema_version: 1,
    observed_at: observedAt || new Date().toISOString(),
    evidence_source: { rpc, methods: ['genlayer-js.getTransaction', 'genlayer-js.getTriggeredTransactionIds', 'eth_getTransactionByHash', 'eth_getTransactionReceipt', 'PromiseVault.get_dispatch', 'PromiseVault.get_credit'] },
    parent: {
      hash: parentHash,
      genlayer: jsonSafe(parent || null),
      status_name: statusName(parent) || null,
      result_name: resultName(parent) || null,
      finalized: isFinal(parent),
      triggered_children: hashes,
    },
    vault: {
      address: vaultAddress,
      dispatch_id: dispatchId,
      dispatch: jsonSafe(parseMaybeJson(dispatch)),
      claimant_credit_wei: decimal(claimantCreditWei),
      treasury_status: jsonSafe(parseMaybeJson(treasuryStatus)) || null,
    },
    children: reconciledChildren,
    classifications: reconciledChildren.map(child => ({ hash: child.hash, classification: child.classification })),
    writes_performed: false,
    automatic_retry: false,
    automatic_recredit: false,
  };
}

async function rpcCall(url, method, params) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }) });
  const body = await response.json();
  if (!response.ok || body.error) throw new Error(`${method}: ${JSON.stringify(body.error || body)}`);
  return body.result;
}

function parseArgs(argv) {
  const args = { parentHash: DEFAULT_PARENT, vaultAddress: DEFAULT_VAULT, dispatchId: DEFAULT_DISPATCH_ID, rpc: RPC };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === '--parent') args.parentHash = argv[++i];
    else if (value === '--vault') args.vaultAddress = argv[++i];
    else if (value === '--dispatch-id') args.dispatchId = Number(argv[++i]);
    else if (value === '--rpc') args.rpc = argv[++i];
    else if (value === '--help') args.help = true;
  }
  return args;
}

export async function collectReconciliation({ parentHash = DEFAULT_PARENT, vaultAddress = DEFAULT_VAULT, dispatchId = DEFAULT_DISPATCH_ID, rpc = RPC, observedAt } = {}) {
  const client = createClient({ chain: studionet });
  const read = (address, functionName, args = []) => client.readContract({ address, functionName, args, transactionHashVariant: TransactionHashVariant.LATEST_FINAL });
  const parent = await client.getTransaction({ hash: parentHash });
  const childHashes = uniqueHashes(await client.getTriggeredTransactionIds({ hash: parentHash }));
  const dispatch = parseMaybeJson(await read(vaultAddress, 'get_dispatch', [dispatchId]));
  const claimant = dispatch?.recipient || null;
  const claimantCreditWei = claimant ? await read(vaultAddress, 'get_credit', [claimant]) : null;
  let treasuryStatus = null;
  try { treasuryStatus = parseMaybeJson(await read(vaultAddress, 'get_treasury_status')); } catch (error) { treasuryStatus = { unavailable: true, error: String(error.message || error) }; }
  const children = await Promise.all(childHashes.map(async hash => {
    const child = await client.getTransaction({ hash });
    let evmTransaction = null;
    let evmReceipt = null;
    let evmTransactionError = null;
    let evmReceiptError = null;
    try { evmTransaction = await rpcCall(rpc, 'eth_getTransactionByHash', [hash]); } catch (error) { evmTransactionError = String(error.message || error); }
    try { evmReceipt = await rpcCall(rpc, 'eth_getTransactionReceipt', [hash]); } catch (error) { evmReceiptError = String(error.message || error); }
    return { hash, child, evm_transaction: evmTransaction, evm_receipt: evmReceipt, evm_transaction_error: evmTransactionError, evm_receipt_error: evmReceiptError };
  }));
  return reconcileSnapshot({ parentHash, parent, childHashes, children, vaultAddress, dispatchId, dispatch, claimantCreditWei, treasuryStatus, observedAt, rpc });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/reconcile-withdrawal.mjs [--parent HASH] [--vault ADDRESS] [--dispatch-id N] [--rpc URL]');
  } else {
    collectReconciliation(args).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => {
      console.error(`READ-ONLY RECONCILIATION FAILED: ${error.message || error}`);
      process.exitCode = 1;
    });
  }
}
