# V2 single-contract safety review

Status: **NOT_READY for live funding/withdrawals; safe fail-closed candidate.**

## Scope

The active V2 source is `contracts/ReceiptV2.py`. Exactly one Intelligent Contract contains the active state machine. The V1 pair remains only as historical source and read-only reference; V2 does not inherit its addresses, cases, credits or treasury.

## State ownership

ReceiptV2 owns:

- immutable case metadata, Git commit/path locators and SHA-256 digests;
- sponsor bounty and challenger bond accounting;
- direct-EOA, chain-61999 guarded commit/reveal;
- permissionless source-grounded adjudication and independent validator comparison;
- `CONTRADICTED`, `NOT_ESTABLISHED`, `OUT_OF_SCOPE` and `INCONCLUSIVE` normalization;
- terminal settlement, expiry, unrevealed-forfeit and seven-day pending recovery;
- wallet credits and accepted/credited/outstanding conservation counters;
- fail-closed funding and withdrawal policy.

No method calls another Intelligent Contract. There is no binding handshake, verdict callback, resend operation, tombstone, admin override or public funding activation method.

## State transition rules

```text
OPEN
 ├─ commit -> COMMITTED
 │            ├─ reveal -> PENDING
 │            └─ reveal timeout -> FORFEITED, sponsor gets bond
 ├─ expiry with no active attempt -> EXPIRED, sponsor gets bounty credit
 └─ PENDING
      ├─ adjudicate -> SETTLED + WON/OPEN/EXPIRED
      └─ seven-day timeout -> RECOVERED + OPEN/EXPIRED
```

Only the active attempt can transition a case. Assessment and entitlement creation are one V2 transaction after consensus. A stale assessment, duplicate settlement, late assessment or second recovery fails before changing state.

## Conservation invariant

For every accepted bounty or bond:

```text
accepted_wei == outstanding_wei
```

while external dispatch is disabled. `_credit()` increases `credited_wei` and a wallet entitlement but never creates value or reduces outstanding liability. The tests assert the invariant across every terminal branch. `total_dispatched` remains zero because the contract does not attempt an unsafe EVM payment.

## Payout boundary decision

The official GenLayer message/value-transfer model separates Intelligent Contract finality from the external EVM/ghost message. The current evidence does not provide an authenticated on-chain receipt callback or safe failed-child compensation for one IC on StudioNet. An off-chain observer cannot authorize a later recredit or clear operation without a duplicate-payment race.

Decision: **do not accept funds and do not emit withdrawals** until a protocol-supported proof channel is independently demonstrated on chain 61999. The smallest supported alternative is a non-custodial verdict/entitlement registry with an externally operated, separately reviewed payout rail; that would no longer be an exactly-one-component custody solution and requires explicit architectural approval.

## Release gates

Required before changing the status to READY:

1. Exact source parity against a finalized 61999 ReceiptV2 deployment.
2. Direct Mode and adversarial unit coverage for all transitions, malformed model results, digest drift, wrong caller/chain, duplicate/race attempts and conservation.
3. A protocol-supported, authenticated external-payment outcome channel with forced success, failure and ambiguous cases, proving no duplicate payout and no stranded entitlement.
4. V2 frontend preview verification with one address, no V1 writes, explicit withdrawal status and historical V1 read-only access.
5. Only after 1–4: production env update and any release alias change.

Until then, scores must remain `NOT_READY`; green local tests do not upgrade the payout boundary.
