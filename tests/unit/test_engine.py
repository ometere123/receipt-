import hashlib,json,types
import pytest
from tests.unit.conftest import ENGINE,VAULT,SPONSOR,MSG,EMISSIONS,NETWORK,VIEWS,ENGINEMOD,GL,Address,UserError

def source_setup():
    doc=b'Official manual: Our protocol never exceeds a 2% distribution fee.\n'
    src=b'MAX_FEE_BPS = 500\n\nif fee <= MAX_FEE_BPS:\n    set_fee(fee)\n'
    case={'id':7,'active_attempt':12,'status':'PENDING','owner':'demo','repo':'fees',
          'commit':'a'*40,'doc_path':'docs/fees.md','source_path':'src/fees.py',
          'claim':'Our protocol never exceeds a 2% distribution fee.',
          'doc_digest':hashlib.sha256(doc).hexdigest(),'source_digest':hashlib.sha256(src).hexdigest()}
    base='https://raw.githubusercontent.com/demo/fees/'+('a'*40)+'/'
    NETWORK[base+'docs/fees.md']=types.SimpleNamespace(status=200,body=doc)
    NETWORK[base+'src/fees.py']=types.SimpleNamespace(status=200,body=src)
    return case

def test_only_bound_vault_may_assess(engine):
    case=source_setup(); MSG.sender_address=Address(SPONSOR);MSG.contract_address=Address(ENGINE)
    with pytest.raises(UserError,match='only bound'):
        engine.assess(12,7,json.dumps(case),'MAX_FEE_BPS = 500','This code path directly exceeds the stated promise in this release.')

def test_substantive_consensus_and_callback(engine):
    case=source_setup();MSG.sender_address=Address(VAULT);MSG.contract_address=Address(ENGINE)
    engine.assess(12,7,json.dumps(case),'MAX_FEE_BPS = 500','This code path directly exceeds the stated promise in this release.')
    result=json.loads(engine.get_verdict(12))
    assert result['verdict']=='CONTRADICTED'
    assert result['digest']==hashlib.sha256(NETWORK[next(x for x in NETWORK if x.endswith('.md'))].body+NETWORK[next(x for x in NETWORK if x.endswith('.py'))].body).hexdigest()
    assert EMISSIONS[-1][1]==VAULT and EMISSIONS[-1][-1]['on']=='finalized'
    with pytest.raises(UserError,match='already assessed'):
        engine.assess(12,7,json.dumps(case),'MAX_FEE_BPS = 500','This code path directly exceeds the stated promise in this release.')
    engine.resend_verdict(12)
    assert len(EMISSIONS)==2

def test_mismatching_snapshot_never_awards(engine):
    case=source_setup();case['source_digest']='0'*64
    MSG.sender_address=Address(VAULT);MSG.contract_address=Address(ENGINE)
    engine.assess(12,7,json.dumps(case),'MAX_FEE_BPS = 500','This code path directly exceeds the stated promise in this release.')
    record=json.loads(engine.get_verdict(12))
    assert record['verdict']=='INCONCLUSIVE'
    assert record['digest']==''


@pytest.mark.parametrize('response', [
    {},
    {'verdict': 'NOT_ESTABLISHED'},
    {'verdict': 'NOT_ESTABLISHED', 'scope_ok': 0, 'proof_complete': False,
     'contradiction': False, 'reason': 'bad boolean type'},
    {'verdict': 'CONTRADICTED', 'scope_ok': True, 'proof_complete': False,
     'contradiction': True, 'reason': 'incoherent winning result'},
    {'verdict': 'NOT_ESTABLISHED', 'scope_ok': True, 'proof_complete': True,
     'contradiction': True, 'reason': 'x' * 501},
])
def test_malformed_model_response_refunds_bond_neutrally(engine, response):
    case=source_setup()
    MSG.sender_address=Address(VAULT);MSG.contract_address=Address(ENGINE)
    GL.nondet.response=response
    engine.assess(12,7,json.dumps(case),'MAX_FEE_BPS = 500',
                  'The source path needs a substantive, bounded explanation.')
    record=json.loads(engine.get_verdict(12))
    assert record['verdict']=='INCONCLUSIVE'
    assert record['digest']==''

def test_missing_source_anchor_is_out_of_scope(engine):
    case=source_setup();MSG.sender_address=Address(VAULT);MSG.contract_address=Address(ENGINE)
    engine.assess(12,7,json.dumps(case),'SOME_MISSING_ANCHOR','The contract stores a different value; missing anchor is suspicious.')
    assert json.loads(engine.get_verdict(12))['verdict']=='OUT_OF_SCOPE'

def test_validator_substantive_disagreement_reverts(engine,monkeypatch):
    case=source_setup();MSG.sender_address=Address(VAULT);MSG.contract_address=Address(ENGINE)
    original=GL.nondet.exec_prompt
    n={'count':0}
    def disagree(*args,**kwargs):
        n['count']+=1
        response=original(*args,**kwargs)
        if n['count']>=2: response['contradiction']=False;response['verdict']='NOT_ESTABLISHED'
        return response
    monkeypatch.setattr(GL.nondet,'exec_prompt',disagree)
    with pytest.raises(UserError,match='disagreed'):
        engine.assess(12,7,json.dumps(case),'MAX_FEE_BPS = 500','This code path directly exceeds the stated promise in this release.')
    assert engine.get_verdict(12)==''


def test_activation_reemission_is_finalized(engine):
    MSG.sender_address=Address(SPONSOR)
    MSG.contract_address=Address(ENGINE)
    engine.resend_activation()
    assert EMISSIONS[-1][1] == VAULT
    assert EMISSIONS[-1][-1]['on'] == 'finalized'


@pytest.mark.parametrize('status', [404, 429, 500, 302])
def test_external_source_failure_is_neutral_not_winning(engine, status):
    case=source_setup()
    first = next(k for k in NETWORK if k.endswith('.md'))
    NETWORK[first].status=status
    MSG.sender_address=Address(VAULT);MSG.contract_address=Address(ENGINE)
    engine.assess(12,7,json.dumps(case),'MAX_FEE_BPS = 500',
                  'Inspecting pinned source under a transient remote fetch failure.')
    record=json.loads(engine.get_verdict(12))
    assert record['verdict']=='INCONCLUSIVE'
    assert record['digest']==''


@pytest.mark.parametrize('key,value', [
    ('verdict','NOT_ESTABLISHED'), ('scope_ok',False),
    ('proof_complete',False), ('contradiction',False),
])
def test_leader_semantic_mutation_must_fail_validator(engine, monkeypatch, key, value):
    case=source_setup()
    MSG.sender_address=Address(VAULT);MSG.contract_address=Address(ENGINE)
    from tests.unit.conftest import Return
    # Propose a leader response that is inconsistent with an independently
    # evaluated passing local source and prompt.
    data={'verdict':'CONTRADICTED','scope_ok':True,'proof_complete':True,
          'contradiction':True,'digest':hashlib.sha256(
              NETWORK[next(x for x in NETWORK if x.endswith('.md'))].body+
              NETWORK[next(x for x in NETWORK if x.endswith('.py'))].body).hexdigest()}
    data[key]=value
    candidate=[]
    original=GL.vm.run_nondet_unsafe
    def hostile(evaluate,validate):
        candidate.append(validate(Return(data)))
        raise UserError('intentional hostile leader rejected')
    monkeypatch.setattr(GL.vm,'run_nondet_unsafe',hostile)
    with pytest.raises(UserError, match='hostile leader'):
        engine.assess(12,7,json.dumps(case),'MAX_FEE_BPS = 500',
                      'The effective source permits a fee greater than two percent.')
    assert candidate==[False]
    assert engine.get_verdict(12)==''
