# Validation and proof-of-operation requirements

This document is a test specification and evidence ledger, **not** a record claiming a deployed application or passed Studionet lifecycle. Do not invent or backfill transactions.

## Current local evidence

- Exact Python environment: Python 3.12, `genlayer-py 0.18.0`, `genlayer-test 0.29.2`, `genvm-linter 0.11.0`.
- `pytest -q tests/unit`: 53 passed.
- `pytest -q tests/direct`: 11 passed in genuine Direct Mode, including a
  real GenVM `Response.status` source-fetch/adjudication path, malformed-model
  neutrality, callback authorization, duplicate settlement, recovery
  confirmation and financial-conservation flows.
- Fast `genvm-lint lint --json`: both contracts pass all 3 checks.
- `npm run lint:contracts`: full lint and semantic validation pass for both contracts with `GENVM_VERSION=v0.3.0-rc7`; the output notes that a newer runner exists, but the pinned target is deliberate for the 61999 toolchain.
- Frontend: typecheck passed, Vitest 14 passed, ESLint passed, `npm audit --omit=dev --audit-level=high` reports 0 high-severity findings, production build passed, and Playwright 10 passed against the built app. The CSS has existing Autoprefixer flex-start/flex-end compatibility warnings.
- No deployment manifest or deployed addresses exist in this source package;
  live source parity, child-message lifecycle, consensus, and external GEN
  payout receipt remain unverified until a deployment run records them.

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
6. Deploy both contracts from immutable source with CLI, wait for FINALIZED **and** successful GenVM execution, bind engine once, re-read binding and on-chain code; preserve transaction IDs and source digests.

## Independent 61999 evidence matrix

| Action | Expected verification | Evidence |
| --- | --- | --- |
| Deploy ProofEngine | FINALIZED + execution SUCCESS; source/schema match | explorer tx, code and SHA |
| Deploy PromiseVault | FINALIZED + execution SUCCESS; source/schema match | explorer tx, code and SHA |
| Bind Engine → Vault | one-time binding, no rebinding | explorer tx, `get_vault` read |
| Sponsor funds claim | GEN value actually received; immutable fields and hashes match | tx and `get_case` final read |
| Attacker tries wrong chain | blocked before EIP-1193 write | browser capture |
| Challenger commits exact bond | wallet-signed value, case marked active after finalization | tx, case/attempt view |
| Challenger reveals | commitment verified; correct finalized child assess appears | reveal tx plus child tx |
| Independent validation | validators actually fetch same digest and substantively evaluate source and claim | traces, malicious leader scenarios |
| Engine stores verdict | storage record is final; callback emitted on finalization | child tx, `get_verdict` |
| Vault settles | only authorized callback, no premature payout or double settlement | callback tx, case/credit views |
| Challenger withdraws GEN | confirmed external payment, not just claimed by UI | payout parent + ghost/EVM transfer evidence |
| Invalid case | sponsor receives bond; case reopens | separate distinct-wallet tx trail |
| Inconclusive case | challenger bond refunded; bounty remains reserved | separate trail |
| Timeout cases | forfeiture, finalized recovery request, engine verdict-vs-recovery arbitration, tombstone, confirmation callback, expired sponsor refund | separate trails |
| Browser refresh | committed data and pending tx recover; no duplicate write | screen recording + tx IDs |
| Responsive and a11y | phone, desktop, contrast, keyboard dialog, reduced motion | manual UI checklist |

The protocol's message fan-out and external GEN transfers are the most important unresolved real-network risks before any claim of complete implementation. No independent score or mainnet guarantee is implied by passing the local tests.

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

EXIGENT deliberately removed external GEN payouts after finding that a failed
child transfer is not reliably reimbursed. RECEIPT! retains bounties as a
core use case; **this risk remains a hard economic-safety gate**. The added
`EMITTED_UNCONFIRMED` ledger does NOT repair failed transfers. Live proof
requires finalized execution state and EOA receipt; if transfers fail or
are untraceable, stop before promoting funding.

The asynchronous timeout-recovery handshake avoids a `LATEST_FINAL` engine
read inside PromiseVault. Test adjudication-vs-recovery interleavings in
GenVM Direct Mode, plus a 61999 real child lifecycle. Also obtain frontend
Next build, Vitest, Playwright, real network browser session and source-byte
parity. **Unit mocks and syntax-only parsing cannot substitute for them.**
