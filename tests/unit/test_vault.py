import json
import pytest
from tests.unit.conftest import VAULTMOD, MSG, EMISSIONS, TRANSFERS, VIEWS, SPONSOR, CLAIMANT, ATTACKER, ENGINE, VAULT, Address, UserError, commit

def test_cli_address_constructor_is_normalized():
    vault=VAULTMOD.PromiseVault(Address(ENGINE))
    assert vault.engine.as_hex.lower()==ENGINE.lower()

def test_funded_claim_frozen(published):
    c=published._require_case(1)
    assert c['commit']=='a'*40 and c['status']=='OPEN'
    assert published.outstanding==10**18
    assert published.get_counts()=='{"attempts":0,"cases":1}'

def test_reject_wrong_chain(vault):
    MSG.chain_id=61997;MSG.value=10**18
    with pytest.raises(UserError,match='61999'):
        vault.create_case('The fee ceiling','demo','fees','a'*40,'docs/fees.md','src/fees.py','Our protocol never exceeds a 2% distribution fee.','0'*64,'1'*64,72)

def test_bad_repo_and_path(vault):
    MSG.value=10**18
    for path in ('../secret','src/%2e%2e/file.py','https://evil.test','/home/app.py','src//file.py'):
        with pytest.raises(UserError):
            vault.create_case('The fee ceiling','demo','fees','a'*40,'docs/fees.md',path,'Our protocol never exceeds a 2% distribution fee.','0'*64,'1'*64,72)

def test_commit_reveal_attaches_finalized_message(published):
    salt,anchor,thesis=commit(published)
    assert published._require_attempt(1)['status']=='COMMITTED'
    published.reveal_attempt(1,salt,anchor,thesis)
    assert published._require_case(1)['status']=='PENDING'
    assert EMISSIONS[-1][1]==ENGINE
    assert EMISSIONS[-1][-1]['on']=='finalized'

def test_wrong_reveal_never_initiates_judgment(published):
    salt,anchor,thesis=commit(published)
    with pytest.raises(UserError,match='commitment'):
        published.reveal_attempt(1,'e'*64,anchor,thesis)
    assert not EMISSIONS

def test_duplicate_open_attempt_rejected(published):
    commit(published)
    with pytest.raises(UserError,match='active'):
        commit(published,who=ATTACKER)

def test_only_engine_may_settle(published):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    with pytest.raises(UserError,match='only ProofEngine'):
        published.on_verdict(1,1,'CONTRADICTED','a'*64,'fake')

def test_success_pays_claimant_and_refunds_bond(published):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    MSG.sender_address=Address(ENGINE)
    published.on_verdict(1,1,'CONTRADICTED','e'*64,'Verified contradiction')
    assert published.get_credit(CLAIMANT)==str(10**18+10**18//20)
    assert published._require_case(1)['winner']==CLAIMANT
    with pytest.raises(UserError):published.on_verdict(1,1,'CONTRADICTED','e'*64,'replay')
    MSG.sender_address=Address(CLAIMANT)
    MSG.origin_address=Address(CLAIMANT)
    published.withdraw()
    assert TRANSFERS==[(CLAIMANT,10**18+10**18//20)]
    assert published.get_credit(CLAIMANT)=='0'
    assert published.outstanding==0
    assert published.dispatch_count==1
    assert 'EMITTED_UNCONFIRMED' in published.get_dispatch(1)
    assert published.get_treasury_status() != ''

def test_invalid_proof_bond_sponsor_and_new_attempt(published):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    MSG.sender_address=Address(ENGINE)
    published.on_verdict(1,1,'NOT_ESTABLISHED','e'*64,'Missing call graph')
    assert published.get_credit(SPONSOR)==str(10**18//20)
    assert published._require_case(1)['status']=='OPEN'
    assert published._require_case(1)['active_attempt']==0
    commit(published,who=ATTACKER)
    assert published.attempt_count==2

def test_inconclusive_refunds_bond_not_bounty(published):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    MSG.sender_address=Address(ENGINE)
    published.on_verdict(1,1,'INCONCLUSIVE','','Unavailable')
    assert published.get_credit(CLAIMANT)==str(10**18//20)
    assert published.get_credit(SPONSOR)=='0'
    assert published.outstanding==10**18+10**18//20

def test_unrevealed_forfeit_and_expiry(published,monkeypatch):
    commit(published)
    monkeypatch.setattr(VAULTMOD,'_now',lambda:107202)
    published.settle_unrevealed(1)
    assert published.get_credit(SPONSOR)==str(10**18//20)
    monkeypatch.setattr(VAULTMOD,'_now',lambda:400000)
    published.expire_case(1)
    assert published._require_case(1)['status']=='EXPIRED'
    assert published.get_credit(SPONSOR)==str(10**18+10**18//20)
    with pytest.raises(UserError):published.expire_case(1)

def test_sponsor_cannot_reclaim_while_challenge_is_pending(published):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    with pytest.raises(UserError,match='not freely expirable'):
        published.expire_case(1)
    assert published._require_case(1)['status']=='PENDING'
    assert published.get_credit(SPONSOR)=='0'
    assert published.outstanding==10**18+10**18//20

def test_pending_timeout_with_stored_verdict_replays_win_not_refund(published,engine,monkeypatch):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    engine.verdicts['1']='{"case_id":1,"attempt_id":1,"verdict":"CONTRADICTED","digest":"'+'e'*64+'","reason":"Verified"}'
    monkeypatch.setattr(VAULTMOD,'_now',lambda:100000+604802)
    published.recover_pending(1)
    assert published._require_attempt(1)['status']=='RECOVERY_REQUESTED'
    assert published.get_credit(CLAIMANT)=='0'
    MSG.sender_address=Address(VAULT)
    engine.request_recovery(1,1)
    assert EMISSIONS[-1][2]=='on_verdict'
    assert not engine.recovered.get(1,False)
    MSG.sender_address=Address(ENGINE)
    published.on_verdict(1,1,'CONTRADICTED','e'*64,'Verified')
    assert published._require_case(1)['status']=='WON'
    assert published.get_credit(CLAIMANT)==str(10**18+10**18//20)


def test_pending_timeout_refunds_only_after_engine_tombstone(published,engine,monkeypatch):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    monkeypatch.setattr(VAULTMOD,'_now',lambda:100000+604802)
    published.recover_pending(1)
    assert published.get_credit(CLAIMANT)=='0'
    assert EMISSIONS[-1][2]=='request_recovery'
    MSG.sender_address=Address(VAULT)
    engine.request_recovery(1,1)
    assert engine.recovered['1'] is True
    assert EMISSIONS[-1][2]=='confirm_recovery'
    MSG.sender_address=Address(ENGINE)
    published.confirm_recovery(1,1)
    assert published.get_credit(CLAIMANT)==str(10**18//20)
    assert published._require_case(1)['status']=='EXPIRED'
    assert published.get_credit(SPONSOR)==str(10**18)


def test_canceled_attempt_cannot_generate_new_verdict(published,engine,monkeypatch):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    monkeypatch.setattr(VAULTMOD,'_now',lambda:100000+604802)
    published.recover_pending(1)
    MSG.sender_address=Address(VAULT)
    engine.request_recovery(1,1)
    with pytest.raises(UserError, match='already recovered'):
        engine.assess(1,1,published.get_case(1),anchor,thesis)
    assert engine.get_verdict(1)==''


def test_untrusted_wallet_cannot_force_recovery_confirmation(published,engine,monkeypatch):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    monkeypatch.setattr(VAULTMOD,'_now',lambda:100000+604802)
    published.recover_pending(1)
    MSG.sender_address=Address(ATTACKER)
    with pytest.raises(UserError, match='only ProofEngine'):
        published.confirm_recovery(1,1)
    with pytest.raises(UserError, match='only bound vault'):
        engine.request_recovery(1,1)
    assert published.get_credit(CLAIMANT)=='0'

def test_withdraw_zero_reverts(published):
    with pytest.raises(UserError,match='nothing'):
        published.withdraw()

def test_pagination_is_bounded(published):
    with pytest.raises(UserError):published.list_cases(0,10000)
    assert len(published.list_cases(0,24))>0

def test_stale_challenge_cannot_settle_second_time(published):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    MSG.sender_address=Address(ENGINE)
    published.on_verdict(1,1,'OUT_OF_SCOPE','e'*64,'wrong path')
    with pytest.raises(UserError):published.on_verdict(1,1,'CONTRADICTED','e'*64,'late')


def test_withdraw_rejects_cross_contract_origin(published):
    published.credits[Address(CLAIMANT)] = 10**14
    published.outstanding += 10**14
    MSG.sender_address = Address(CLAIMANT)
    MSG.origin_address = Address(SPONSOR)
    with pytest.raises(UserError, match='direct EOA'):
        published.withdraw()
    assert published.get_credit(CLAIMANT) == str(10**14)
    assert published.dispatch_count == 0

def test_wallet_cannot_withdraw_another_wallets_credit(published):
    published.credits[Address(CLAIMANT)] = 10**14
    published.outstanding += 10**14
    MSG.sender_address = Address(SPONSOR)
    MSG.origin_address = Address(SPONSOR)
    with pytest.raises(UserError, match='nothing'):
        published.withdraw()
    assert published.get_credit(CLAIMANT) == str(10**14)
    assert published.dispatch_count == 0


def test_dispatch_is_not_equated_with_evm_receipt(published):
    published.credits[Address(SPONSOR)] = 10**15
    published.outstanding += 10**15
    MSG.sender_address=Address(SPONSOR)
    MSG.origin_address=Address(SPONSOR)
    published.withdraw()
    record = published.get_dispatch(1)
    assert 'EMITTED_UNCONFIRMED' in record
    assert 'PAID' not in record
    assert published.total_dispatched == 10**15
    with pytest.raises(UserError, match='nothing'):
        published.withdraw()


def test_funding_requires_finalized_engine_activation(vault):
    MSG.value=10**18
    with pytest.raises(UserError, match='activation pending'):
        vault.create_case('The fee ceiling','demo','fees','a'*40,'docs/fees.md','src/fees.py',
            'Our protocol never exceeds a 2% distribution fee.','0'*64,'1'*64,72)
    assert vault.get_counts()=='{"attempts":0,"cases":0}'

def test_replacement_vault_blocks_funding_by_default(vault, engine):
    MSG.value=10**18
    with pytest.raises(UserError, match='live funding disabled'):
        vault.create_case('The fee ceiling','demo','fees','a'*40,'docs/fees.md','src/fees.py',
            'Our protocol never exceeds a 2% distribution fee.','0'*64,'1'*64,72)
    assert vault.get_counts()=='{"attempts":0,"cases":0}'
    assert json.loads(vault.get_config())['funding_enabled'] is False


def test_replacement_vault_blocks_challenger_bonds_by_default(vault):
    MSG.value=5 * 10**16
    with pytest.raises(UserError, match='live funding disabled'):
        vault.commit_attempt(1, 'a' * 64)
    assert vault.attempt_count == 0


def test_funding_gate_preserves_balances_counts_and_storage(vault, engine):
    before = {
        'config': vault.get_config(),
        'counts': vault.get_counts(),
        'treasury': vault.get_treasury_status(),
        'cases': dict(vault.cases),
        'attempts': dict(vault.attempts),
        'credits': dict(vault.credits),
        'dispatches': dict(vault.dispatches),
        'outstanding': vault.outstanding,
        'total_dispatched': vault.total_dispatched,
    }
    MSG.value = 10**18
    with pytest.raises(UserError, match='live funding disabled'):
        vault.create_case('The fee ceiling', 'demo', 'fees', 'a' * 40,
                          'docs/fees.md', 'src/fees.py',
                          'Our protocol never exceeds a 2% distribution fee.',
                          '0' * 64, '1' * 64, 72)
    MSG.value = 5 * 10**16
    with pytest.raises(UserError, match='live funding disabled'):
        vault.commit_attempt(1, 'a' * 64)
    after = {
        'config': vault.get_config(),
        'counts': vault.get_counts(),
        'treasury': vault.get_treasury_status(),
        'cases': dict(vault.cases),
        'attempts': dict(vault.attempts),
        'credits': dict(vault.credits),
        'dispatches': dict(vault.dispatches),
        'outstanding': vault.outstanding,
        'total_dispatched': vault.total_dispatched,
    }
    assert after == before


def test_only_bound_engine_may_activate(vault):
    MSG.sender_address=Address(ATTACKER)
    with pytest.raises(UserError, match='only configured'):
        vault.activate_engine()
    assert not vault.engine_ready
    MSG.sender_address=Address(ENGINE)
    vault.activate_engine()
    vault.activate_engine()  # benign duplicate finalized child delivery
    assert vault.engine_ready


def test_value_entrypoints_reject_internal_call_origins(published):
    """A child contract must not impersonate the wallet that owns the value."""
    MSG.sender_address = Address(CLAIMANT)
    MSG.origin_address = Address(SPONSOR)
    MSG.value = 10**14
    with pytest.raises(UserError, match='direct EOA'):
        published.commit_attempt(1, 'a' * 64)
    assert published.attempt_count == 0

    MSG.sender_address = Address(SPONSOR)
    MSG.origin_address = Address(ATTACKER)
    MSG.value = 10**18
    with pytest.raises(UserError, match='direct EOA'):
        published.create_case('Another claim', 'demo', 'fees', 'b' * 40,
                              'docs/fees.md', 'src/fees.py',
                              'This is another sufficiently long published claim.',
                              '0' * 64, '1' * 64, 72)
    assert published.case_count == 1
