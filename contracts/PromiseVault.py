# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""RECEIPT! funded, single-active-attempt, funded claim registry.

Only the bound ProofEngine may report verdicts. All inter-contract messages
are emitted on FINALIZED, never ACCEPTED. Payouts use the GEN EVM layer.
"""
from genlayer import *
from datetime import datetime, timezone
import hashlib
import json
import re


@gl.evm.contract_interface
class _Receiver:
    class View:
        pass
    class Write:
        pass


def _fail(message: str) -> None:
    raise gl.vm.UserError(message)


def _now() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def _valid_path(path: str) -> bool:
    return (1 <= len(path) <= 140 and not path.startswith('/') and
            not path.endswith('/') and '\\' not in path and '?' not in path and
            '#' not in path and '%' not in path and
            all(x not in ('', '.', '..') for x in path.split('/')) and
            bool(re.fullmatch(r'[A-Za-z0-9._/+-]+', path)))


def _load(raw: str) -> dict:
    return json.loads(raw)


def _save(data: dict) -> str:
    return json.dumps(data, separators=(',', ':'), sort_keys=True, ensure_ascii=False)


def _key(value: int) -> str:
    """Use a linter-supported, canonical key for numeric registry IDs."""
    return str(int(value))


def _hash_commit(chain: int, vault: str, case_id: int, claimant: str,
                 salt: str, anchor: str, thesis: str) -> str:
    # Delimiter-free canonical framing. ASCII inputs only to agree with JS length.
    parts = [str(chain), vault.lower(), str(case_id), claimant.lower(),
             salt, anchor, thesis]
    return hashlib.sha256(json.dumps(parts, separators=(',', ':'),
                                     ensure_ascii=False).encode('utf-8')).hexdigest()


class PromiseVault(gl.Contract):
    engine: Address
    engine_ready: bool
    case_count: u64
    attempt_count: u64
    cases: TreeMap[str, str]
    attempts: TreeMap[str, str]
    credits: TreeMap[Address, u256]
    outstanding: u256
    total_dispatched: u256
    dispatch_count: u64
    dispatches: TreeMap[str, str]

    def __init__(self, engine_address: str):
        self.engine = Address(engine_address)
        self.engine_ready = False
        self.case_count = u64(0)
        self.attempt_count = u64(0)
        self.outstanding = u256(0)
        self.total_dispatched = u256(0)
        self.dispatch_count = u64(0)

    @gl.public.view
    def get_config(self) -> str:
        return _save({'engine': self.engine.as_hex, 'engine_ready': self.engine_ready, 'chain': 61999,
                      'minimum_bounty_wei': str(10 ** 15),
                      'commit_reveal_seconds': 7200,
                      'pending_timeout_seconds': 604800})

    @gl.public.view
    def get_counts(self) -> str:
        return _save({'cases': int(self.case_count), 'attempts': int(self.attempt_count)})

    @gl.public.view
    def get_case(self, case_id: int) -> str:
        return self.cases.get(_key(case_id), '')

    @gl.public.view
    def get_attempt(self, attempt_id: int) -> str:
        return self.attempts.get(_key(attempt_id), '')

    @gl.public.view
    def list_attempts(self, offset: int, limit: int) -> str:
        if offset < 0 or limit < 1 or limit > 24:
            _fail('bad pagination')
        found = []
        for n in range(offset + 1, min(int(self.attempt_count), offset + limit) + 1):
            raw = self.attempts.get(_key(n), '')
            if raw:
                found.append(_load(raw))
        return _save(found)

    @gl.public.view
    def get_credit(self, who: str) -> str:
        return str(self.credits.get(Address(who), u256(0)))

    @gl.public.view
    def get_dispatch(self, dispatch_id: int) -> str:
        if dispatch_id <= 0 or dispatch_id > int(self.dispatch_count):
            return ''
        return self.dispatches.get(_key(dispatch_id), '')

    @gl.public.view
    def get_treasury_status(self) -> str:
        """The balance is recorded independently; dispatched is NOT received."""
        return _save({'outstanding_wei': str(self.outstanding),
                      'external_dispatch_wei': str(self.total_dispatched),
                      'dispatch_count': int(self.dispatch_count),
                      'ghost_balance_wei': str(self.balance)})

    @gl.public.view
    def list_cases(self, offset: int, limit: int) -> str:
        if offset < 0 or limit < 1 or limit > 24:
            _fail('bad pagination')
        found = []
        for n in range(offset + 1, min(int(self.case_count), offset + limit) + 1):
            raw = self.cases.get(_key(n), '')
            if raw:
                found.append(_load(raw))
        return _save(found)

    @gl.public.write
    def activate_engine(self) -> None:
        """Ack from the bound engine's FINALIZED activation child.

        This avoids a nested cross-contract LATEST_FINAL view on each funding
        call. If delivery is delayed, ProofEngine.resend_activation may retry.
        """
        if gl.message.sender_address != self.engine:
            _fail('only configured ProofEngine may activate')
        self.engine_ready = True

    @gl.public.write.payable
    def create_case(self, title: str, owner: str, repo: str, commit_sha: str,
                    doc_path: str, source_path: str, claim: str,
                    doc_digest: str, source_digest: str, duration_hours: int) -> None:
        if gl.message.sender_address != gl.message.origin_address:
            _fail('funding requires direct EOA caller')
        if int(gl.message.chain_id) != 61999:
            _fail('Studionet 61999 required')
        if not 6 <= duration_hours <= 720:
            _fail('duration must be 6-720 hours')
        if not 8 <= len(title) <= 88 or not 25 <= len(claim) <= 480:
            _fail('title or claim length invalid')
        if not re.fullmatch(r'[A-Za-z0-9-]{1,39}', owner) or owner.startswith('-') or owner.endswith('-'):
            _fail('invalid repository owner')
        if not re.fullmatch(r'[A-Za-z0-9_.-]{1,90}', repo) or repo in ('.', '..'):
            _fail('invalid repository name')
        if not _valid_path(doc_path) or not _valid_path(source_path):
            _fail('invalid source path')
        if not re.fullmatch(r'[0-9a-f]{40}', commit_sha):
            _fail('full lowercase Git commit required')
        if not re.fullmatch(r'[0-9a-f]{64}', doc_digest) or not re.fullmatch(r'[0-9a-f]{64}', source_digest):
            _fail('SHA-256 digests required')
        # Refuse deposits until the adjudicator is permanently bound to this
        # precise vault. A misconfigured pair must never lock user funds.
        if not self.engine_ready:
            _fail('engine finality activation pending; funding is blocked')
        bounty = int(gl.message.value)
        if bounty < 10 ** 15 or bounty > 10 ** 24:
            _fail('bounty out of range')
        self.case_count = u64(int(self.case_count) + 1)
        case_id = int(self.case_count)
        case = {'id': case_id, 'title': title, 'owner': owner, 'repo': repo,
                'commit': commit_sha, 'doc_path': doc_path, 'source_path': source_path,
                'claim': claim, 'doc_digest': doc_digest, 'source_digest': source_digest,
                'sponsor': gl.message.sender_address.as_hex.lower(), 'bounty': str(bounty),
                'created_at': _now(), 'deadline': _now() + duration_hours * 3600,
                'status': 'OPEN', 'active_attempt': 0, 'winner': '',
                'won_attempt': 0, 'attempts': 0}
        self.cases[_key(case_id)] = _save(case)
        self.outstanding = u256(int(self.outstanding) + bounty)

    @gl.public.write.payable
    def commit_attempt(self, case_id: int, commitment: str) -> None:
        if gl.message.sender_address != gl.message.origin_address:
            _fail('commitment requires direct EOA caller')
        case = self._require_case(case_id)
        if case['status'] != 'OPEN' or _now() >= case['deadline']:
            _fail('case closed or expired')
        if case['active_attempt']:
            _fail('active attempt already exists')
        if not re.fullmatch(r'[0-9a-f]{64}', commitment):
            _fail('commitment must be sha256')
        bond = int(gl.message.value)
        required = max(10 ** 14, int(case['bounty']) // 20)
        if bond != required:
            _fail('bond must equal required 5% or minimum')
        self.attempt_count = u64(int(self.attempt_count) + 1)
        aid = int(self.attempt_count)
        claimant = gl.message.sender_address.as_hex.lower()
        attempt = {'id': aid, 'case_id': case_id, 'claimant': claimant,
                   'commitment': commitment, 'bond': str(bond), 'status': 'COMMITTED',
                   'committed_at': _now(), 'reveal_by': _now() + 7200,
                   'revealed_at': 0, 'verdict': '', 'reason': '',
                   'evidence_digest': '', 'anchor': '', 'thesis': ''}
        self.attempts[_key(aid)] = _save(attempt)
        case['active_attempt'] = aid
        case['attempts'] += 1
        self.cases[_key(case_id)] = _save(case)
        self.outstanding = u256(int(self.outstanding) + bond)

    @gl.public.write
    def reveal_attempt(self, attempt_id: int, salt: str, anchor: str, thesis: str) -> None:
        if gl.message.sender_address != gl.message.origin_address:
            _fail('reveal requires direct EOA caller')
        attempt = self._require_attempt(attempt_id)
        case = self._require_case(attempt['case_id'])
        claimant = gl.message.sender_address.as_hex.lower()
        if claimant != attempt['claimant'] or case['active_attempt'] != attempt_id:
            _fail('not active claimant')
        if attempt['status'] != 'COMMITTED' or _now() > attempt['reveal_by']:
            _fail('reveal period ended')
        if not re.fullmatch(r'[0-9a-f]{64}', salt):
            _fail('invalid reveal salt')
        if not 12 <= len(anchor) <= 260 or not 40 <= len(thesis) <= 1200:
            _fail('anchor or reasoning length invalid')
        if (not anchor.isascii() or not thesis.isascii() or '|' in anchor or
                '|' in thesis or any(ord(ch) < 9 or 13 < ord(ch) < 32 for ch in (anchor + thesis))):
            _fail('printable ASCII-only evidence required')
        expected = _hash_commit(61999, gl.message.contract_address.as_hex,
                                attempt['case_id'], claimant, salt, anchor, thesis)
        if expected != attempt['commitment']:
            _fail('commitment does not match')
        attempt['status'] = 'PENDING'
        attempt['revealed_at'] = _now()
        attempt['anchor'] = anchor
        attempt['thesis'] = thesis
        self.attempts[_key(attempt_id)] = _save(attempt)
        case['status'] = 'PENDING'
        self.cases[_key(case['id'])] = _save(case)
        # Message is created only after this reveal is FINALIZED.
        gl.get_contract_at(self.engine).emit(on='finalized').assess(
            u64(attempt_id), u64(case['id']), _save(case), anchor, thesis)

    @gl.public.write
    def on_verdict(self, case_id: int, attempt_id: int, verdict: str,
                   evidence_digest: str, reason: str) -> None:
        if gl.message.sender_address != self.engine:
            _fail('only ProofEngine may settle')
        case = self._require_case(case_id)
        attempt = self._require_attempt(attempt_id)
        if case['active_attempt'] != attempt_id or attempt['case_id'] != case_id:
            _fail('wrong case or stale attempt')
        if case['status'] != 'PENDING' or attempt['status'] not in ('PENDING', 'RECOVERY_REQUESTED'):
            _fail('attempt already handled')
        if verdict not in ('CONTRADICTED', 'NOT_ESTABLISHED', 'OUT_OF_SCOPE', 'INCONCLUSIVE'):
            _fail('unknown verdict')
        if len(reason) > 640 or len(evidence_digest) > 64:
            _fail('invalid result length')
        if verdict == 'INCONCLUSIVE':
            if evidence_digest:
                _fail('inconclusive result cannot claim an evidence digest')
        elif not re.fullmatch(r'[0-9a-f]{64}', evidence_digest):
            _fail('settled result needs valid evidence digest')
        attempt['status'] = 'SETTLED'
        attempt['verdict'] = verdict
        attempt['reason'] = reason
        attempt['evidence_digest'] = evidence_digest
        bond = int(attempt['bond'])
        if verdict == 'CONTRADICTED':
            case['status'] = 'WON'
            case['winner'] = attempt['claimant']
            case['won_attempt'] = attempt_id
            self._credit(attempt['claimant'], int(case['bounty']) + bond)
        elif verdict in ('NOT_ESTABLISHED', 'OUT_OF_SCOPE'):
            self._credit(case['sponsor'], bond)
            case['status'] = 'OPEN' if _now() < case['deadline'] else 'EXPIRED'
            if case['status'] == 'EXPIRED':
                self._credit(case['sponsor'], int(case['bounty']))
        else:
            self._credit(attempt['claimant'], bond)
            case['status'] = 'OPEN' if _now() < case['deadline'] else 'EXPIRED'
            if case['status'] == 'EXPIRED':
                self._credit(case['sponsor'], int(case['bounty']))
        case['active_attempt'] = 0
        self.cases[_key(case_id)] = _save(case)
        self.attempts[_key(attempt_id)] = _save(attempt)

    @gl.public.write
    def settle_unrevealed(self, attempt_id: int) -> None:
        attempt = self._require_attempt(attempt_id)
        case = self._require_case(attempt['case_id'])
        if attempt['status'] != 'COMMITTED' or _now() <= attempt['reveal_by']:
            _fail('not an expired commitment')
        if case['active_attempt'] != attempt_id:
            _fail('stale commitment')
        attempt['status'] = 'FORFEITED'
        self._credit(case['sponsor'], int(attempt['bond']))
        case['active_attempt'] = 0
        case['status'] = 'OPEN' if _now() < case['deadline'] else 'EXPIRED'
        if case['status'] == 'EXPIRED':
            self._credit(case['sponsor'], int(case['bounty']))
        self.cases[_key(case['id'])] = _save(case)
        self.attempts[_key(attempt_id)] = _save(attempt)

    @gl.public.write
    def recover_pending(self, attempt_id: int) -> None:
        """Request a finality-ordered, Engine-authorized recovery, never a
        synchronous cross-contract read. No credits are issued yet.
        """
        attempt = self._require_attempt(attempt_id)
        case = self._require_case(attempt['case_id'])
        if attempt['status'] not in ('PENDING', 'RECOVERY_REQUESTED') or case['active_attempt'] != attempt_id:
            _fail('not an active pending attempt')
        if _now() <= attempt['revealed_at'] + 604800:
            _fail('7-day recovery period not elapsed')
        attempt['status'] = 'RECOVERY_REQUESTED'
        self.attempts[_key(attempt_id)] = _save(attempt)
        # Delayed or failed child delivery can be retried without incrementing a
        # counter and without surrendering funds. Engine linearizes the
        # adjudication-vs-recovery race on its own state.
        gl.get_contract_at(self.engine).emit(on='finalized').request_recovery(
            u64(attempt_id), u64(case['id']))

    @gl.public.write
    def confirm_recovery(self, case_id: int, attempt_id: int) -> None:
        """Only ProofEngine may attest that the attempt was tombstoned BEFORE
        a verdict. This authenticated child is finality-triggered.
        """
        if gl.message.sender_address != self.engine:
            _fail('only ProofEngine may confirm recovery')
        case = self._require_case(case_id)
        attempt = self._require_attempt(attempt_id)
        if (attempt['case_id'] != case_id or case['active_attempt'] != attempt_id
                or case['status'] != 'PENDING' or attempt['status'] != 'RECOVERY_REQUESTED'):
            _fail('recovery is stale or already handled')
        attempt['status'] = 'RECOVERED'
        self._credit(attempt['claimant'], int(attempt['bond']))
        case['active_attempt'] = 0
        case['status'] = 'OPEN' if _now() < case['deadline'] else 'EXPIRED'
        if case['status'] == 'EXPIRED':
            self._credit(case['sponsor'], int(case['bounty']))
        self.cases[_key(case_id)] = _save(case)
        self.attempts[_key(attempt_id)] = _save(attempt)

    @gl.public.write
    def expire_case(self, case_id: int) -> None:
        case = self._require_case(case_id)
        if case['status'] != 'OPEN' or case['active_attempt'] or _now() < case['deadline']:
            _fail('not freely expirable')
        case['status'] = 'EXPIRED'
        self._credit(case['sponsor'], int(case['bounty']))
        self.cases[_key(case_id)] = _save(case)

    @gl.public.write
    def withdraw(self) -> None:
        recipient = gl.message.sender_address
        amount = int(self.credits.get(recipient, u256(0)))
        if amount <= 0:
            _fail('nothing to withdraw')
        if amount > int(self.outstanding):
            _fail('accounting invariant violated')
        # Withdrawal is only for the owner EOA, never an internal child call.
        # This narrows the external transfer to the wallet controlling the credit.
        if gl.message.sender_address != gl.message.origin_address:
            _fail('withdraw requires direct EOA caller')
        self.dispatch_count = u64(int(self.dispatch_count) + 1)
        dispatch_id = int(self.dispatch_count)
        self.dispatches[_key(dispatch_id)] = _save({
            'id': dispatch_id, 'recipient': recipient.as_hex.lower(),
            'amount_wei': str(amount), 'status': 'EMITTED_UNCONFIRMED',
            'created_at': _now()})
        self.credits[recipient] = u256(0)
        self.outstanding = u256(int(self.outstanding) - amount)
        self.total_dispatched = u256(int(self.total_dispatched) + amount)
        # EVM child is created after finalization. GenVM has no reliable
        # on-chain receipt callback for external EOA payment failure: never
        # infer receipt from the existence of this dispatch record.
        _Receiver(recipient).emit_transfer(value=u256(amount))

    def _credit(self, who: str, amount: int) -> None:
        addr = Address(who)
        self.credits[addr] = u256(int(self.credits.get(addr, u256(0))) + amount)

    def _require_case(self, case_id: int) -> dict:
        raw = self.cases.get(_key(case_id), '')
        if not raw or case_id <= 0:
            _fail('case does not exist')
        return _load(raw)

    def _require_attempt(self, attempt_id: int) -> dict:
        raw = self.attempts.get(_key(attempt_id), '')
        if not raw or attempt_id <= 0:
            _fail('attempt does not exist')
        return _load(raw)
