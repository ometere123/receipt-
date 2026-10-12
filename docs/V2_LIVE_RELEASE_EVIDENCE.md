# RECEIPT! V2 live release evidence

Recorded 2026-10-12 on StudioNet 61999. This is factual transaction evidence,
not a payout guarantee.

## Final deployment and parity

| Field | Final value |
| --- | --- |
| Branch | `v2-final-funded` |
| Active Intelligent Contract | `contracts/ReceiptV2.py` only |
| Contract | `0xc0C20aDd6E691a6695B4B93F0A044739A91cbC5F` |
| Deployment transaction | `0x9843c5912cf95c5fd292abf12915923004732ba3c2039eab67b1ec309105fae5` |
| Signer | `0x0d5540e0aD4B92Aa0ad4e5F1b8cD645ee1E363E7` |
| Chain / RPC | `61999` / `https://studio.genlayer.com/api` |
| Configuration | `SINGLE_IC`, native GEN funding, `EVM_DISPATCH_EMITTED_UNCONFIRMED` |
| Full source SHA-256 | `d57a19a19846f385c263deb04d7216d3a378ee2b4a153220e0710c85f0777cc0` |
| Source parity | `npm run source:verify`: exact bytes, 1/1 finalized deployment |

The deployment finalized with successful GenVM execution. The initial readback
was native-funded and correctly configured. Two earlier test cases were left
open after neutral results; they were not retried or rewritten. The successful
run below starts from that explicitly recorded state.

## Real wallet lifecycle

The approved cumulative value-transfer ceiling was 45 GEN. The three successful
cases below added `0.0033 GEN` to the two earlier `0.0022 GEN` test attempts,
for `0.0055 GEN` total. Wallets were distinct:

- Sponsor: `0x951e6b75530774ff82321a5ae54e14f778f0c855`
- Challenger: `0xb845a69860ba4cdf19cfdc5afbaf2e20b6be86b0`
- Permissionless assessor: `0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7`

| Case | Result | Create | Commit | Reveal | Adjudication | Withdrawal |
| --- | --- | --- | --- | --- | --- | --- |
| 3 positive contradiction | `CONTRADICTED` / `WON` | `0xdf0713f4af0dafd8bdd75db0f1d13d84cc7b63c81f3d6ac36e434a12df82f41b` | `0xb8c90a4ee22ca1e833ee2672fd99c7f16f4930ad437e8a135b5895467811549c` | `0x62b21017ba00a69f751e388c9c74966b5f3c69af7d4c1ae18d1135a3c0d1f93f` | `0xa8e47ec9754f8f19cfcbb91c5c502bab8e73a9aed202635fa353cde0b4e49c5f` | `0xccb5c5186f69f8243f86b325df2c5fcb5378195fabc230d4b10d137dfead5996` |
| 4 supported claim | `NOT_ESTABLISHED` / `OPEN` | `0x062c79946430295fb91cecfb8feb59bf9922fe588198359bf237f81e8589dd5d` | `0x52da0d4914b5c570216a2aa8a0356824e7306f27b12b590495767cdd29e760b1` | `0xcefb996956c2a2a865b9d7652afef87cac8894ad27673f2ca398970213db7748` | `0x942f48a2ab7d3e073a18ce9b2ffe28af22ee4a1f6c35f67b7f56f88e9dc10949` | — |
| 5 wrong source digest | `INCONCLUSIVE` / `OPEN` | `0xf3ea548b1445e6496009ce0177e6ca75fee39dc80dc6c11316d45e9c0d09f7c6` | `0xf500c06c618956b64d7b5a0d3e19fe3e911426f5b78f055c4e58bfc5fe844ea3` | `0xc1a6ac88e30eb8aa62d3854540f02cce223c746a47b0705935e329ac37c2ab61` | `0x21d711b0c25ed850d0028057d079b95e56191f70eaa33b18a7109981c19ad788` | — |

The positive challenger withdrawal dispatched `0.0013 GEN`. Its dispatch record
was `id=1`, recipient equal to the challenger and status
`EMITTED_UNCONFIRMED`. The observed external child was
`0xfb97e8218f9bf935e995725f67729cdd6c41aeec7276e44d0262af99cd61c94b`:
recipient matched the challenger, `value_credited=true`, and the independent
EVM receipt had `status=0x1` with the contract-to-recipient transfer.

Final treasury readback was:

```text
accepted_wei           5500000000000000
outstanding_wei       4200000000000000
external_dispatch_wei 1300000000000000
dispatch_count        1
credited_wei          1500000000000000
```

This satisfies `accepted_wei = outstanding_wei + external_dispatch_wei`.

## Rejection and neutral evidence

The following finalized execution-error transactions prove protected actions
and duplicate settlement do not create extra entitlements:

- Unauthorized positive reveal: `0x1bb14c09cf99d2fae23bec00fadadfe914cacd2039efe13eb9d8155ce20dec3a`
- Duplicate positive adjudication: `0xe542ee108e87ff16d8477709a6d705609a096c01fa7c7af7f5f46c5fc79d68f7`
- Duplicate positive withdrawal: `0x4fbaa5476afd204e76ef7c7833c60e7ceea2c5a9cfda41986c845a37efd76fad`
- Unauthorized negative reveal: `0xc9f2268fa06485d932329cf582111ea7c7d7ca68303fc315dacf32a46e17f4cb`
- Unauthorized neutral reveal: `0x357524cf65a5ab33df492edf3a24960dcd9da9f86d26f99af017a704f20c1d79`

The neutral case intentionally supplied an all-zero source digest and remained
`INCONCLUSIVE`/`OPEN`, refunding the challenger bond entitlement. The supported
case credited the sponsor bond entitlement and did not assign the bounty.

## Evidence-size limitation

The full deployed `contracts/ReceiptV2.py` is 30,135 bytes. ReceiptV2's
deterministic `gl.nondet.web.get` guard rejects fetched bodies over 18,000
bytes, so a first live probe correctly neutralized when it tried to adjudicate
the full file. No retry or redeployment was made. The successful cases pin
`docs/RECEIPT_V2_WITHDRAWAL_EXCERPT.py`, a 1,756-byte immutable excerpt copied
verbatim from the deployed withdrawal implementation and carrying the full
source SHA in its provenance header. Full deployment parity is independently
verified against `contracts/ReceiptV2.py`; the excerpt is only the
size-compatible evidence input for the live adjudicator.

The earlier full-source and digest-mismatch attempts remain in
`artifacts/historical-live-failures/` and are not represented as successful
adjudications.

## Automated and production evidence

- Python unit and genuine V2 Direct Mode suites: previously green on the branch;
  Direct Mode covers malformed/unavailable evidence, malicious leader output,
  duplicates, timeout/recovery and wrong wallet/network behavior.
- `npm run preflight`: PASS for chain 61999 and the pinned RPC.
- `npm run source:verify`: PASS, exact bytes.
- `npm run reconcile:v2`: PASS, read-only `DISPATCH_READY`, no writes.
- GitHub Actions [run 38218477953](https://github.com/ometere123/receipt-/actions/runs/38218477953) passed all contract-unit, frontend, browser and genuine GenVM Direct Mode jobs for commit `b7c5a0f0941b9bea71aeb89fefc68685231c6b58`.
- Production URL: [receipt-five-cyan.vercel.app](https://receipt-five-cyan.vercel.app), deployment `dpl_5PewXPtHA8t6vvGD8QSAtgh77UFs`.
- `/api/build-info` returned HTTP 200 with `chain_id=61999`, `source_commit=b7c5a0f0941b9bea71aeb89fefc68685231c6b58`, `deployment_id=dpl_5PewXPtHA8t6vvGD8QSAtgh77UFs` and the final V2 address.
- The production browser rendered the funded navigation and live cases. The test browser emitted only unrelated wallet-extension injection conflicts; no application console error was observed.

The Vercel project is `delealufejoel-4184s-projects/receipt`, rooted at
`frontend`. Its public V2 address, funding flag and StudioNet explorer URL are
configured in Production, Preview and Development. Historical V1 variables
remain separate and read-only.
