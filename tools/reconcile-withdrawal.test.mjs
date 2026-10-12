import assert from 'node:assert/strict';
import test from 'node:test';
import { CLASSIFICATIONS, reconcileSnapshot } from './reconcile-withdrawal.mjs';

const PARENT = '0xparent';
const CHILD = '0xchild';
const DUPLICATE = '0xduplicate';
const RECIPIENT = '0xB845a69860ba4CDf19CfDC5AfbAF2e20b6bE86b0';
const VAULT = '0x6A5366Dcc45E6fb137534BA09f44632593c18880';
const DISPATCH = { id: 1, recipient: RECIPIENT.toLowerCase(), amount_wei: '1100000000000000', status: 'EMITTED_UNCONFIRMED', created_at: 1791749249 };

function baseChild(hash = CHILD) {
  return {
    hash,
    child: {
      tx_id: hash,
      status_name: 'FINALIZED',
      result_name: 'NO_MAJORITY',
      recipient: RECIPIENT,
      value: 1100000000000000,
      value_credited: true,
    },
    evm_transaction: { hash, to_address: RECIPIENT, value: 1100000000000000 },
    evm_receipt: {
      transactionHash: hash,
      status: '0x1',
      to: RECIPIENT,
      logs: [{ address: RECIPIENT, topics: [hash, `0x${RECIPIENT.slice(2).padStart(64, '0')}`] }],
    },
  };
}

function report(children, childHashes = children.map(child => child.hash)) {
  return reconcileSnapshot({
    parentHash: PARENT,
    parent: { hash: PARENT, status_name: 'FINALIZED', result_name: 'MAJORITY_AGREE', triggered_transactions: childHashes },
    childHashes,
    children,
    vaultAddress: VAULT,
    dispatchId: 1,
    dispatch: DISPATCH,
    claimantCreditWei: '0',
    observedAt: '2026-10-12T00:00:00.000Z',
  });
}

test('classifies a successful EVM receipt while preserving NO_MAJORITY', () => {
  const result = report([baseChild()]);
  assert.equal(result.children[0].classification, CLASSIFICATIONS.RECEIPT_VERIFIED);
  assert.equal(result.children[0].result_name, 'NO_MAJORITY');
  assert.match(result.children[0].notes.join(' '), /NO_MAJORITY/);
  assert.equal(result.writes_performed, false);
  assert.equal(result.automatic_retry, false);
  assert.equal(result.automatic_recredit, false);
});

test('classifies a demonstrably failed external receipt as unrecovered', () => {
  const failed = baseChild();
  failed.evm_receipt = { transactionHash: CHILD, status: '0x0', to: RECIPIENT, logs: [] };
  const result = report([failed]);
  assert.equal(result.children[0].classification, CLASSIFICATIONS.FAILED_UNRECOVERED);
});

test('classifies conflicting recipient evidence as ambiguous', () => {
  const ambiguous = baseChild();
  ambiguous.evm_transaction.to_address = '0x0000000000000000000000000000000000000001';
  ambiguous.evm_receipt.to = ambiguous.evm_transaction.to_address;
  const result = report([ambiguous]);
  assert.equal(result.children[0].classification, CLASSIFICATIONS.AMBIGUOUS);
});

test('classifies a missing child as awaiting evidence', () => {
  const result = report([], [CHILD]);
  assert.equal(result.children[0].classification, CLASSIFICATIONS.AWAITING_EVIDENCE);
});

test('deduplicates repeated child identifiers and remains idempotent', () => {
  const first = report([baseChild(), baseChild(DUPLICATE)], [CHILD, CHILD, DUPLICATE]);
  const second = report([baseChild(), baseChild(DUPLICATE)], [CHILD, CHILD, DUPLICATE]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.parent.triggered_children, [CHILD, DUPLICATE]);
  assert.equal(first.children.length, 2);
});
