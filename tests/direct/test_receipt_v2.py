"""Direct Mode coverage for the final, funded ReceiptV2 contract.

These tests execute the real pinned GenVM contract rather than a unit shim.
External GEN dispatch is asserted at the contract boundary as an emitted EVM
transfer and an explicit unconfirmed dispatch record; no receipt is invented.
"""
import hashlib
import json


CHAIN = 61999
BOUNTY = 10 ** 18
BOND = 5 * 10 ** 16
DOC = ('Official claim: Our protocol never exceeds a 2% distribution fee.\n'
       'MAX_FEE_BPS = 500\n')
SOURCE = DOC
COMMIT = 'a' * 40
DOC_DIGEST = hashlib.sha256(DOC.encode()).hexdigest()
SOURCE_DIGEST = hashlib.sha256(SOURCE.encode()).hexdigest()


def _addr(value):
    if hasattr(value, 'as_hex'):
        return value.as_hex
    if isinstance(value, (bytes, bytearray)):
        return '0x' + bytes(value).hex()
    return str(value)


def _commitment(vault, case_id, claimant, salt, anchor, thesis):
    canonical = json.dumps([
        str(CHAIN), _addr(vault).lower(), str(case_id), _addr(claimant).lower(),
        salt, anchor, thesis,
    ], separators=(',', ':'))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _deploy(direct_vm, direct_deploy, direct_alice):
    direct_vm._chain_id = CHAIN
    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    direct_vm.value = 0
    vault = direct_deploy('contracts/ReceiptV2.py')
    return vault, direct_vm._contract_address


def _fund_and_reveal(direct_vm, vault, vault_address, direct_alice, direct_bob):
    direct_vm._chain_id = CHAIN
    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    direct_vm.value = BOUNTY
    vault.create_case(
        'Frozen fee statement', 'demo', 'fees', COMMIT, 'docs/fees.md',
        'src/fees.py', 'Our protocol never exceeds a 2% distribution fee.',
        DOC_DIGEST, SOURCE_DIGEST, 72)

    salt = 'f' * 64
    anchor = 'MAX_FEE_BPS = 500'
    thesis = 'This enabled fee path allows 500 bps when the claim promises only 200 bps.'
    direct_vm.sender = direct_bob
    direct_vm.origin = direct_bob
    direct_vm.value = BOND
    vault.commit_attempt(1, _commitment(vault_address, 1, direct_bob, salt, anchor, thesis))
    direct_vm.value = 0
    vault.reveal_attempt(1, salt, anchor, thesis)
    return salt, anchor, thesis


def _positive_mocks(direct_vm):
    direct_vm.mock_web('raw.githubusercontent.com', {
        'method': 'GET', 'status': 200, 'body': DOC})
    direct_vm.mock_llm(
        'independent software-claim adjudicator',
        json.dumps({
            'verdict': 'CONTRADICTED', 'scope_ok': True,
            'proof_complete': True, 'contradiction': True,
            'reason': 'The released fee path exceeds the exact published ceiling.',
        }))


def test_v2_is_one_funded_single_contract_on_studionet(
        direct_vm, direct_deploy, direct_alice):
    vault, _ = _deploy(direct_vm, direct_deploy, direct_alice)
    config = json.loads(vault.get_config())
    assert config == {
        'architecture': 'SINGLE_IC', 'engine_ready': True, 'chain': CHAIN,
        'funding_enabled': True, 'funding_mode': 'NATIVE_GEN',
        'withdrawal_status': 'EVM_DISPATCH_EMITTED_UNCONFIRMED',
        'external_messages': 'EVM_INTERFACE', 'minimum_bounty_wei': str(10 ** 15),
        'commit_reveal_seconds': 7200, 'pending_timeout_seconds': 604800,
    }


def test_funding_sponsor_commit_and_reveal_are_real_payable_operations(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    vault, address = _deploy(direct_vm, direct_deploy, direct_alice)
    _fund_and_reveal(direct_vm, vault, address, direct_alice, direct_bob)
    case = json.loads(vault.get_case(1))
    attempt = json.loads(vault.get_attempt(1))
    assert case['sponsor'].lower() == _addr(direct_alice).lower()
    assert case['status'] == 'PENDING'
    assert attempt['claimant'].lower() == _addr(direct_bob).lower()
    assert attempt['status'] == 'PENDING'
    treasury = json.loads(vault.get_treasury_status())
    assert treasury['accepted_wei'] == str(BOUNTY + BOND)
    assert treasury['outstanding_wei'] == treasury['accepted_wei']


def test_adjudication_fetches_both_pinned_sources_and_settles_positive_contradiction(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    vault, address = _deploy(direct_vm, direct_deploy, direct_alice)
    _fund_and_reveal(direct_vm, vault, address, direct_alice, direct_bob)
    _positive_mocks(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    assert vault.adjudicate_attempt(1) == 'CONTRADICTED'
    record = json.loads(vault.get_verdict(1))
    assert record['verdict'] == 'CONTRADICTED'
    assert record['digest'] == hashlib.sha256(DOC.encode() + SOURCE.encode()).hexdigest()
    assert json.loads(vault.get_case(1))['status'] == 'WON'
    assert int(vault.get_credit(_addr(direct_bob))) == BOUNTY + BOND


def test_not_established_preserves_bounty_for_the_open_case(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    vault, address = _deploy(direct_vm, direct_deploy, direct_alice)
    _fund_and_reveal(direct_vm, vault, address, direct_alice, direct_bob)
    direct_vm.mock_web('raw.githubusercontent.com', {'status': 200, 'body': DOC})
    direct_vm.mock_llm('independent software-claim adjudicator', json.dumps({
        'verdict': 'NOT_ESTABLISHED', 'scope_ok': True,
        'proof_complete': False, 'contradiction': False,
        'reason': 'The bounded material does not establish the claimed contradiction.',
    }))
    assert vault.adjudicate_attempt(1) == 'NOT_ESTABLISHED'
    assert json.loads(vault.get_case(1))['status'] == 'OPEN'
    assert int(vault.get_credit(_addr(direct_alice))) == BOND
    assert int(vault.get_credit(_addr(direct_bob))) == 0


def test_malformed_and_unavailable_sources_are_neutral(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    vault, address = _deploy(direct_vm, direct_deploy, direct_alice)
    _fund_and_reveal(direct_vm, vault, address, direct_alice, direct_bob)
    direct_vm.mock_web('raw.githubusercontent.com', {'status': 503, 'body': ''})
    direct_vm.mock_llm('independent software-claim adjudicator', json.dumps({}))
    assert vault.adjudicate_attempt(1) == 'INCONCLUSIVE'
    verdict = json.loads(vault.get_verdict(1))
    assert verdict['digest'] == ''
    assert json.loads(vault.get_attempt(1))['status'] == 'SETTLED'
    assert int(vault.get_credit(_addr(direct_bob))) == BOND
    assert int(vault.get_credit(_addr(direct_alice))) == 0


def test_malicious_leader_result_is_rejected_by_independent_validator(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    vault, address = _deploy(direct_vm, direct_deploy, direct_alice)
    _fund_and_reveal(direct_vm, vault, address, direct_alice, direct_bob)
    _positive_mocks(direct_vm)
    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    vault.adjudicate_attempt(1)
    hostile = {
        'verdict': 'CONTRADICTED', 'scope_ok': True,
        'proof_complete': True, 'contradiction': True,
        'digest': 'f' * 64,
    }
    assert direct_vm.run_validator(leader_result=hostile) is False
    assert json.loads(vault.get_attempt(1))['status'] == 'SETTLED'


def test_duplicate_adjudication_and_duplicate_withdrawal_are_rejected(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    vault, address = _deploy(direct_vm, direct_deploy, direct_alice)
    _fund_and_reveal(direct_vm, vault, address, direct_alice, direct_bob)
    _positive_mocks(direct_vm)
    vault.adjudicate_attempt(1)
    with direct_vm.expect_revert('not an assessable pending'):
        vault.adjudicate_attempt(1)
    direct_vm.sender = direct_bob
    direct_vm.origin = direct_bob
    vault.withdraw()
    with direct_vm.expect_revert('nothing to withdraw'):
        vault.withdraw()
    assert json.loads(vault.get_treasury_status())['dispatch_count'] == 1


def test_withdrawal_is_recipient_restricted_and_obeys_conservation(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    vault, address = _deploy(direct_vm, direct_deploy, direct_alice)
    _fund_and_reveal(direct_vm, vault, address, direct_alice, direct_bob)
    _positive_mocks(direct_vm)
    vault.adjudicate_attempt(1)
    before = json.loads(vault.get_treasury_status())
    assert before['accepted_wei'] == before['outstanding_wei']

    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    with direct_vm.expect_revert('nothing to withdraw'):
        vault.withdraw()

    direct_vm.sender = direct_bob
    direct_vm.origin = direct_alice
    with direct_vm.expect_revert('direct EOA caller'):
        vault.withdraw()
    assert int(vault.get_credit(_addr(direct_bob))) == BOUNTY + BOND

    direct_vm.origin = direct_bob
    vault.withdraw()
    after = json.loads(vault.get_treasury_status())
    assert after['accepted_wei'] == str(int(after['outstanding_wei']) + int(after['external_dispatch_wei']))
    assert after['outstanding_wei'] == '0'
    dispatch = json.loads(vault.get_dispatch(1))
    assert dispatch['recipient'].lower() == _addr(direct_bob).lower()
    assert dispatch['amount_wei'] == str(BOUNTY + BOND)
    assert dispatch['status'] == 'EMITTED_UNCONFIRMED'


def test_timeout_recovery_is_terminal_and_blocks_late_adjudication(
        direct_vm, direct_deploy, direct_alice, direct_bob):
    vault, address = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.warp('2026-01-01T00:00:00Z')
    _fund_and_reveal(direct_vm, vault, address, direct_alice, direct_bob)
    direct_vm.warp('2026-01-08T00:00:01Z')
    vault.recover_pending(1)
    assert json.loads(vault.get_attempt(1))['status'] == 'RECOVERED'
    assert int(vault.get_credit(_addr(direct_bob))) == BOND
    with direct_vm.expect_revert('not an assessable pending'):
        vault.adjudicate_attempt(1)


def test_wrong_wallet_and_wrong_network_are_rejected(
        direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    vault, address = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm._chain_id = 61998
    direct_vm.sender = direct_alice
    direct_vm.origin = direct_alice
    direct_vm.value = BOUNTY
    with direct_vm.expect_revert('Studionet 61999'):
        vault.create_case(
            'Frozen fee statement', 'demo', 'fees', COMMIT, 'docs/fees.md',
            'src/fees.py', 'Our protocol never exceeds a 2% distribution fee.',
            DOC_DIGEST, SOURCE_DIGEST, 72)
    direct_vm._chain_id = CHAIN
    direct_vm.value = BOUNTY
    vault.create_case(
        'Frozen fee statement', 'demo', 'fees', COMMIT, 'docs/fees.md',
        'src/fees.py', 'Our protocol never exceeds a 2% distribution fee.',
        DOC_DIGEST, SOURCE_DIGEST, 72)
    direct_vm.sender = direct_bob
    direct_vm.origin = direct_bob
    direct_vm.value = BOND
    thesis = 'This enabled fee path allows 500 bps when the claim promises only 200 bps.'
    vault.commit_attempt(1, _commitment(address, 1, direct_bob, 'f' * 64,
                                         'MAX_FEE_BPS = 500', thesis))
    direct_vm.value = 0
    with direct_vm.expect_revert('not active claimant'):
        direct_vm.sender = direct_charlie
        direct_vm.origin = direct_charlie
        vault.reveal_attempt(1, 'f' * 64, 'MAX_FEE_BPS = 500', thesis)
