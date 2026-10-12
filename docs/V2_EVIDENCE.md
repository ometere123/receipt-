# V2 evidence manifest

Recorded 2026-10-12 from the tested code snapshot `38724ba3717aa0bf93c483381d399b459fc4a626`; the later branch commits are documentation-only follow-ups.

## Source and chain

| Field | Verified value |
| --- | --- |
| Tested/deployed code snapshot | `38724ba3717aa0bf93c483381d399b459fc4a626` |
| Network | GenLayer StudioNet, chain `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Active contract | `0x8A157929e1FcC0e22278De16f88EfaBC501Ac71d` |
| Deployment tx | `0x867a6006024819c7f53672daf14c41c16d86126e52b6d037a3e246523fa48ae7` |
| `contracts/ReceiptV2.py` SHA-256 | `29be0c2ce1b0781aa42e4d298484717dd42cb5bb6125906dd682bb34590cd040` |
| Source parity | `exact_bytes=true` via `gen_getContractCode` |
| Live config | `SINGLE_IC`, `funding_enabled=false`, `DISABLED_FAIL_CLOSED` |
| Genesis treasury | accepted/credited/outstanding/dispatch = `0` |

## Frontend preview

| Field | Verified value |
| --- | --- |
| Vercel project | `delealufejoel-4184s-projects/receipt` |
| Root directory | `frontend` |
| Preview | https://receipt-jvcr1h0gx-delealufejoel-4184s-projects.vercel.app |
| Preview deployment | `dpl_ESieGMT1mJmRWU7p9j9DuP9SraZu` |
| Preview source commit | `38724ba3717aa0bf93c483381d399b459fc4a626` |
| Preview smoke | `/api/build-info` reports V2 + historical addresses; HTML shows V2 safety gate |
| Production alias | Unchanged; no V2 production env or promotion performed |

## Automated evidence

- ReceiptV2 unit tests: `89 passed`.
- GenVM Direct Mode tests: `16 passed`.
- ReceiptV2 linter and semantic validation: `3 checks passed`.
- RPC preflight: exact 61999 passed.
- Frontend Vitest: `14 passed`.
- Frontend typecheck, ESLint and production build: passed.
- Playwright: `11 passed` with the real V2 local env after a fresh build.
- V2 reconciliation: `DISABLED_NO_DISPATCH`, read-only, no writes.

## Negative evidence / limits

- No V2 bounty, bond or withdrawal was sent.
- No V2 external GEN payment success, failure or ambiguity proof exists.
- Funding and withdrawals remain disabled by contract state and Vercel flag.
- V1 deployment/credits remain historical and are not migrated.
