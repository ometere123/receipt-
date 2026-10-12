# Validation and proof-of-operation requirements

This document is a test specification and evidence ledger, **not** an economic-safety certification. The final funded source is locally validated; final StudioNet deployment and lifecycle evidence remain pending explicit signer/scope/spend approval. Do not invent or backfill transactions.

## Current local evidence

- Exact repository toolchain: GenLayer CLI `0.39.1`, GenVM Direct Mode `genlayer-test 0.29.2`.
- `pytest -q tests/unit`: 106 passed, including malformed-model, prompt-injection,
  targeted verdict-field mutations, validator-disagreement, boundary, unavailable-source
  and conservation coverage for the active V2 contract.
- `pytest -q tests/direct`: 25 passed in genuine Direct Mode, including native
  funding, source-fetch adjudication, neutral outcomes, recipient dispatch,
  recovery, duplicates and wrong wallet/network checks.
- `npm run lint:contracts`: the active `ReceiptV2.py` passes all 3 lint and
  semantic-validation checks for the pinned 61999 toolchain.
- Frontend: typecheck passed, Vitest 14 passed, and production build passed.
  The desk exposes claimable GEN, recipient withdrawal and dispatch status;
  the historical V1 viewer remains read-only.
- `npm run test:reconciliation`: 5 deterministic read-only payout-reconciliation fixtures pass, covering a successful receipt with `NO_MAJORITY`, a failed receipt, conflicting evidence, a missing child, and duplicate/idempotent observations. `npm run reconcile:withdrawal` performs the same collection against the pinned Studionet RPC without writes, retries or recredits.
- The previous fail-closed V2 deployment is superseded by this funded source;
  no final funded address or deployment transaction is claimed yet.
  Historical V1 lifecycle and payout evidence remains in
  [`LIVE_VALIDATION.md`](LIVE_VALIDATION.md) and is not V2 proof.
- Case 3's assessment child is materially `CANCELED` with `NO_MAJORITY`, zero
  committed/revealed votes, no appeal bond, and no credited value. The current
  Studionet endpoint does not expose `gen_getTransactionLifecycle`, and the
  local CLI cannot calculate an appeal bond because the required fee-manager
  and rounds-storage addresses are absent. This is read-only evidence that no
  supported appeal action was proven for the canceled child.
- The frontend and contract use native GEN funding and recipient-only EVM
  dispatch. A dispatch is recorded as `EMITTED_UNCONFIRMED`; the external child
  receipt is independently observed and never retried or re-credited by V2.

## Checks already implementable offline

```sh
python -m py_compile contracts/ProofEngine.py contracts/PromiseVault.py
pytest -q tests/unit
pytest tests/direct -v  # separate GenVM Direct Mode suite, not an API mock
node --check tools/preflight.mjs
node --check tools/deploy-studionet.mjs
```

`tests/unit/` uses an explicitly named deterministic API mock for state-machine checks; `tests/direct/` contains real GenVM Direct Mode tests and is NOT the mock. It does not execute GenVM, network consensus, actual EVM transfers or the GenLayer TS SDK. These important checks must be conducted on an environment with real dependencies installed.

## Mandatory environment checks

1. Node 22+, Python 3.12+, active 0.39.1 **repository-local** `genlayer` CLI.
2. Run `genvm-lint check contracts/ProofEngine.py` and `genvm-lint check contracts/PromiseVault.py` (including semantic schema extraction and type checking).
3. Run GenLayer Test Direct Mode with wallet/source fetch and malicious leader tests; verify the SDK pinned in each contract matches the target GenVM runtime. Do not present pytest's local API mock as equivalent to Direct Mode.
4. Run frontend `npm run typecheck`, `npm test`, `npm run lint`, `npm run build` after installing dependencies.
5. Run Studionet RPC and account preflight; verify chain 61999, exact CLI 0.39.1, compatible GenVM and wallet.
6. Deploy exactly one active `ReceiptV2` contract from immutable source with the repository-local CLI, wait for FINALIZED **and** successful GenVM execution, re-read configuration and on-chain code, and preserve the deployment transaction and source digest. The V1 `ProofEngine`/`PromiseVault` pair is historical read-only evidence and must not be redeployed or bound as part of V2.

## Independent 61999 evidence matrix

| Action | Expected verification | Evidence |
| --- | --- | --- |
| Deploy ReceiptV2 | FINALIZED + execution SUCCESS; one address, schema and source match | [`V2_EVIDENCE.md`](V2_EVIDENCE.md), deployment tx, code and SHA |
| Read ReceiptV2 configuration | `SINGLE_IC`, chain 61999, native funding, EVM dispatch status | finalized read and treasury status |
| Sponsor funds claim | payable native GEN `create_case` | finalized transaction and case/treasury readback |
| Attacker tries wrong chain | blocked before EIP-1193 write | browser capture |
| Challenger commits exact bond | payable native GEN `commit_attempt` | finalized transaction and attempt/treasury readback |
| Challenger reveals | commitment verified; correct finalized child assess appears | reveal tx plus child tx |
| Independent validation | validators actually fetch same digest and substantively evaluate source and claim | traces, malicious leader scenarios |
| ReceiptV2 stores verdict | normalized result and entitlement update in one contract transaction | `get_verdict`, `get_attempt`, `get_credit` |
| ReceiptV2 withdrawal | recipient-only EVM dispatch; credit clears once and conservation holds | dispatch record, external child receipt and treasury readback |
| Historical V1 payout | preserved only as read-only evidence; not a V2 safety proof | [`LIVE_VALIDATION.md`](LIVE_VALIDATION.md) |
| Invalid/inconclusive/timeout cases | local and Direct Mode state-machine coverage | 106 unit tests, 25 Direct Mode tests |
| Browser refresh | committed data and pending tx recover; no duplicate write | screen recording + tx IDs |
| Responsive and a11y | phone, desktop, contrast, keyboard dialog, reduced motion | manual UI checklist |

The external child receipt remains a separately evidenced boundary. No independent score or mainnet guarantee is implied by passing the local tests.

## Adversarial source cases

- Git SHA truncated, uppercase, nonexistent, moving reference.
- Path traversal, URL-encoded traversal, fake blob link, redirect, 404, rate-limit response, timeouts and malformed UTF-8.
- Different files at same commit, mismatched content SHA256, oversized document/source.
- Exact snippet present but dead code, comment, fixture, or nonreached branch.
- Multiple restrictions in other files: should fail proof completeness, never assume missing code.
- Malicious instructions embedded in source or documentation.
- Leader/validator disagree on a single substantive verdict dimension.
- Accepted transaction followed by failed execution, appeal, dropped child callback.
- Sponsor races deadline with a legitimately committed challenge.
- Different wallet attempts to reveal; duplicate commitment; stale replay verdict.
- External transfer failure, fee insufficiency, RPC mismatch, wallet rejection and wallet changes.

## Additional mandatory risks found by EXIGENT comparison

The `EMITTED_UNCONFIRMED` ledger records the ordinary external-transfer
boundary without claiming that it is an authenticated receipt. Live proof
requires finalized execution state and EOA receipt evidence; if a transfer
fails or is untraceable, record the method/transaction and stop retries rather
than silently re-crediting or paying twice.

The asynchronous timeout-recovery handshake avoids a `LATEST_FINAL` engine
read inside PromiseVault. Test adjudication-vs-recovery interleavings in
GenVM Direct Mode, plus a 61999 real child lifecycle. Also obtain frontend
Next build, Vitest, Playwright, real network browser session and source-byte
parity. **Unit mocks and syntax-only parsing cannot substitute for them.**

The read-only reconciliation tool is intentionally separate from settlement:
it records parent/child GenLayer state, EVM transaction/receipt evidence,
`value_credited`, `get_dispatch()` and claimant credit, then emits an
off-chain classification. It never writes `PAID`, retries a child or restores
credit. The historical deployment's observed payout is therefore reported as
both `RECEIPT_VERIFIED` by independent receipt evidence and a GenLayer child
`NO_MAJORITY`, not silently normalized into one consensus result.
