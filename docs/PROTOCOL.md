# RECEIPT! protocol specification

## Domain and claim model

RECEIPT! adjudicates exactly one **literal documentation claim** against one **pinned source file** and one **pinned documentation file**. It does not certify whole repositories, binaries, release artifacts, security posture, or ownership of the GitHub account.

Each case freezes:
- sponsor wallet, bounty (wei), creation time and deadline;
- repository owner/name and **full lowercase 40-character Git commit**;
- relative paths to a documentation file and a source file;
- exact verbatim claim in the documentation (25–480 chars);
- SHA-256 bytes of both pinned files; and
- one active attempt at most.

No case editing, owner overrides, verdict vetoes or delegated payout authorities are present. External GIFs, mutable web pages, floating tags and private APIs do not count as evidence.

## Actors

* **Sponsor:** Any wallet willing to place GEN behind a statement. Sponsorship does **not** prove repository ownership.
* **Challenger:** Another wallet that commits an argument, posts the required bond and reveals evidence before the reveal deadline. Sponsor/challenger equality is not forbidden because banning one wallet would not prevent sybil accounts.
* **Validators:** GenLayer's independent consensus participants. They read the code/claim through the intelligent contract, not through a trusted REST backend.
* **Engine operator:** The ProofEngine deployer can **only** bind its vault once; has no settlement or admin override.

## Two contracts

**PromiseVault:** case registry, GEN escrow, open-window rules, commit/reveal bond, status and credit accounting, idempotent/replay-rejecting verdict acceptance, refunds and GEN withdrawals.

**ProofEngine:** independently fetches frozen `raw.githubusercontent.com/{owner}/{repo}/{sha}/{path}` bytes, checks exact SHA-256 commitments/claim/anchor, calls an LLM under a custom Eq Principle, independently verifies the substantive leader result, and emits a finalization-triggered authenticated callback. It records each verdict for safe callback re-emission.

Before accepting deposits, the vault requires `ProofEngine.get_vault()` to exactly match its own address and `funding_enabled` to be true. Replacement constructors set `funding_enabled = false` and expose no public enable switch while external GEN receipt recovery is unproven. ProofEngine can bind only once. ProofEngine refuses assessment requests not sent by its bound vault, and PromiseVault refuses verdicts not sent by its engine.

## Lifecycle

| State | Who can act | Allowed next step | Money |
| --- | --- | --- | --- |
| OPEN | sponsor already funded; anyone may challenge | `commit_attempt`, or `expire_case` after deadline | bounty reserved |
| COMMITTED | challenger owns matching commitment | `reveal_attempt` within 2h, otherwise anyone `settle_unrevealed` | bounty + exact bond reserved |
| PENDING | GenLayer engine and callback | `on_verdict`, `resend_verdict`, or an asynchronous engine-authorized `recover_pending` after 7 days | both locked |
| WON | none | `withdraw` winner's credited bounty + bond | winner credit |
| OPEN after invalid/inconclusive | anyone | another commit until case deadline | bounty reserved; bond credited by verdict |
| EXPIRED | none | `withdraw` sponsor's credit | sponsor refund |

Challenge bond is `max(0.0001 GEN, bounty / 20)` using integer wei math. `NOT_ESTABLISHED` and `OUT_OF_SCOPE` transfer the bond to sponsor only when their required neutral flags are coherent; `INCONCLUSIVE` refunds the challenger. A `NOT_ESTABLISHED` result with `contradiction=true`, or an `OUT_OF_SCOPE` result with any substantive flag true, is normalized to `INCONCLUSIVE` and cannot forfeit the bond. Failure to reveal within 2h forfeits bond to sponsor. A valid `CONTRADICTED` first claim pays bounty plus bond to challenger. Since the contract has only one live attempt per case, same-deadline races are sequenced by transaction finalization. Later claims can continue after a nonwinning verdict as long as the case has time left.

Expired sponsors cannot reclaim funds while any challenge is committed or pending. Once an active challenge settles, any applicable expiry refund is calculated at the final settlement time. Old/replayed verdicts are refused. Commitment timeout can be executed permissionlessly. Seven-day recovery only occurs after cross-contract view confirms the engine contains no materialized verdict; if the verdict exists, re-emission is required instead.

## Commitment canonicalization

A challenge computes SHA-256 over UTF-8 of JSON array (no spaces):

```json
["61999","0x...vaultlower","caseIdAsString","0x...walletlower","64-lower-hex-salt","literal anchor","literal argument"]
```

Inputs are limited to ASCII with no `|` separator (and max lengths) to ensure cross-language canonical bytes. The private reveal salt and original argument must be backed up locally; losing them can forfeit a bond.

## Independent consensus

1. Both leader and validators fetch bytes from a **fixed Git commit**, not floating branches.
2. HTTP 200 and file bounds (18KB docs, 20KB source) are mandatory.
3. Each file's raw SHA-256 must match the immutable case commitment.
4. The published claim must appear verbatim in documentation. The anchor must occur in the pinned source. Missing evidence yields OUT_OF_SCOPE; inaccessible/mutated bytes yield INCONCLUSIVE. A neutral label with contradictory substantive flags is incoherent and yields INCONCLUSIVE.
5. Prompt treats all external text as untrusted. The leader returns `scope_ok`, `proof_complete`, `contradiction`, `verdict`, `reason`.
6. The validator separately fetches and prompts over the same pinned materials. It must independently agree on the meaningful three booleans, verdict and combined evidence digest. Reasons may differ and do not authorize payouts.
7. `CONTRADICTED` is possible only if all three substantive booleans are true and evidence fingerprint is valid. `NOT_ESTABLISHED` requires `contradiction=false`; `OUT_OF_SCOPE` requires all three substantive booleans false.

No one model or party can supply an arbitrary winning label and have it accepted by the vault. Nevertheless AI adjudication is probabilistic, and closed-world source-file reasoning has limits; these risks require targeted live consensus testing and conservative claim scoping.

## Value-transfer and asynchronous correctness

All IC-to-IC messages use `on='finalized'`. GenLayer messages create independent child transactions; the frontend must not treat the parent as proof of child completion. The engine stores its verdict before emitting settlement, and `resend_verdict` can re-emit it without another LLM judgment. The vault checks attempt ID, state and sender.

`withdraw` zeros a credit and reserves the value for an **external finalization-triggered** GEN transfer to the EOA. The parent receipt alone does not prove the EVM-layer transfer; users must verify emitted transfer execution. On networks where that operation can fail after the GenVM state commits, a safe recovery mechanism needs protocol-level transfer-execution evidence, not an optimistic admin re-credit. See `docs/VALIDATION.md`; do not label this feature production-proven before full 61999 confirmation.

## Security invariants

- No unfunded case.
- No mutable claim after publication.
- No more than one active attempt per case.
- No successful proof from a nonexistent or changed pinned file.
- No sponsor veto of consensus.
- No double settlement of the same attempt.
- No timeout that overrides an engine-materialized verdict.
- No premature sponsor refund while an eligible challenge is alive.
- No wallet writes on the wrong chain.
- No simulated on-chain outcomes in the frontend.
- Accounting invariant: outstanding credited/reserved value plus finalized dispatched withdrawals equals received bounty and bond wei, subject to verified external transfer semantics.

## Scope limits

- Exactly one bounded source file per case; proving a cross-file effect may require a future explicit manifest-based protocol.
- GitHub raw content at an immutable commit is the external evidence source. It does not prove authorship, GitHub account control, software release authenticity or deployed binary equivalence.
- The frontend provides the claim and file SHA verification before funding; remote availability at adjudication cannot be guaranteed.
- Signed wallet writes require fees in addition to the bounty/bond and follow network fee policy.


## External GEN transfer is **not** confirmed by `withdraw` finality

An EOA withdraw burns the internal claimable credit and emits an external
GenLayer ghost/EVM-layer value transfer. The transfer may fail separately and,
according to the current GenLayer documentation, its value is **not** returned
automatically. `get_dispatch()` records `EMITTED_UNCONFIRMED`: this is an
AUDIT INTENT, **not** a receipt or a paid balance. There is no safe on-chain
retry or refund unless the hosted runtime supplies a proven, supported callback
and recovery mechanism. Test this on 61999 with tiny amounts before inviting
real funding. A product claiming guaranteed payments here is unfit for review.


## Engine activation handshake

The operator binds ProofEngine once; it emits a FINALIZED `activate_engine`
message to PromiseVault. PromiseVault refuses all funded case creation until
this authenticated callback arrives. `resend_activation` can redeliver
idempotently without rebinding. This avoids a synchronous nested cross-contract
view in the value-custody hot path. A deployment transaction finishing does
not prove the activation child has executed; verify `get_config.engine_ready`.

## Recovery arbitration (no synchronous cross-contract recovery read)

A stalled verdict may be checked/re-emitted from ProofEngine. After 7 days,
`PromiseVault.recover_pending` puts the attempt in `RECOVERY_REQUESTED` and
sends an `on='finalized'` request to ProofEngine; **it issues no credit**.
ProofEngine linearizes that request against the definitive stored verdict:
if one exists it re-emits `on_verdict` (including for `RECOVERY_REQUESTED`);
otherwise it irrevocably tombstones the attempt ID and only then sends a
finalized `confirm_recovery`. Only the authenticated engine callback may
release the challenger bond and unlock the sponsor refund. A delayed assessment
is rejected on the tombstoned ID. Repeated recovery requests are idempotent.
Missing callback delivery can be retried by the same caller after timeout.
This is not a substitute for live Studionet arbitration-race tests.
