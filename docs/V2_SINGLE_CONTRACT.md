# V2 single-contract safety review

Status: **Funded implementation complete; final StudioNet deployment pending explicit signer/scope/spend approval.**

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

## Release gates

Required before changing the status to READY:

1. Exact source parity against a finalized 61999 ReceiptV2 deployment.
2. Direct Mode and adversarial unit coverage for all transitions, malformed model results, digest drift, wrong caller/chain, duplicate/race attempts and conservation.
3. Finalized StudioNet lifecycle: sponsor, challenge, positive adjudication, recipient dispatch, external child evidence, and conservation readback.
4. Negative/neutral cases: malformed or unavailable source, `NOT_ESTABLISHED`, malicious leader, duplicate/unauthorized actions, timeout recovery, wrong wallet/network.
5. V2 frontend verification with one address, native withdrawal status and historical V1 read-only access; only then update production env/aliases.

Until then, scores must remain `NOT_READY`; green local tests do not upgrade the payout boundary.
