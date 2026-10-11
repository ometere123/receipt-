# RECEIPT! — Big promises. Real proof. No excuses.

**RECEIPT!** is a source-grounded documentation-claim bounty application for GenLayer **Studionet 61999**. Sponsors place GEN behind one exact claim in an immutable Git commit; challengers stake a bond, commit then reveal a source-grounded contradiction; independent validators inspect pinned evidence; an Intelligent Contract settlement assigns credits and withdrawal rights.

The product has a custom, responsive **detective-club UI** with a case board, claim-funding workshop, side-by-side X-Ray source comparison, commit/reveal flow, investigator desk, receipt wall, wallet/network guard and transaction trail. **No Snaps, WalletConnect, server-side AI judgment, mocked live cases or external indexer are used.**

## Status and verification boundaries

The current source includes 81 deterministic contract tests, 15 exact-stack GenVM Direct Mode tests, full GenVM lint plus semantic validation for both contracts under the pinned `GENVM_VERSION=v0.3.0-rc7`, 14 frontend unit tests, 11 production-browser tests, a clean production dependency audit, and a successful production build. A real Studionet deployment, exact source parity, finalized two-wallet lifecycle, and one independently observed EVM payout receipt are recorded in [`docs/LIVE_VALIDATION.md`](docs/LIVE_VALIDATION.md). **Live funding remains BLOCKED** because the external-transfer failure/recovery path is not proven; the UI and replacement contract now enforce a funding-off default for both bounties and challenger bonds, but this is not an economic-safety certification.

## Architecture

```
Browser / injected EIP-1193 wallet (Next.js 16.4.0)
      │ reads finalized state / submits wallet-signed writes
      ▼
PromiseVault.py — claim registry + GEN funding + bond + credits
      │ finalized IC message: assess(case, anchor, thesis)
      ▼
ProofEngine.py — SHA-256 pinned source evidence, independent semantic Eq
      │ finalized IC message: on_verdict(attempt, result)
      ▼
PromiseVault.py — final payout entitlements; EVM external GEN transfer
```

Exactly two Python Intelligent Contracts. Both use the documented `py-genlayer` runtime header, with the intended CLI pinned **in the repository** to `genlayer@0.39.1`. Frontend SDK `genlayer-js@1.1.8` and patched Next.js `16.4.0`. Chain 61999 only. Full policy, state machine and security boundaries: [`docs/PROTOCOL.md`](docs/PROTOCOL.md).

## Requirements

- Node.js 22+, npm, Python 3.12+.
- An active, unlocked CLI wallet with Studionet GEN and an injected EIP-1193 browser wallet with GEN.
- Internet access for dependency install and the immutable GitHub raw evidence files.
- Deployed GenLayer Studionet at `https://studio.genlayer.com/api` (chain ID 61999).

## Local setup

```bash
# At repository root (installs LOCAL CLI 0.39.1)
npm ci
npm run cli -- --version
npm run cli -- network set studionet
npm run cli -- network info
npm run cli -- account show
npm run preflight

# Optional GenVM tooling
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -r requirements.txt
npm run lint:contracts
pytest -q tests/unit
pytest tests/direct -v  # actual GenVM, requires the testing-suite

# Frontend
cd frontend
npm ci
cp .env.example .env.local  # or create .env.local on Windows
npm run typecheck
npm test
npm run build
npm run dev
```

The frontend at `http://localhost:3000` displays a visible **deployment not configured** notice until both deployed addresses are present. This is intentional: it does not substitute fictional data.
`NEXT_PUBLIC_FUNDING_ENABLED` defaults to `false`; the UI also reads the vault's on-chain `funding_enabled` flag, so both gates must be explicitly true before a new bounty or challenger bond can be submitted. The replacement `PromiseVault` constructor intentionally defaults that flag to false and has no public enable switch. Existing case records, reveal/recovery flows and credits remain readable; withdrawal is still labeled `EMITTED_UNCONFIRMED`.

## 61999 deployment (real transactions)

Always inspect the active account and network first. The script requires `--deploy`, rechecks the RPC's `eth_chainId`, uses only `./node_modules/.bin/genlayer` and the **active CLI account**, deploys `ProofEngine.py`, deploys `PromiseVault.py` with the first address, then binds them once. It records each step to a gitignored crash-safe journal and does not silently duplicate unknown-status deployments.

```bash
npm run deploy:61999 -- --deploy
```

On a fully successful run it writes gitignored `receipt-deployment.manifest.json` and `frontend/.env.local`. If the exact CLI formatting or final execution status cannot be safely parsed, deployment halts and preserves the journal; **inspect the corresponding transaction instead of retrying blindly**. Do not put mnemonic/private keys in `.env.local`, the source tree or a public repo.

After deployment, independently verify each contract source by `npm run cli -- code <address>`, both transaction receipts, and the binding via `npm run cli -- call <engine_address> get_vault`. Confirm actual successful settlement before trusting the GEN payout path. Do not deploy a replacement contract or spend GEN for this repository without fresh explicit authorization; the current experimental deployment predates the contract-side funding default and remains restricted by the production frontend gate.

## First genuine case

A repository at a **real** immutable Git commit must contain (a) a docs file with a verbatim claim and (b) a bounded source file that can meaningfully confirm or contradict it. The `examples/fee-ceiling/` directory has a clearly **fictional local teaching fixture**; it cannot be funded against this source ZIP as if it were a real remote GitHub commit. Publish it as a Git commit in an actual repo if you wish to test the exercise.

You can inspect prospective pinned files before funding:

```bash
node tools/source-audit.mjs OWNER REPO 40CHARLOWERCOMMIT docs/policy.md src/policy.py 'Exact text from documentation'
```

The app checks both files' bytes and SHA256 before allowing a funded write. The chain re-verifies independently during challenge adjudication; a browser precheck is **not** a trusted oracle.

### Browser flow

1. **Fund a claim:** connect an injected wallet on 61999; enter a title, GitHub owner/repo, immutable SHA, documentation and source paths, exact claim, deadline and GEN prize. Verify raw source and fund it.
2. **Submit a challenge:** pick an OPEN case, inspect X-Ray, identify an exact source anchor and explain the contradiction. Wallet signs the exact GEN bond transaction.
3. **Preserve reveal proof:** export the reveal backup in **My desk**. Only the salt/anchor/thesis combination can reveal this commitment. Reveal before the two-hour deadline.
4. **Wait for true settlement:** track FINALIZED+successful GenVM execution of the reveal, then separately recheck child ProofEngine adjudication, verdict callback and final case state. Parent finality is not child finality.
5. **Withdraw:** the winning challenger or refundable sponsor has an on-chain credit. Wallet signs `withdraw`. Verify the emitted EVM GEN transfer separately.
6. **Failure recovery:** unrevealed attempts can be forfeited; stored but undelivered verdicts can be re-emitted; a pending challenge can request engine-authorized recovery after seven days; refund credits are released only after a finalized engine confirmation.

## Quality gates

- `pytest -q tests/unit`: contract state-machine mock tests, accounting, misuse, callback authentication, independent result mismatch, commits, refunds and recovery.
- `genvm-lint check` and `validate` for both contracts: GenVM static and semantic validation (required before deployment).
- `cd frontend && npm run typecheck && npm test && npm run lint && npm run build && npm run test:e2e`: frontend.
- `npm run preflight`: real `eth_chainId` check before deployment.
- **Live validation:** funded case, challenger bond, reveal, adjudication child, callback, two-wallet negative/inconclusive cases, and an independently observed tiny EVM payout receipt are recorded in [`docs/LIVE_VALIDATION.md`](docs/LIVE_VALIDATION.md). The external-transfer safety gate remains BLOCKED.

## Repository contents

```
contracts/        two standalone on-chain contracts
frontend/         custom Next.js app + direct EIP-1193 contract calls
examples/         fictional source-evidence teaching fixture
tools/            preflight, CLI deployment, immutable evidence audit
tests/            deterministic contract tests (local mock explicitly labeled)
docs/             protocol and test requirements
.github/          CI jobs for contract tests, GenVM validation and frontend
```

## Important security boundaries

- A source SHA proves an exact content blob, **not authorship or deployment authenticity**.
- `NOT_ESTABLISHED` is not a claim that the whole software system is safe.
- A single 20KB source file cannot prove behavior spanning unexamined modules. Such a case must be NOT_ESTABLISHED or scoped to a self-contained path.
- The bond can be lost if a challenger fails to reveal or supplies insufficient evidence. Use a small bounty to test the economics first.
- Server APIs, Snaps, back-authority, appeal overrides and administrative payout shortcuts are absent by design.
- GEN payout dispatch is **not** GEN receipt. External child transfers can fail without an automatic refund; verify the ghost/EVM transfer separately. Do NOT invite real deposits until this runtime limitation has a demonstrated safe operational policy.
- No security audit or economic-lifecycle certification is claimed. A real GenVM/Studionet verification is required before relying on custody or real stakes.

Source: GenLayer documentation for [Intelligent Contracts](https://docs.genlayer.com/developers/intelligent-contracts), [messages](https://docs.genlayer.com/developers/intelligent-contracts/features/messages), [GEN transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers), [wallet writes](https://docs.genlayer.com/developers/decentralized-applications/writing-data), and the [0.39.1 CLI](https://docs.genlayer.com/api-references/genlayer-cli).

MIT licensed. See `LICENSE`.


## Adversarial and deployment evidence improvements

- 81 deterministic unit checks and 15 exact-stack GenVM Direct Mode cases pass
  locally. Direct Mode uses the pinned testing-suite and is separate from the
  unit harness; it covers the pinned runner's `Response.status` fetch path,
  malformed model neutrality, callback authorization, duplicate messages,
  recovery arbitration and accounting conservation.
- The frontend passes 14 Vitest checks, typecheck, lint, a production build,
  and 11 Playwright checks against the built app. Browser tests cover the real
  no-deployment state, wallet wrong-chain warning, major surfaces, mobile
  layout, and WCAG 2A/2AA contrast and semantics across the primary views.
- Bind => `activate_engine` is a finalized asynchronous handshake. Funding is
  blocked until `PromiseVault.get_config.engine_ready == true`.
- Replacement `PromiseVault` constructors also set `funding_enabled = false`;
  both `create_case` and `commit_attempt` reject new value until a separately
  reviewed custody policy is available. There is no public contract method to
  turn it on.
- `npm run source:verify` refuses to claim parity without a real deployment
  manifest and retrieves on-chain source using finalized GenLayer RPC.
- `/api/build-info` reports commit and deployment metadata ONLY if supplied
  by environment, never invented.
- Root and frontend `package-lock.json` files are included and CI uses
  `npm ci`.
- Frontend production dependencies currently report zero high-severity audit
  findings with `npm audit --omit=dev --audit-level=high`.
- The fundamental GEN external-transfer loss risk described in the protocol
  remains unresolved. A dispatch ledger does NOT solve it. This package MUST
  NOT be marketed as economically production-safe until a live failure and
  success study establishes the operational boundary.
- The live deployment recorded below is the older `de3cd57...` source, so its
  contract state does not contain the replacement funding gate. Production
  currently uses `NEXT_PUBLIC_FUNDING_ENABLED=false` and the frontend warning
  to prevent new funding against that experimental deployment.
- Current deployment addresses, transaction hashes, exact source digests and
  the complete recorded two-wallet lifecycle are in
  [`docs/LIVE_VALIDATION.md`](docs/LIVE_VALIDATION.md). That document preserves
  the successful EVM receipt and the unresolved `NO_MAJORITY` child result
  separately; neither is silently promoted to a safe payout guarantee.

### Finalized timeout recovery

A 7-day timeout does **not** immediately refund a pending adjudication. The
vault requests recovery through a finalized child message; the engine must
first check for a materialized verdict or permanently tombstone the attempt.
Only a finalized engine response grants a bond refund. This avoids an
unreliable synchronous cross-contract view in the timeout path and prevents
late verdicts racing a refund. Test the full child ordering on Studionet.
