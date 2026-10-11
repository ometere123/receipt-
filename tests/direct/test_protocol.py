"""Real GenLayer Test v0.29 Direct Mode; deliberately NOT a stub.

These tests require the testing-suite runtime and GenVM, and are never
silently skipped. Run `pytest tests/direct -v` after installing the exact
61999-supported test stack. Unit mocks live in tests/unit only.
"""
import json
import hashlib


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
