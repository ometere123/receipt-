# V2 single-contract safety review

Status: **Verified funded V2 release on StudioNet 61999.**

The active deployment is `0xc0C20aDd6E691a6695B4B93F0A044739A91cbC5F`, deployed
in transaction `0x9843c5912cf95c5fd292abf12915923004732ba3c2039eab67b1ec309105fae5`.
The deployed source matches SHA-256
`d57a19a19846f385c263deb04d7216d3a378ee2b4a153220e0710c85f0777cc0` exactly.
Finalized sponsor/challenger lifecycle, positive/negative/neutral outcomes,
withdrawal evidence and conservation readback are recorded in
[`V2_LIVE_RELEASE_EVIDENCE.md`](V2_LIVE_RELEASE_EVIDENCE.md).

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
- native GEN funding through payable entrypoints;
- recipient-only native GEN withdrawal dispatch and explicit dispatch records.

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

Before a recipient withdrawal:

```text
accepted_wei == outstanding_wei
```

`_credit()` increases `credited_wei` and a wallet entitlement but never creates value or reduces outstanding liability. A successful withdrawal dispatch clears the recipient credit, reduces `outstanding`, increments `total_dispatched`, and emits `emit_transfer(value=amount)`. After dispatch:

```text
accepted_wei == outstanding_wei + total_dispatched
```

The dispatch record is `EMITTED_UNCONFIRMED`: it proves the contract emitted the external transfer request, not that the child receipt has already been observed by contract code. The contract performs no automatic retry or re-credit.

## Payout boundary

Native GEN funding and the ordinary recipient withdrawal path are part of V2. The parent Intelligent Contract transaction and the external EVM child are separate observable records. V2 therefore exposes the dispatch status honestly and leaves child receipt observation to deployment/reconciliation evidence; it does not infer child success, issue an automatic retry, or perform an untrusted re-credit.

## Verified release evidence

The release gates are satisfied by exact source parity, green unit/Direct Mode,
frontend and browser checks, the finalized StudioNet lifecycle, positive,
negative and neutral adjudication cases, protected-action rejection evidence,
recipient-restricted withdrawal evidence, conservation readback, and production
frontend verification. The external child remains a separately observed
boundary: V2 records `EMITTED_UNCONFIRMED` and does not infer child success or
perform automatic retry or re-credit.
