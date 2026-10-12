# RECEIPT! V2 reviewer proof and audit matrix

Review date: 2026-10-12. Branch: `v2-single-contract-safety`. Starting ref: `6b8fa9ed11c4d8ef26d490677dceebaf7c2068f`.

## Reviewer conclusion

**NOT_READY for custody economics.** The one-contract adjudication/state-machine design is materially safer than the V1 callback topology, and local tests cover the fail-closed behavior. The decisive unresolved issue is external GEN payment finality and failure compensation on StudioNet 61999. V2 therefore accepts no live bounty/bond and emits no withdrawal.

## Method reference

| Method | Type | Guard / effect |
| --- | --- | --- |
| `get_config` | view | Reports `SINGLE_IC`, chain 61999, funding mode and withdrawal gate. |
| `get_counts`, `list_cases`, `get_case` | view | Paginated case registry. |
| `list_attempts`, `get_attempt` | view | Paginated commit/reveal/settlement records. |
| `get_credit` | view | Reads an internal wallet entitlement only. |
| `get_treasury_status` | view | Accepted, credited, outstanding and zero-dispatch counters. |
| `create_case` | payable | Direct EOA, 61999, immutable locator/digest validation; permanently gated while funding is false. |
| `commit_attempt` | payable | Direct EOA, 61999, one active attempt, exact 5%/minimum bond; permanently gated while funding is false. |
| `reveal_attempt` | write | Direct EOA, 61999, claimant identity and commitment hash. |
| `adjudicate_attempt` | write | Permissionless, pinned-file fetch/digest validation, model normalization, independent validator equality, atomic settlement. |
| `settle_unrevealed` | write | Permissionless after reveal deadline; forfeits bond once. |
| `recover_pending` | write | Permissionless after seven days; terminally refunds bond entitlement once. |
| `expire_case` | write | Permissionless after deadline with no active attempt; creates sponsor entitlement once. |
| `withdraw` | write | Always fails closed; no EVM transfer or state clearing. |

## Threat model

Trust boundaries are: injected wallet, GenLayer finality, validator nondeterminism, remote immutable GitHub bytes, external EVM/ghost messages, and the browser's local reveal backup. The browser is not trusted for verdicts, entitlements or source integrity.

| Threat | Control | Residual status |
| --- | --- | --- |
| Cross-contract callback race | One ReceiptV2 state machine; no child callback | Addressed locally; live finality still needed. |
| Stale/duplicate settlement | Active attempt + exact case/attempt status checks | Covered by unit tests. |
| Commitment substitution | Hash binds chain, contract address, case, claimant, salt, anchor and thesis | Covered by unit/frontend tests. |
| GitHub digest drift or unavailable source | Pinned SHA, size bounds, digest checks; neutral result on failure | Covered locally; live validator proof pending. |
| Prompt injection in files | Source/doc/thesis are explicitly untrusted data in the prompt | Adversarial live evidence pending. |
| Model flag/label mismatch | Normalization neutralizes incoherent output | Covered by unit tests. |
| Lost reveal | Local encrypted-by-browser backup/export guidance; unrevealed timeout forfeits bond | Product tradeoff, documented. |
| External payout failure | No dispatch and no funding until supported receipt channel | Unresolved protocol limitation; gate is active. |
| V1/V2 balance confusion | Separate address, explicit historical variables and read-only V1 viewer; no migration | Addressed in code and preview; V1 credits remain separate. |
| Wrong chain/wallet | Contract checks 61999/direct EOA; frontend checks injected chain | Covered locally; protected Vercel preview smoke verified. |

## Evidence ledger

| Evidence | Result | What it proves | What it does not prove |
| --- | --- | --- | --- |
| `python -m pytest -q tests/unit` | PASS: 104 | Deterministic V2 state, targeted verdict mutations and adversarial normalization checks | GenVM consensus or live payment. |
| `python -m pytest -q tests/direct` | PASS: 16 | Runtime-level deployment/read checks | StudioNet economic lifecycle. |
| `frontend npm run typecheck/test/lint/build` | PASS after V2 address refactor | Frontend compiles and presents one-contract fail-closed UX | Wallet signing or live chain state. |
| Playwright browser suite | PASS: 12 | Safety gate and explicit historical V1 viewer render in a built app | Wallet signing or live chain writes. |
| `npm run preflight` | PASS against live RPC | RPC is exactly 61999 | Contract deployment or payout. |
| `npm run source:verify` | PASS: exact bytes at `0xa61EC599...` | Exact deployed source bytes | Economic safety. |
| GitHub Actions run 38194079546 | PASS: frontend, browser, contract-unit and genvm-direct | Exact pushed commit passed repository gates | Live external payment recovery. |
| Live payout success/failure/ambiguity | NOT RUN for V2 | — | Must not be represented as pass. |

## Deployment proof fields

After a safe candidate deployment, `receipt-v2-deployment.manifest.json` must contain:

- chain `61999`, RPC `https://studio.genlayer.com/api`;
- exactly one `receipt_v2` address and finalized deployment transaction;
- `contracts/ReceiptV2.py` SHA-256;
- `funding_enabled: false` and `withdrawal_status: DISABLED_FAIL_CLOSED`;
- zero accepted, credited and outstanding treasury at genesis.

The manifest is ignored by Git and must be attached as review evidence rather than committed as authority. The source hash must be recomputed from the checked-out commit before every parity check.

## Vercel cutover policy

The Vercel project `receipt` has root directory `frontend`. Preview and Development use the finalized parity-verified V2 address; Production retains the V1 historical deployment until V2 satisfies the release gates. The latest verified V2 preview is `receipt-9mlooobkj-delealufejoel-4184s-projects.vercel.app` from commit `c7efd9e`. `NEXT_PUBLIC_FUNDING_ENABLED` remains `false` in every environment. No private key, CLI wallet secret or Vercel token belongs in the repository or a public variable.
