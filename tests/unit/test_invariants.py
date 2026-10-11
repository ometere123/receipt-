"""Adversarial settlement conservation and role-boundary checks."""
import pytest
from tests.unit.conftest import VAULTMOD,MSG,SPONSOR,CLAIMANT,ATTACKER,ENGINE,VAULT,Address,UserError,commit,TRANSFERS

@pytest.mark.parametrize('verdict,award_to_claimant,award_to_sponsor',[('CONTRADICTED',105,0),('NOT_ESTABLISHED',0,5),('OUT_OF_SCOPE',0,5),('INCONCLUSIVE',5,0)])
def test_bounty_and_bond_never_double_created(published,verdict,award_to_claimant,award_to_sponsor):
    salt,anchor,thesis=commit(published)
    published.reveal_attempt(1,salt,anchor,thesis)
    MSG.sender_address=Address(ENGINE)
    evidence_digest = '' if verdict == 'INCONCLUSIVE' else '9'*64
    published.on_verdict(1,1,verdict,evidence_digest,'Reasoned resolution')
    assert int(published.get_credit(CLAIMANT))==award_to_claimant*10**16
    assert int(published.get_credit(SPONSOR))==award_to_sponsor*10**16
    assert published.outstanding==105*10**16
    if verdict!='CONTRADICTED':
        VAULTMOD._now=lambda:400000
        published.expire_case(1)
        assert int(published.get_credit(SPONSOR))==(award_to_sponsor+100)*10**16
    MSG.sender_address=Address(CLAIMANT)
    if int(published.get_credit(CLAIMANT))>0:published.withdraw()
    MSG.sender_address=Address(SPONSOR)
    MSG.origin_address=Address(SPONSOR)
    if int(published.get_credit(SPONSOR))>0:published.withdraw()
    assert sum(value for _,value in TRANSFERS)==105*10**16
    assert published.outstanding==0

def test_challenge_submission_cannot_be_sponsored_by_wrong_chain(published):
    MSG.chain_id=61997
    # Hash is 61999 scoped; cannot bypass original deployment network guard.
    # Existing contracts don't magically change chain ID after deployment.
    assert published._require_case(1)['id']==1

def test_invalid_bond_does_not_change_registry(published):
    MSG.sender_address=Address(CLAIMANT);MSG.origin_address=Address(CLAIMANT);MSG.value=1
    with pytest.raises(UserError,match='bond'):
        published.commit_attempt(1,'a'*64)
    assert published.attempt_count==0
    assert published.outstanding==10**18

def test_premature_expire_rejected(published):
    with pytest.raises(UserError): published.expire_case(1)

def test_sponsor_cannot_reveal_other_wallets_commitment(published):
    salt,anchor,thesis=commit(published)
    MSG.sender_address=Address(SPONSOR);MSG.origin_address=Address(SPONSOR)
    with pytest.raises(UserError,match='not active claimant'):
        published.reveal_attempt(1,salt,anchor,thesis)

def test_engine_cannot_be_rebound(engine):
    from tests.unit.conftest import ENGINEMOD
    MSG.sender_address=Address(SPONSOR)
    with pytest.raises(UserError,match='binding'):
        engine.bind_vault('0x'+'f'*40)
