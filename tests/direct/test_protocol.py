"""Real GenLayer Test v0.29 Direct Mode; deliberately NOT a stub.

These tests require the testing-suite runtime and GenVM, and are never
silently skipped. Run `pytest tests/direct -v` after installing the exact
61999-supported test stack. Unit mocks live in tests/unit only.
"""
import json
import hashlib


_EVIDENCE = ('Official claim: Our protocol never exceeds a 2% distribution fee.\n'
             'MAX_FEE_BPS = 500\n')


def _addr(addr):
    if hasattr(addr, 'as_hex'):
        return addr.as_hex
    if isinstance(addr, (bytes, bytearray)):
        return '0x' + bytes(addr).hex()
    return str(addr)


def _engine(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    e = direct_deploy('contracts/ProofEngine.py')
    e.bind_vault(_addr(direct_alice))
    return e


def _payload(direct_vm, vault, direct_vm_owner, response=None):
    doc = _EVIDENCE
    source = _EVIDENCE
    # One deterministic body is intentionally served for both pinned paths;
    # the production contract still verifies each path's independent digest.
    direct_vm.mock_web('raw.githubusercontent.com', {'status': 200, 'body': doc})
    if response is None:
        response = {
            'verdict': 'CONTRADICTED', 'scope_ok': True, 'proof_complete': True,
            'contradiction': True, 'reason': 'The released fee path exceeds the exact published ceiling.'
        }
    direct_vm.mock_llm('independent software-claim adjudicator', json.dumps(response))
    return doc, source, {
        'id': 1, 'active_attempt': 1, 'status': 'PENDING', 'owner': 'demo',
        'repo': 'fees', 'commit': 'a' * 40, 'doc_path': 'docs/fees.md',
        'source_path': 'src/fees.py',
        'claim': 'Our protocol never exceeds a 2% distribution fee.',
        'doc_digest': hashlib.sha256(doc.encode()).hexdigest(),
        'source_digest': hashlib.sha256(source.encode()).hexdigest(),
    }


def _commit(vault_address, case_id, claimant, salt, anchor, thesis):
    canonical = json.dumps([
        '61999', _addr(vault_address).lower(), str(case_id),
        _addr(claimant).lower(), salt, anchor, thesis,
    ], separators=(',', ':'))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _fund_and_reveal(direct_vm, vault, vault_address, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    direct_vm.value = 10 ** 18
    vault.create_case('Frozen fee statement', 'demo', 'fees', 'a' * 40,
                      'docs/fees.md', 'src/fees.py',
                      'Our protocol never exceeds a 2% distribution fee.',
                      hashlib.sha256(_EVIDENCE.encode()).hexdigest(),
                      hashlib.sha256(_EVIDENCE.encode()).hexdigest(), 72)
    direct_vm.sender = direct_bob
    direct_vm.origin = direct_bob
    salt = 'f' * 64
    anchor = 'MAX_FEE_BPS = 500'
    thesis = 'This enabled fee path allows 500 bps when the claim promises only 200 bps.'
    direct_vm.value = 5 * 10 ** 16
    vault.commit_attempt(1, _commit(vault_address, 1, direct_bob, salt, anchor, thesis))
    direct_vm.value = 0
    vault.reveal_attempt(1, salt, anchor, thesis)
    return json.loads(vault.get_case(1)), salt, anchor, thesis


def _activated_vault(direct_vm, direct_deploy, direct_alice):
    direct_vm._chain_id = 61999
    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    vault = direct_deploy('contracts/PromiseVault.py', _addr(direct_alice))
    vault_address = direct_vm._contract_address
    # In this isolated Direct Mode test, Alice is the configured engine.
    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    vault.activate_engine()
    return vault, vault_address


def test_engine_one_time_binding(direct_vm, direct_deploy, direct_alice, direct_bob):
    e = _engine(direct_vm, direct_deploy, direct_alice)
    assert e.get_vault().lower() == _addr(direct_alice).lower()
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert('one-time deployer'):
        e.bind_vault(_addr(direct_bob))


def test_unbound_engine_cannot_resend_activation(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    e = direct_deploy('contracts/ProofEngine.py')
    with direct_vm.expect_revert('not bound'):
        e.resend_activation()


def test_only_configured_vault_can_assess(direct_vm, direct_deploy, direct_alice, direct_bob):
    e = _engine(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert('only bound vault'):
        e.assess(2, 1, '{}', 'SOME ANCHOR TEXT', 'This thesis is certainly long enough to reach the authorization check.')


def test_invalid_payload_is_rejected_before_web_or_model(direct_vm, direct_deploy, direct_alice):
    e = _engine(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert('incomplete frozen case payload'):
        e.assess(2, 1, json.dumps({'id':1, 'active_attempt':2, 'status':'OPEN'}),
                 'SOME ANCHOR TEXT', 'A descriptive argument over forty characters to exercise the guard.')


def test_wrong_case_reference_cannot_settle(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    v = direct_deploy('contracts/PromiseVault.py', _addr(direct_alice))
    with direct_vm.expect_revert('case does not exist'):
        v.expire_case(1)


def test_unconfigured_vault_rejects_funding_without_child_activation(direct_vm, direct_deploy, direct_alice):
    direct_vm.sender = direct_alice
    direct_vm._chain_id = 61999
    v = direct_deploy('contracts/PromiseVault.py', _addr(direct_alice))
    with direct_vm.expect_revert('activation pending'):
        v.create_case('Frozen fee statement', 'demo', 'fees', 'a'*40,
                      'docs/fees.md', 'src/fees.py',
                      'Our protocol never exceeds a 2% distribution fee.',
                      '0'*64, '1'*64, 72)


def test_validator_rejects_forged_success_after_independent_web_fetch(direct_vm, direct_deploy, direct_alice):
    """Requires the v0.29 mock_web and mock_llm Direct Mode interfaces."""
    direct_vm.sender = direct_alice
    e = _engine(direct_vm, direct_deploy, direct_alice)
    blob = ('Official claim: Our protocol never exceeds a 2% distribution fee.\n'
            'MAX_FEE_BPS = 500\n')
    digest = hashlib.sha256(blob.encode()).hexdigest()
    # Both file paths are mapped to this one fixture body for a controlled
    # semantic validator disagreement rather than source routing behavior.
    direct_vm.mock_web('raw.githubusercontent.com', {'method':'GET', 'status':200, 'body':blob})
    direct_vm.mock_llm('You are an independent software-claim adjudicator.', json.dumps({
        'verdict':'NOT_ESTABLISHED', 'scope_ok':True, 'proof_complete':False,
        'contradiction':False, 'reason':'One code excerpt alone does not prove reachability.'}))
    payload = dict(id=9, active_attempt=10, status='PENDING', owner='demo',
                   repo='fees', commit='a'*40, doc_path='docs/fees.md',
                   source_path='src/fees.py', doc_digest=digest,
                   source_digest=digest, claim='Our protocol never exceeds a 2% distribution fee.')
    e.assess(10, 9, json.dumps(payload), 'MAX_FEE_BPS = 500',
             'We suspect the 500 bps limit violates the exact documented fee ceiling.')
    hostile = {'verdict':'CONTRADICTED', 'scope_ok':True, 'proof_complete':True,
               'contradiction':True, 'digest':hashlib.sha256(blob.encode()*2).hexdigest()}
    assert direct_vm.run_validator(leader_result=hostile) is False


def test_complete_engine_adjudication_and_neutral_malformed_response(
        direct_vm, direct_deploy, direct_alice):
    engine = _engine(direct_vm, direct_deploy, direct_alice)
    _, _, payload = _payload(direct_vm, engine, direct_alice)
    direct_vm.sender = direct_alice
    engine.assess(1, 1, json.dumps(payload), 'MAX_FEE_BPS = 500',
                  'The enabled fee path allows 500 basis points under the exact release.')
    record = json.loads(engine.get_verdict(1))
    assert record['verdict'] == 'CONTRADICTED'
    assert len(record['digest']) == 64
    hostile = dict(record, verdict='NOT_ESTABLISHED', proof_complete=False,
                   contradiction=False)
    assert direct_vm.run_validator(leader_result=hostile) is False

    # A schema-valid but semantically malformed AI answer is neutral, never a
    # challenger-losing result, and carries no settlement digest.
    direct_vm.clear_mocks()
    _, _, malformed = _payload(direct_vm, engine, direct_alice, response={})
    engine.assess(2, 2, json.dumps(dict(malformed, id=2, active_attempt=2)),
                  'MAX_FEE_BPS = 500',
                  'This bounded argument is long enough to exercise malformed response handling.')
    neutral = json.loads(engine.get_verdict(2))
    assert neutral['verdict'] == 'INCONCLUSIVE'
    assert neutral['digest'] == ''


def test_vault_callback_financial_conservation_and_duplicate_message(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    vault, vault_address = _activated_vault(direct_vm, direct_deploy, direct_alice)
    case, _, _, _ = _fund_and_reveal(
        direct_vm, vault, vault_address, direct_alice, direct_bob)
    digest = 'e' * 64
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert('only ProofEngine'):
        vault.on_verdict(1, 1, 'CONTRADICTED', digest, 'forged callback')

    direct_vm.sender = direct_alice
    direct_vm.origin = direct_bob
    vault.on_verdict(1, 1, 'CONTRADICTED', digest, 'Verified contradiction')
    assert json.loads(vault.get_case(1))['status'] == 'WON'
    prize = 10 ** 18 + 5 * 10 ** 16
    assert int(vault.get_credit(_addr(direct_bob))) == prize
    assert int(json.loads(vault.get_treasury_status())['outstanding_wei']) == prize
    with direct_vm.expect_revert('wrong case or stale attempt'):
        vault.on_verdict(1, 1, 'CONTRADICTED', digest, 'duplicate callback')

    direct_vm.sender = direct_bob
    direct_vm.origin = direct_bob
    vault.withdraw()
    assert int(vault.get_credit(_addr(direct_bob))) == 0
    status = json.loads(vault.get_treasury_status())
    assert status['outstanding_wei'] == '0'
    assert 'EMITTED_UNCONFIRMED' in vault.get_dispatch(1)
    with direct_vm.expect_revert('nothing'):
        vault.withdraw()


def test_recovery_tombstone_blocks_late_assessment_and_duplicate_confirmation(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    vault, vault_address = _activated_vault(direct_vm, direct_deploy, direct_alice)
    direct_vm.warp('2026-01-01T00:00:00Z')
    _fund_and_reveal(
        direct_vm, vault, vault_address, direct_alice, direct_bob)
    direct_vm.warp('2026-01-08T00:00:01Z')
    direct_vm.sender = direct_bob
    direct_vm.origin = direct_bob
    vault.recover_pending(1)
    assert json.loads(vault.get_attempt(1))['status'] == 'RECOVERY_REQUESTED'

    direct_vm.sender = direct_alice
    direct_vm.origin = direct_bob
    vault.confirm_recovery(1, 1)
    assert json.loads(vault.get_attempt(1))['status'] == 'RECOVERED'
    assert int(vault.get_credit(_addr(direct_bob))) == 5 * 10 ** 16

    with direct_vm.expect_revert('recovery is stale'):
        vault.confirm_recovery(1, 1)


def test_recovery_race_prefers_materialized_verdict_over_refund(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    engine = _engine(direct_vm, direct_deploy, direct_alice)
    engine.verdicts['1'] = json.dumps({
        'case_id': 1, 'attempt_id': 1, 'verdict': 'CONTRADICTED',
        'digest': 'e' * 64, 'reason': 'Stored before recovery request.'})
    direct_vm.sender = direct_alice
    engine.request_recovery(1, 1)
    assert engine.recovered.get('1', False) is not True
    engine.verdicts['1'] = ''
    engine.request_recovery(2, 2)
    assert engine.recovered.get('2') is True
