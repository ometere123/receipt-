# V2 evidence manifest

Recorded 2026-10-12 from the tested and deployed code snapshot `7e9942fd182a57c152ed517dbb305f8703cc395e`.

## Source and chain

| Field | Verified value |
| --- | --- |
| Tested/deployed code snapshot | `7e9942fd182a57c152ed517dbb305f8703cc395e` |
| Network | GenLayer StudioNet, chain `61999` |
| RPC | `https://studio.genlayer.com/api` |
| Active contract | `0xa61EC599648782b2286eccd7e6e66971314D833A` |
| Deployment tx | `0x0d97e0fe016df6ed45472016c72b5b6ef678d84a5a81fe246e3f500b31ed28cd` |
| `contracts/ReceiptV2.py` SHA-256 | `507c15b977f660014af663ef8371fa9b873c7f8a3c1f373815c4a356afa46a91` |
| Source parity | `exact_bytes=true` via `gen_getContractCode` |
| Live config | `SINGLE_IC`, `funding_enabled=false`, `DISABLED_FAIL_CLOSED` |
| Genesis treasury | accepted/credited/outstanding/dispatch = `0` |

## Frontend preview

| Field | Verified value |
| --- | --- |
| Vercel project | `delealufejoel-4184s-projects/receipt` |
| Root directory | `frontend` |
| Preview | https://receipt-enksmvmva-delealufejoel-4184s-projects.vercel.app |
| Preview deployment | `dpl_3jXLPJZrmMRFQLgQxJAJsmt1E9H8` |
| Preview source commit | `7e9942fd182a57c152ed517dbb305f8703cc395e` |
| Preview smoke | Protected deployment verified with `vercel curl`: `/api/build-info` reports V2 + historical addresses; HTML shows V2 safety gate and V1 history tab |
| Production alias | Unchanged; no V2 production env or promotion performed |

## Automated evidence

- ReceiptV2 unit tests: `104 passed`, including targeted verdict-field mutations,
  malformed-input, timing-boundary, unavailable-source and exact-accounting cases.
- GenVM Direct Mode tests: `16 passed`.
- ReceiptV2 linter and semantic validation: `3 checks passed`.
- RPC preflight: exact 61999 passed.
- Frontend Vitest: `14 passed`.
- [GitHub Actions run 38193256878](https://github.com/ometere123/receipt-/actions/runs/38193256878): frontend, contract-unit, browser and genvm-direct jobs all succeeded.
- Frontend typecheck, ESLint and production build: passed.
- Playwright: `12 passed` with the real V2 local env after a fresh build.
- V2 reconciliation: `DISABLED_NO_DISPATCH`, read-only, no writes.

## Negative evidence / limits

- No V2 bounty, bond or withdrawal was sent.
- No V2 external GEN payment success, failure or ambiguity proof exists.
- Funding and withdrawals remain disabled by contract state and Vercel flag.
- V1 deployment/credits remain historical and are not migrated.
- Previous V2 deployment `0x8A157...` remains an empty superseded candidate; the active address above is the parity-verified replacement.
