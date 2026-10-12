# V2 evidence manifest

Recorded 2026-10-12 for branch `v2-final-funded`. This file separates automated implementation evidence from the finalized StudioNet release evidence.

## Source and chain

| Field | Value |
| --- | --- |
| Active source | `contracts/ReceiptV2.py` |
| Network target | GenLayer StudioNet, chain `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Architecture | `SINGLE_IC` |
| Funding mode | `NATIVE_GEN` |
| Withdrawal status | `EVM_DISPATCH_EMITTED_UNCONFIRMED` |
| Final funded address | `0xc0C20aDd6E691a6695B4B93F0A044739A91cbC5F` |
| Final deployment tx | `0x9843c5912cf95c5fd292abf12915923004732ba3c2039eab67b1ec309105fae5` |
| Final source parity | `d57a19a19846f385c263deb04d7216d3a378ee2b4a153220e0710c85f0777cc0`, exact bytes |

The previous fail-closed deployment at `0xa61EC599648782b2286eccd7e6e66971314D833A` and deployment transaction `0x0d97e0fe016df6ed45472016c72b5b6ef678d84a5a81fe246e3f500b31ed28cd` are retained as historical evidence only; they do not match this funded source release.

## Local automated evidence

- ReceiptV2 unit tests: `106 passed`.
- GenVM Direct Mode suite: `25 passed`, including funding, sponsor/challenger commit/reveal, source fetching, positive contradiction, `NOT_ESTABLISHED`, malformed/unavailable neutral, malicious leader, duplicates, timeout/recovery, recipient withdrawal and wrong wallet/network.
- ReceiptV2 lint and semantic validation: `3 checks passed`.
- Frontend Vitest: `14 passed`.
- Frontend typecheck, ESLint and production build: passed.
- Playwright browser suite: `12 passed`, including accessibility and explicit configuration/wallet/history behavior.
- Withdrawal reconciliation fixtures: `5 passed`; read-only and no writes.
- Dependency audit: root and frontend `npm audit --omit=dev --audit-level=high` both reported `0 vulnerabilities`.
- [GitHub Actions run 38218477953](https://github.com/ometere123/receipt-/actions/runs/38218477953): PASS for exact commit `b7c5a0f0941b9bea71aeb89fefc68685231c6b58` across contract-unit, frontend, browser and genuine GenVM Direct Mode jobs.

## Frontend configuration

The Vercel project is `delealufejoel-4184s-projects/receipt`, rooted at `frontend`. The final deployment must set:

```text
NEXT_PUBLIC_RECEIPT_V2_ADDRESS=<approved-funded-v2-address>
NEXT_PUBLIC_FUNDING_ENABLED=true
NEXT_PUBLIC_EXPLORER_URL=https://explorer-studio.genlayer.com
```

The historical ProofEngine and PromiseVault variables remain optional read-only V1 history configuration. No V1 write is used by the active app.

## Final live evidence

See [`V2_LIVE_RELEASE_EVIDENCE.md`](V2_LIVE_RELEASE_EVIDENCE.md) for the finalized deployment, exact source parity, real transaction hashes, positive/negative/neutral lifecycle, recipient-matching child receipt, conservation counters and the remaining external-message limitation.
