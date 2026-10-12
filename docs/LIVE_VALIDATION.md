# Live Studionet 61999 validation

This is an evidence record for StudioNet 61999. It is not an economic-safety
certification. The final funded V2 implementation is ready locally; final
deployment and live lifecycle evidence are **PENDING EXPLICIT APPROVAL** for
the signer, transaction scope and maximum test expenditure.

The prior fail-closed one-contract deployment listed below is historical
candidate evidence only and is superseded by the funded source on
`v2-final-funded`. It must not be presented as the final funded address.
The older two-contract lifecycle evidence later in this file is explicitly
historical V1 evidence; it is retained for audit and data compatibility and is
not V2 proof.

## Network and deployment

- RPC: `https://studio.genlayer.com/api`
- Chain: `61999` (stable Studionet)
- Repository-local CLI: `genlayer 0.39.1`

### Previous fail-closed V2 deployment (superseded)

- ReceiptV2: `0xa61EC599648782b2286eccd7e6e66971314D833A`
  - deploy: `0x0d97e0fe016df6ed45472016c72b5b6ef678d84a5a81fe246e3f500b31ed28cd`
  - source SHA-256: `507c15b977f660014af663ef8371fa9b873c7f8a3c1f373815c4a356afa46a91`
  - configuration: `SINGLE_IC`, `funding_enabled=false`, `DISABLED_FAIL_CLOSED`
- Genesis treasury: accepted/credited/outstanding/dispatch = `0`

### Final funded V2 deployment

- Address: pending approved deployment
- Deployment transaction: pending approved deployment
- Configuration target: `SINGLE_IC`, `funding_enabled=true`, `NATIVE_GEN`, `EVM_DISPATCH_EMITTED_UNCONFIRMED`

### Historical V1 deployment
- Deployment signer: `0xb845a69860ba4cdf19cfdc5afbaf2e20b6be86b0`
- ProofEngine: `0xa2E4DaFe86229e6A3d1C92C6dCEb680dd4a55128`
  - deploy: `0x87eb2bd9aa7b9b5a708ea2fce52645630f3db4ad2bcff64eda13e61694b055f0`
- PromiseVault: `0x6A5366Dcc45E6fb137534BA09f44632593c18880`
  - deploy: `0x769d4a144290b1e8471b547104de7e84b366b0ea92acbd3c04cbf49f1873cfa5`
- Engine binding: `0x7fb150ecf31a9bfc1a668886dd82479aac9325a10f858ad37b672a0460d73bc8`
- Binding activation child: `0x4291796769d81061ce67e09a1b8476dbb6a10a10295609265b8663ae517c11e1`

The historical binding parent and activation child were independently observed as
FINALIZED with successful leader execution. `get_config` reports
`engine_ready: true`, and `get_vault` returns the deployed PromiseVault.

## Production frontend read-only check (historical V1)

After the production deployment containing the funding gate, a headless browser
read-only check of `https://receipt-five-cyan.vercel.app/` loaded five live
case cards from the 61999 registry and displayed the
`EXPERIMENTAL / HISTORICAL — NEW FUNDING UNSAFE` / funding-paused warning. The
first live `OPEN` case was opened successfully; its evidence and
case details remained readable, `New challenges are paused` was visible, and
there were zero `Commit challenge` buttons. No wallet connection and no write
transaction was attempted. This verifies that the production UI preserves
inspection of existing cases while withholding new challenger-bond deposits.

After deployment `dpl_Dg9EeSjRibo2h49hpr44jGZ1G5CG`, a second production
audit waited for all five live case cards before checking the rendered app at
1440x900 and 390x844. Both returned HTTP 200 with no console or page errors,
no horizontal overflow, the funding-paused notice, and zero `Commit
challenge` buttons. An automated WCAG 2A/AA scan found zero violations after
the contrast fix (21 desktop passes and 22 mobile passes; two non-violation
items remained incomplete for axe's heuristics). No wallet connection or write
transaction was attempted.

The repository browser gate now runs `axe-core 4.14.0` against the clean,
unconfigured production build across Explore, Funding gate, investigator desk,
receipt wall, and About. The deterministic local run passed all 11 browser
tests, including zero WCAG 2A/2AA violations on each primary view. This keeps
the contrast fixes regression-tested without depending on live chain data.

The current production frontend candidate was deployed from commit
`e8e3d3a7452d871bb88581aa5e21de23af66a3ef` as Vercel deployment
`dpl_8jTUN9JuDVtciUezDSmTgo7Vw9tD`, aliased to
`https://receipt-five-cyan.vercel.app`. A protected `vercel curl` request to
`/api/build-info` returned the same commit and deployment ID, chain `61999`,
PromiseVault `0x6A5366Dcc45E6fb137534BA09f44632593c18880`, and ProofEngine
`0xa2E4DaFe86229e6A3d1C92C6dCEb680dd4a55128`. The Vercel project is the single
`receipt` project with root directory `frontend`; its four required public
configuration variables are present in Production, Preview, and Development.
The production deployment's error-log query returned no logs. The current
investigator desk also renders recent withdrawal dispatch instructions as
`EMITTED_UNCONFIRMED` records, without presenting them as payment receipts or
retrying them automatically.

## Read-only payout reconciliation (historical V1)

At `2026-10-12T00:00:12.958Z`,
`npm run reconcile:withdrawal -- --parent
0xc8ef0315e6edebacbb5cc8a70b68bdb442bd707f8939c050a246ec44771e2f28
--vault 0x6A5366Dcc45E6fb137534BA09f44632593c18880 --dispatch-id 1` completed
without a write. It observed the exact child
`0xa9800dc4ec8ff68f2ad1d9d731438c80c2c8261f1eaf6cbfbe01437eb362f583`, a
finalized child with `NO_MAJORITY` and `value_credited: true`, an EVM receipt
with `status: 0x1`, recipient
`0xB845a69860ba4CDf19CfDC5AfbAF2e20b6bE86b0`, value `1100000000000000`, and
one recipient-matching log. The vault dispatch remained
`EMITTED_UNCONFIRMED`; the current claimant credit read was
`1200000000000000` because it includes other existing entitlements and is not
attributed to this dispatch.

The utility classified this dispatch as `RECEIPT_VERIFIED` while retaining the
separate GenLayer `NO_MAJORITY` fact. It performed no retry, recredit or
settlement write. Fixture tests also cover failed, ambiguous, missing and
duplicate observations. This is evidence reconciliation only, not a safe
failure-compensation mechanism.

## Deployed-source parity (historical V1)

At commit `de3cd57cf3301b2f8dca0e3cec5f9bb539b1b52c`, `npm run source:verify`
passed with exact byte equality for both deployed contracts:

| File | SHA-256 |
| --- | --- |
| `contracts/ProofEngine.py` | `f7c912c2ed997ba9b5b85725cad6a632106e0dd4569a53a9a72fe9ee8ca330cc` |
| `contracts/PromiseVault.py` | `3479f2a2602271ee554e6db48ba7400f4ab6a301b405a3d070f4ebbf6d2a26e8` |

The live claim probe froze repository commit
`dced4fcaaec60a8c91d3b101671cc2d36e6c0640`. Its documentation digest is
`36688cb3f41244fc3e39bb4ad7a26e7685b72048d347218667e47ec3cb5e0c30`.

## Two-wallet lifecycle (historical V1)

The probe used separate sponsor and challenger accounts:

- sponsor: `0x951e6b75530774ff82321a5ae54e14f778f0c855`
- challenger: `0xb845a69860ba4cdf19cfdc5afbaf2e20b6be86b0`

All amounts below are wei. The probe used a `0.001 GEN` bounty and a
`0.0001 GEN` bond. It records finalized parent/child receipts and does not
write private keys to output or disk.

### Positive contradiction and withdrawal

Case 1 reached `CONTRADICTED` / `WON`:

- create: `0xba4d74fb80cee4fc32fe341fba4781feaa7f41132ed99f14c29d38a83eaffce8`
- commit: `0x4f7ccfdcb4fddc4590f139e3e1e92e8cf2d700384a8c3633bf65ccc4601c9d2f`
- unauthorized reveal was finalized as an execution error (`not active claimant`)
- reveal: `0x75956c0fd500079a21d18ab178e5361e076ed81c9f88101802607c49f47f3310`
- ProofEngine assessment child: `0xc27af7b1c75de4a329097b5b54aced74d61075439148e35077d2bc2e334be2f6`
- PromiseVault callback child: `0x6e327d1c82fc3a2ebd252f0147f0c77bb2e0f21b418695cd4064432edbf51de5`
- replay reveal was finalized as a rejection
- withdrawal parent: `0xc8ef0315e6edebacbb5cc8a70b68bdb442bd707f8939c050a246ec44771e2f28`
- external transfer child: `0xa9800dc4ec8ff68f2ad1d9d731438c80c2c8261f1eaf6cbfbe01437eb362f583`

The withdrawal child had `value = 1100000000000000`, recipient equal to the
challenger, `value_credited: true`, and an independent EVM receipt with
`status: 0x1` and a transfer log. The vault's dispatch read remains
`EMITTED_UNCONFIRMED`, and the claimant credit was zeroed before dispatch.
The child GenLayer record itself is `FINALIZED` with `NO_MAJORITY`, so this is
evidence of one observed receipt, not proof that failed children are safely
recoverable. The wallet balance also changed during the probe, but the probe
does not treat a noisy balance delta as a substitute for the EVM receipt.

### Additional adversarial cases

| Case | Result | Evidence |
| --- | --- | --- |
| 2, extra source-anchor probe | `CONTRADICTED` / `WON`; the source was still materially relevant, so this was not a valid insufficient-evidence negative | create `0x4710082bf8f853c1193ff66db6b46f84d9a2006972f596cb33beb9cd941486d4`, reveal `0xaafd6fa7e4b74b8455cde61fa0ee395e7e4619fd91f44ac215a28588473ac7ca` |
| 3, unrelated source stress probe | unresolved: assessment child canceled with `NO_MAJORITY`; case stayed pending | create `0x71181ffa000e3302172f682e4175a8ec470c01fd5a7ebf4a6fa7e44e34501ffb`, reveal `0x6c871a26f1f6d6d4773bc76c5d770a3ad55eed6b989ed4e8fad6862b7d9c5f0e` |
| 4, supported claim | `NOT_ESTABLISHED` / `OPEN`; the challenger bond was credited to the sponsor and no bounty winner was assigned | create `0x8875a6c0a72c1166ed862ae4572c1e9ff0a47cddc64d51038bea3220f09cb30f`, commit `0x9663191401ae0ad08bba3536e2e27c3588867d638517d12caf7ad508aad5cdb6`, reveal `0x0a7a3c40e245090bcbf47218d41bf9887340c78f6cdb7747429dc3fe8547c2e0` |
| 5, invalid source digest | `INCONCLUSIVE` / `OPEN`; the challenger bond was refunded and no bounty winner was assigned | create `0x60334a832bbd03b821d5fe4853264cdaaaa4cbe2185610d2326d1318c33577c1`, commit `0x1897b767bec0a274d2273a38c50d086bfed5adcabe51b1a0e9c6ab6cce3a855`, reveal `0x5f890b898fa4c1e44053777ffc304c53a904bc686147e4319d9e1ebd667ec759` |

Case 3 is still pending on-chain. A read-only `get_attempt(3)` at the
validation checkpoint returned `PENDING` with `revealed_at = 1791750192`
(`2026-10-11T20:23:12Z`) and no verdict. The assessment child was canceled
with `NO_MAJORITY`; no recovery write was attempted. The earliest supported
recovery request is therefore `2026-10-18T20:23:12Z`, after the seven-day
window, and it still would not itself release credit: the engine must confirm
an absent verdict through its finalized recovery path.

Additional read-only RPC checks on the assessment child
`0x8d2caaed8b8698d4d1bc158a070aa64de9e10e27eb8e0adc1c2c910eb3b11b50`
returned `status_name: CANCELED` (status code `8`), `result_name:
NO_MAJORITY`, `value_credited: false`, `votes_committed: 0`,
`votes_revealed: 0`, `appeal_bond: 0`, and `rotations_left: 0`. The raw
`gen_getTransactionStatus` endpoint independently returned `CANCELED`. The
current Studionet endpoint returned `Method not found` for the newer
`gen_getTransactionLifecycle` RPC, and the repository-local CLI's read-only
`appeal-bond` query reported that appeal-bond calculation is unsupported on
this chain because `feeManagerContract/roundsStorageContract` are missing.
No appeal, finalization, or recovery write was attempted; the available
evidence does not prove a supported action that can safely resolve this child.

At `2026-10-11T22:19Z`, a fresh read-only recheck returned the same Case 3
state: `get_case(3)` was `PENDING`, `get_attempt(3)` was `PENDING` with an
empty verdict, `gen_getTransactionStatus` for the assessment child returned
`CANCELED`, and `gen_getTransactionLifecycle` remained unavailable. The
existing-evidence path of `node tools/live-lifecycle.mjs` completed without a
write and emitted `BLOCKED` with Case 3 as the only unresolved case. The
positive withdrawal child was also re-read: it remains `FINALIZED` with
`result_name: NO_MAJORITY`, `value_credited: true`, and an independent EVM
receipt of `status: 0x1`; the vault dispatch remains
`EMITTED_UNCONFIRMED`. This reinforces that one successful observed transfer
does not establish a supported recovery path for a failed child.

A direct read through the repository's pinned CLI `0.39.1` and
`genlayer-js 1.1.8` exposed additional Case 3 lifecycle fields: the canceled
assessment reports `consensus_data.error: max_recovery_cycles_exceeded`,
`recovery_count: 3`, `value_credited: false`, and an empty
`triggered_transactions` list. Its leader receipt contains a pending
finalization callback message, but cancellation produced no callback child.
The pinned Studionet chain definition has no fee-manager, rounds-storage, or
appeals contract; consequently the SDK's read-only `getMinAppealBond`,
`getRoundNumber`, and `canAppeal` operations each fail with an explicit
unsupported-chain error. The transaction is `CANCELED`, not
`READY_TO_FINALIZE`, so the CLI's finalize action is not applicable. No
appeal, finalize, or recovery write was attempted.

Case 4's finalized ProofEngine child was
`0x9dd07a6df79cf71e759bcce0f611e47826ce6e62b0364eac9cc27437c034eef4`,
with callback `0x0a7556eef4fbf8ecbabd1b6ce85e78eed951e4cafa13e6484213707a922d9e41`.
Case 5's corresponding child was
`0x5673a6d18b4c1a0dc58c4d2e6ed1f99c2215c03503e1ee929ec54472fb3c2807`,
with callback `0x26b777b52dc66171cb814e7c7122a87d0eac480fc6a52ec250539db125645a12`.

## Safety boundary

The live success probe proves that a tiny external transfer can produce an
EVM receipt on this deployment. It does **not** prove safe custody or a safe
failure path: the vault clears claimant credit before transfer confirmation,
the ledger remains `EMITTED_UNCONFIRMED`, and the observed GenLayer transfer
child has `NO_MAJORITY`. Because the runtime documentation does not provide an
automatic failed-child value return, live funding must remain blocked until a
supported compensation/recovery policy is independently demonstrated.

The authoritative local evidence is the gitignored
`receipt-live-lifecycle.json`; it records `BLOCKED`, required lifecycle
success, and the unresolved case 3 rather than hiding either limitation.

The deployed replacement source fixes three source-level hazards and is covered
by local unit/Direct Mode tests: new bounties and challenger bonds are disabled
by default, and incoherent
`NOT_ESTABLISHED`/`OUT_OF_SCOPE` flag combinations become neutral
`INCONCLUSIVE` results so a challenger bond is refunded. Those fixes are live
on the active V2 address listed above; V1 balances and credits were not
migrated.
