# RECEIPT! V2: payout patterns audited from existing single-IC projects

**Reviewed 2026-10-12. Historical source analysis only, not payment certification.** No GEN moved by this document. The final V2 implementation uses the established native EVM interface pattern; live success/failure evidence belongs to the approved release run.

## Source-grounded findings

### VeilPact (ometere123/veilpact, `contracts/VeilPact.py`)

- `fund_pact` (around line 421) is `@gl.public.write.payable`; the payer must match the stored pact participant and exactly fund the expected amount.
- `_set_claimables_from_bps` (around line 352) calculates payer and payee claims deterministically, with the full escrow conserved by giving the payee the remainder after flooring the payer share.
- `claim_payer_refund` and `claim_payee_payment` (around lines 1018 and 1039) are pull payments. They check recipient identity, claimable >0, settlement applied, and a one-time claimed flag; then `_pay` uses `@gl.evm.contract_interface` `emit_transfer(value=...)`.
- **Failure distinction:** each method sets the claimed flag and stores final state *before* the external `emit_transfer` is conclusively verified. The public smoke test (`scripts/smoke-test.mjs`, around lines 285-304) confirms a finalized parent and `payeeClaimed=true` but does not reconcile the external child via `eth_getTransactionReceipt` with a recipient-specific successful payment.
- Therefore it demonstrates *normal pull claim construction* but **does not supply evidence-safe failed/ambiguous child compensation**.

### ShipBond (ometere123/shipbond, `contracts/ShipBondProtocol.py`)

- `settle` (around lines 318-375) freezes outcome, clears bond/reward accounting and sends one or two EOA transfers using `_Recipient(...).emit_transfer(value=...)`.
- This is a direct-push approach, **less recoverable than a separate entitlement and pull**: the settlement already becomes terminal before external child receipts are tracked.
- Deterministic splitting, role gates and the concept of a single settlement authority are useful; early terminalization is *not* a safe fix.

### RECEIPT! V1 (this repo, `contracts/PromiseVault.py`)

- `withdraw` (around lines 385-409) zeroes credited wei and reduces outstanding liabilities, then emits an external GEN transfer.
- Historical live evidence includes `NO_MAJORITY` on the GenLayer child and an independently verified successful EVM receipt for that same payout. Neither status alone is enough to infer the other.
- `tools/reconcile-withdrawal.mjs` gathers and classifies evidence **read-only**; no on-chain retry, recredit or receipt-authorized resolution exists.

## Confirmed protocol boundary

GenLayer official documentation:
- https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers
- https://docs.genlayer.com/developers/intelligent-contracts/features/messages

EOA payments are external finalized messages through the ghost/EVM layer. Internal value messages explicitly have no automatic failed-child value refund guarantee. The published EOA-send example establishes *supported syntax*, not a user-entitlement-preserving reconciliation protocol. A successful parent receipt is not proof of external payment.

## Good patterns to port

1. Single intelligent contract for **frozen evidence, commit/reveal, semantic adjudication, verdicts, credits, expiry, recovery**, eliminating callback and two-contract race conditions.
2. Separate `claimable` accounting from adjudication. Do not call outgoing payment while validators are still deciding. Freeze a unique claim ID, exact EOA, wei amount and immutable entitlement references.
3. Role-constrained pulls; never pay arbitrary caller-supplied destinations, never allow second settlement or duplicate dispatch of the same claim.
4. CONSERVATIVE terminal-state language: `CLAIMABLE` → `DISPATCHED_UNCONFIRMED` → externally `RECEIPT_VERIFIED`, `FAILED` or `AMBIGUOUS`. Only assert the latter classifications when independently evidenced.
5. Browser must check FINALIZED **and** successful GenVM execution for the parent, then separately check the external EVM child/receipt; retain all hashes and affected entitlement IDs.
6. Test failed external execution, child absent, inconsistent GEN/EVM status, successful EVM transfer with NO_MAJORITY, wrong recipient, wrong amount, duplicated observation, and delayed/ambiguous status.

## Essential unsolved problem

A receipt observer in an off-chain client does not authorize an on-chain monetary state transition. A second `retry` write can pay twice after ambiguous earlier success; a `recredit` write can also double-pay, and doing neither can strand an entitlement. Timeouts and balance deltas alone are not cryptographic proof of an individual recipient payment.

Do not treat this historical analysis as a substitute for the final lifecycle evidence. V2 retains exactly one Intelligent Contract and uses the platform `@gl.evm.contract_interface` receiver boundary; no adapter or second Intelligent Contract is added.

### StudioNet-specific blocker and smallest supported alternative

The official Studio limitations state that native transfers are simulated in Studio's local database, ghost contracts are not fully implemented, and EVM contract interaction beyond value transfers to EOAs is not implemented. External EVM messages also execute only after finalization and do not return a synchronous receipt to the parent contract. See [Studio limitations](https://docs.genlayer.com/developers/intelligent-contracts/tools/genlayer-studio/limitations), [value transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers), [messages](https://docs.genlayer.com/developers/intelligent-contracts/features/messages), and [finality](https://docs.genlayer.com/understand-genlayer-protocol/core-concepts/optimistic-democracy/finality).

That means no one-IC V2 implementation can honestly establish an authenticated per-recipient success, failure, or ambiguous outcome for an external GEN dispatch on this network today. The smallest supported alternative is the current non-custodial V2 verdict/entitlement protocol: adjudicate and record the result, keep custody disabled, and have users settle ordinary GEN transfers outside V2 after finalized evidence. Restoring automated custody requires a separately reviewed conventional EVM escrow/adapter or other protocol-verifiable authorization and finality channel; it must be treated as a second on-chain component and must not be hidden inside the "one contract" claim.

## Release criteria

- CI, exact 61999 CLI/GenVM lint, adversarial Direct Mode, current source hash and deployment parity.
- On-chain legitimate case create/fund/commit/reveal/assess; sponsor forfeiture and refund; missed reveal; timeout/recovery; fresh wallet/device restore.
- Explorers and EVM receipts for both success and forced failure/ambiguity, plus idempotent recovery from a genuinely failed payment *without* a duplicate possible payment.
- V2 frontend addresses and build source fixed; historical V1 claims/credits always remain accessible, never silently assumed transferred.
- No production release or GEN transactions without explicit human authorization.

The final funded branch opens native GEN cases and exposes recipient-only withdrawal; the remaining release gate is controlled live deployment and lifecycle evidence.
