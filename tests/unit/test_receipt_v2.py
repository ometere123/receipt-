"""Single-IC V2 safety tests. Legacy V1 tests remain intact."""
import hashlib
import json
import pytest
from tests.unit.conftest import V2MOD, MSG, NETWORK, SPONSOR, CLAIMANT, VAULT, Address, UserError

@pytest.fixture
def one():
    v=V2MOD.ReceiptV2()
    v.cases={}; v.attempts={}; v.credits={}; v.dispatches={}; v.verdicts={}
    return v

def test_default_funding_off_and_withdrawal_off(one):
    assert json.loads(one.get_config())['architecture']=='SINGLE_IC'
    assert json.loads(one.get_config())['funding_enabled'] is False
    MSG.value = 10**18
    with pytest.raises(UserError, match='live funding disabled'):
        one.create_case('Source claim','demo','repo','a'*40,'docs/claim.md','src/code.py',
                        'Our code always caps total fees at 2 percent.', '0'*64,'1'*64,72)
    MSG.value=0
    one.credits[Address(SPONSOR)]=10**18
    with pytest.raises(UserError, match='external withdrawals disabled'):
        one.withdraw()
    assert one.get_credit(SPONSOR)==str(10**18)

def _prepared(one):
    one.funding_enabled=True  # Unit-only fixture; production has no enable method
    text='Official docs: Our code always caps total fees at 2 percent. MAX_FEE_BPS = 500'
    digest=hashlib.sha256(text.encode()).hexdigest()
    MSG.value=10**18
    one.create_case('Frozen source claim','demo','repo','a'*40,'docs/claim.md','src/code.py',
                    'Our code always caps total fees at 2 percent.', digest,digest,72)
    MSG.value=0
    MSG.sender_address=Address(CLAIMANT);MSG.origin_address=Address(CLAIMANT)
    salt='f'*64;anchor='MAX_FEE_BPS = 500'
    thesis='This reachable fee path permits five percent whereas the documentation promised two percent.'
    commitment=V2MOD._hash_commit(61999,VAULT,1,CLAIMANT,salt,anchor,thesis)
    MSG.value=5*10**16
    one.commit_attempt(1,commitment)
    MSG.value=0
    one.reveal_attempt(1,salt,anchor,thesis)
    class Response:
        status=200
        body=text.encode()
    NETWORK['https://raw.githubusercontent.com/demo/repo/'+'a'*40+'/docs/claim.md']=Response()
    NETWORK['https://raw.githubusercontent.com/demo/repo/'+'a'*40+'/src/code.py']=Response()
    return one

def test_anyone_can_assess_and_settle_atomically(one):
    _prepared(one)
    MSG.sender_address=Address('0x'+'3'*40);MSG.origin_address=Address('0x'+'3'*40)
    assert one.adjudicate_attempt(1)=='CONTRADICTED'
    assert json.loads(one.get_case(1))['status']=='WON'
    assert one.get_credit(CLAIMANT)==str(10**18+5*10**16)
    assert json.loads(one.get_verdict(1))['verdict']=='CONTRADICTED'
    with pytest.raises(UserError,match='not an assessable'):
        one.adjudicate_attempt(1)

def test_single_state_recovery_prevents_late_settlement(one,monkeypatch):
    _prepared(one)
    monkeypatch.setattr(V2MOD,'_now',lambda:100000+604801)
    one.recover_pending(1)
    assert json.loads(one.get_attempt(1))['status']=='RECOVERED'
    assert one.get_credit(CLAIMANT)==str(5*10**16)
    assert one.get_credit(SPONSOR)==str(10**18)
    with pytest.raises(UserError,match='not an assessable'):
        one.adjudicate_attempt(1)
    with pytest.raises(UserError,match='not an active pending'):
        one.recover_pending(1)
