# V2 evidence manifest

Recorded 2026-10-12 for branch `v2-final-funded`. This file separates local implementation evidence from the final StudioNet evidence that still requires explicit deployment approval.

## Source and chain

| Field | Value |
| --- | --- |
| Active source | `contracts/ReceiptV2.py` |
| Network target | GenLayer StudioNet, chain `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Architecture | `SINGLE_IC` |
| Funding mode | `NATIVE_GEN` |
| Withdrawal status | `EVM_DISPATCH_EMITTED_UNCONFIRMED` |
| Final funded address | Pending approved deployment |
| Final deployment tx | Pending approved deployment |
| Final source parity | Pending approved deployment |

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
- [GitHub Actions run 38212267394](https://github.com/ometere123/receipt-/actions/runs/38212267394): exact commit `02ed7224e115c95384ae54712b9e31f005ef7395` passed contract-unit, frontend, browser and GenVM Direct Mode jobs.

## Frontend configuration

The Vercel project is `delealufejoel-4184s-projects/receipt`, rooted at `frontend`. The final deployment must set:

```text
NEXT_PUBLIC_RECEIPT_V2_ADDRESS=<approved-funded-v2-address>
NEXT_PUBLIC_FUNDING_ENABLED=true
NEXT_PUBLIC_EXPLORER_URL=https://explorer-studio.genlayer.com
```

The historical ProofEngine and PromiseVault variables remain optional read-only V1 history configuration. No V1 write is used by the active app.

## Pending live evidence

- Explicit approval: signer, transaction scope and maximum test expenditure.
- Finalized funded deployment and exact source parity.
- Zero genesis treasury/config readback.
- Sponsor funding, challenger commit/reveal, positive adjudication, claimable credit and recipient withdrawal.
- External child transaction/receipt evidence, with the V2 dispatch record and conservation counters.
- `NOT_ESTABLISHED`, malformed/unavailable neutral, malicious leader, duplicate/unauthorized, timeout/recovery and wrong-wallet/network evidence.
- Browser verification of connect/disconnect, chain 61999, source digests, backup reveal, adjudication, verdict, claimable GEN, withdrawal, V1 history and error/layout behavior.

No live transaction, final address, successful payout or production promotion is claimed in this document before those gates are completed.
