# RECEIPT! V2 — single Intelligent Contract migration (safety branch)

Status: **CANDIDATE / NOT DEPLOYED / NOT ECONOMICALLY SAFE FOR LIVE FUNDING**.

This branch adds `contracts/ReceiptV2.py` as an isolated one-contract candidate. The existing production deployment and its historical GEN credits stay untouched on Studionet 61999. No migration of funded cases, user credits or private keys is claimed.

## Motivation and exact structural change

- One `ReceiptV2` GenLayer Intelligent Contract holds frozen claim records, commit/reveal attempts, independent validator source adjudication, verdicts and deterministic sponsor/challenger credits.
- `reveal_attempt` stores the sealed case challenge as PENDING. Anyone can execute `adjudicate_attempt(attempt_id)`. The validator result and all credit changes are committed in **one finalized transaction**, without ProofEngine child messages or verdict callbacks.
- After seven days of non-finalized adjudication, `recover_pending` atomically refunds the challenger bond and makes the sponsor bounty refundable if expired. A finalized assessment and recovery are mutually exclusive state transitions in the same contract.
- The admitted evidence source URL, immutable Git SHA-256 and conservative model-vote normalization remain from V1.
- No admin overrides, recrediting of ambiguous payments or special settlement authorities have been introduced.

## What remains unsafe / deliberately blocked

- The current network's `emit_transfer` delivers an asynchronous external payment with no documented automatic failure refund. The official documentation explicitly warns that failed child transfers may not restore sent GEN. Moving the ledger into one Intelligent Contract does **not** cure the EVM boundary.
- Therefore V2 **always starts with `funding_enabled=False`**, exposes **no enable method**, and its `withdraw()` refuses all GEN transfers. The contract cannot lock user funds through its payable product entrypoints or mark an unconfirmed transfer as received. These restrictions are not the finished marketplace.
- Do not claim 5/5/5/5, deploy as the replacement economic frontend, advertise withdrawals, import V1 funded state, or turn on deposits until a separate independently reviewed receipt/failure-compensation design is proven against Studionet 61999.
- Historical V1 credits are still held at V1 and may be exposed to its older withdrawal path. Switching the frontend contract address must not hide these outstanding entitlements.

## Validation

- Repository-local CLI must remain `0.39.1`, chain `61999`, RPC `https://studio.genlayer.com/api`.
- Run `genvm-lint check contracts/ReceiptV2.py`, `pytest -q tests/unit/test_receipt_v2.py`, `pytest -q tests/direct/test_receipt_v2.py`.
- Run external adversarial scenarios: malformed model outputs, digest drift, wrong signer, duplicate attempts, boundary timing, lost consensus, late adjudication, recovery first, adjudication first, payment child success/failure/ambiguity.
- Perform a safety review of the monolith's GenVM storage/memory behavior before live deployment.
- Do not deploy using legacy `tools/deploy-studionet.mjs`: it intentionally deploys TWO old contracts.

## Release staging

This file is a migration artifact, not certification or release approval. The current `frontend/` remains on the original vault/engine pair until a complete tested V2 frontend, V2 deployment tool, source parity and historical-data access are ready.
