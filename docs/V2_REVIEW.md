# RECEIPT! V2 reviewer proof and audit matrix

Review date: 2026-10-12. Branch: `v2-final-funded`. Starting ref: `467314a4575f82844bf55b942af4302fd149a7b7`.

## Reviewer conclusion

The funded V2 implementation is locally complete and ready for a controlled StudioNet release. Exactly one active Intelligent Contract, `contracts/ReceiptV2.py`, owns adjudication, accounting and the native GEN withdrawal dispatch. Final deployment and live economic evidence are pending explicit approval for signer, transaction scope and maximum test expenditure.

The prior fail-closed deployment is historical candidate evidence only and is not the final funded address.

## Method reference

| Method | Type | Guard / effect |
| --- | --- | --- |
| `get_config` | view | Reports `SINGLE_IC`, chain 61999, native funding and EVM dispatch status. |
| `get_counts`, `list_cases`, `get_case` | view | Paginated case registry. |
| `list_attempts`, `get_attempt` | view | Paginated commit/reveal/settlement records. |
| `get_credit` | view | Reads an internal wallet entitlement. |
| `get_treasury_status` | view | Accepted, credited, outstanding, dispatch and ghost-balance counters. |
| `get_dispatch` | view | Reads the explicit recipient/amount/status dispatch record. |
| `create_case` | payable | Direct EOA, 61999, immutable locator/digest validation and native GEN bounty acceptance. |
| `commit_attempt` | payable | Direct EOA, 61999, one active attempt and exact 5%/minimum native GEN bond. |
| `reveal_attempt` | write | Direct EOA, 61999, claimant identity and commitment hash. |
| `adjudicate_attempt` | write | Permissionless pinned-file fetch, model normalization, independent validator equality and atomic settlement. |
| `settle_unrevealed` | write | Permissionless after reveal deadline; forfeits bond once. |
| `recover_pending` | write | Permissionless after seven days; terminally refunds bond entitlement once. |
| `expire_case` | write | Permissionless after deadline with no active attempt; creates sponsor entitlement once. |
| `withdraw` | write | Recipient-only native GEN EVM dispatch; clears credit once and records `EMITTED_UNCONFIRMED`. |

## Threat model

Trust boundaries are: injected EIP-1193 wallet, GenLayer finality, validator nondeterminism, remote immutable GitHub bytes, the external EVM child and browser-local reveal backup. The browser is not trusted for verdicts, entitlements or source integrity.

| Threat | Control | Local result |
| --- | --- | --- |
| Cross-contract callback race | One ReceiptV2 state machine; no child IC callback | Addressed by architecture. |
| Stale/duplicate settlement | Active attempt + exact case/attempt status checks | Direct Mode covered. |
| Commitment substitution | Hash binds chain, contract, case, claimant, salt, anchor and thesis | Unit/frontend covered. |
| GitHub digest drift/unavailable source | Pinned SHA, size bounds and neutral result on failure | Direct Mode covered. |
| Prompt injection in files | Evidence is untrusted data in the adjudicator prompt | Unit coverage retained. |
| Model flag/label mismatch | Normalization neutralizes incoherent output | Unit/Direct Mode covered. |
| Lost reveal | Browser export/import backup; unrevealed timeout forfeits bond | Product tradeoff documented. |
| Withdrawal recipient substitution | Credit lookup uses `msg.sender`; direct-EOA guard | Unit/Direct Mode covered. |
| External receipt ambiguity | Explicit `EMITTED_UNCONFIRMED`; no retry or re-credit | Must be evidenced in live run. |
| V1/V2 balance confusion | Separate address and read-only historical V1 viewer | Frontend path preserved. |
| Wrong chain/wallet | Contract checks 61999/direct EOA; frontend checks injected chain | Direct Mode covered. |

## Evidence ledger

| Evidence | Result | What it proves | What it does not prove |
| --- | --- | --- | --- |
| `python -m pytest -q tests/unit` | PASS: 106 | Deterministic state machine, verdict normalization and accounting | StudioNet consensus or live payment. |
| `python -m pytest -q tests/direct` | PASS: 25 | Real pinned GenVM execution, source mocks, funding, dispatch and adversarial flows | StudioNet economic lifecycle. |
| `npm run lint:contracts` | PASS: 3 checks | ReceiptV2 linter/semantic validation | Live deployment. |
| Frontend typecheck/Vitest/build | PASS: typecheck, 14 tests, production build | Wallet/UI/configuration implementation compiles | Wallet signing or live chain state. |
| Reconciliation fixtures | PASS: 5 | Read-only evidence classification remains idempotent | A live transfer. |
| Dependency audit | PASS: root and frontend report 0 vulnerabilities | Current package audit | Future dependency updates. |
| [GitHub Actions 38212267394](https://github.com/ometere123/receipt-/actions/runs/38212267394) | PASS on `02ed7224e115c95384ae54712b9e31f005ef7395` | Exact-commit contract, frontend, browser and GenVM Direct Mode gates | StudioNet deployment or GEN lifecycle. |
| Final StudioNet deployment | PENDING approval | — | No final address is claimed. |
| Live positive/neutral/negative lifecycle | PENDING deployment | — | Must not be represented as pass. |

## Required live release evidence

After approval, capture the finalized deployment, source parity and zero genesis treasury; then run sponsor funding, challenger commit/reveal, a positive adjudication, recipient withdrawal and independent external child receipt inspection. Also capture `NOT_ESTABLISHED`, malformed/unavailable neutral, malicious leader, duplicate/unauthorized, timeout/recovery and wrong-wallet/network evidence. Record transaction hashes, method names, expected/observed results, and any failed external child without retrying.

## Vercel policy

The Vercel project is `delealufejoel-4184s-projects/receipt` with root directory `frontend`. The final env must point to the approved funded V2 address and set `NEXT_PUBLIC_FUNDING_ENABLED=true`; historical V1 variables remain read-only. Production promotion is a post-live-validation step, not a substitute for it. No private key, CLI wallet secret or Vercel token belongs in the repository or a public variable.
