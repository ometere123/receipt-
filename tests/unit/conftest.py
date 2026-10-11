"""Small API-compatible deterministic harness for arithmetic/state-machine tests.

Not a substitute for gltest Direct Mode or finality on 61999. See tests/direct.
"""
import importlib.util
import json
import sys
import types
from pathlib import Path
import pytest

# Keep the deterministic harness private to the already-loaded unit contract
# modules. If the real SDK is installed, restore it before Direct Mode tests
# are collected so `pytest tests/unit tests/direct` cannot mix runtimes.
_real_genlayer = sys.modules.get('genlayer')
if _real_genlayer is None:
    try:
        import genlayer as _real_genlayer
    except ImportError:
        _real_genlayer = None

class UserError(Exception): pass
class Address(str):
    def __new__(cls, value): return str.__new__(cls, str(value).lower())
    @property
    def as_hex(self): return str(self)

class Return:
    def __init__(self, calldata): self.calldata=calldata

class Message:
    sender_address = Address('0x'+'1'*40)
    contract_address = Address('0x'+'a'*40)
    chain_id = 61999
    origin_address = Address('0x'+'1'*40)
    value = 0

MSG=Message()
EMISSIONS=[]
TRANSFERS=[]
VIEWS={}
NETWORK={}

class Emitter:
    def __init__(self,target):self.target=target
    def emit(self,**kwargs):
        sender=MSG.contract_address
        target=self.target
        class _Emit:
            def __getattr__(self,key):
                def fn(*args):EMISSIONS.append((str(sender),str(target),key,args,kwargs))
                return fn
        return _Emit()
    def view(self): return VIEWS[str(self.target)]

class EVMInterface:
    def __init__(self,address):self.address=address
    def emit_transfer(self,*,value):TRANSFERS.append((str(self.address),int(value)))

def evm_deco(clz):
    clz.__init__=EVMInterface.__init__
    clz.emit_transfer=EVMInterface.emit_transfer
    return clz

class GlContract:
    balance = 0

def iddecor(fn):return fn

class Write:
    def __call__(self,fn): return fn
    payable=staticmethod(iddecor)

class Public:
    write=Write()
    view=staticmethod(iddecor)

class Web:
    def get(self,url):return NETWORK[url]

class Nondet:
    web=Web()
    response={'verdict':'CONTRADICTED','scope_ok':True,'proof_complete':True,
              'contradiction':True,'reason':'The effective release behavior contradicts the documented limit.'}
    def exec_prompt(self,*args,**kwargs): return dict(self.response)

class VM:
    UserError=UserError
    Return=Return
    def run_nondet_unsafe(self,leader,validator):
        candidate=leader()
        if not validator(Return(candidate)):raise UserError('independent validator disagreed')
        return candidate

GL=types.SimpleNamespace(Contract=GlContract,public=Public(),message=MSG,
     vm=VM(), nondet=Nondet(),get_contract_at=lambda a: Emitter(a),
     evm=types.SimpleNamespace(contract_interface=evm_deco))
shim=types.ModuleType('genlayer')
shim.gl=GL
shim.u256=int
shim.u64=int
shim.Address=Address
shim.TreeMap=dict
sys.modules['genlayer']=shim

root=Path(__file__).resolve().parents[2]
def load(name):
    spec=importlib.util.spec_from_file_location(name,root/'contracts'/f'{name}.py')
    mod=importlib.util.module_from_spec(spec)
    sys.modules[name]=mod
    spec.loader.exec_module(mod)
    return mod
VAULTMOD=load('PromiseVault')
ENGINEMOD=load('ProofEngine')

if _real_genlayer is not None:
    sys.modules['genlayer'] = _real_genlayer
else:
    sys.modules.pop('genlayer', None)

SPONSOR='0x'+'1'*40
CLAIMANT='0x'+'2'*40
ATTACKER='0x'+'3'*40
VAULT='0x'+'a'*40
ENGINE='0x'+'b'*40

@pytest.fixture(autouse=True)
def reset(monkeypatch):
    MSG.sender_address=Address(SPONSOR)
    MSG.contract_address=Address(VAULT)
    MSG.chain_id=61999
    MSG.origin_address=Address(SPONSOR)
    MSG.value=0
    EMISSIONS.clear();TRANSFERS.clear();VIEWS.clear();NETWORK.clear()
    GL.nondet.response={'verdict':'CONTRADICTED','scope_ok':True,'proof_complete':True,'contradiction':True,'reason':'The effective fee path contradicts the promised limit.'}
    monkeypatch.setattr(VAULTMOD,'_now',lambda:100000)
    yield

@pytest.fixture
def vault():
    v=VAULTMOD.PromiseVault(ENGINE)
    v.cases={};v.attempts={};v.credits={};v.dispatches={}
    VIEWS[VAULT]=v
    return v

@pytest.fixture
def engine():
    MSG.contract_address=Address(ENGINE)
    e=ENGINEMOD.ProofEngine();e.verdicts={};e.recovered={}
    e.bind_vault(VAULT)
    MSG.contract_address=Address(VAULT)
    VIEWS[ENGINE]=e
    if VAULT in VIEWS:
        MSG.sender_address=Address(ENGINE)
        VIEWS[VAULT].activate_engine()
        MSG.sender_address=Address(SPONSOR)
    EMISSIONS.clear() # discard deployment activation child from per-case assertions
    return e

@pytest.fixture
def published(vault, engine):
    # The production-safe contract defaults to funding disabled because
    # external GEN receipt recovery is not proven. Unit tests explicitly opt
    # into the adjudication state machine without exposing a public enable
    # path in the contract.
    vault.funding_enabled = True
    MSG.value=10**18
    vault.create_case('The fee ceiling','demo','fees','a'*40,'docs/fees.md','src/fees.py',
        'Our protocol never exceeds a 2% distribution fee.', '0'*64,'1'*64,72)
    MSG.value=0
    return vault

def commit(vault,case_id=1,anchor='MAX_FEE_BPS = 500',thesis=None,who=CLAIMANT):
    thesis=thesis or 'This enabled fee path allows 500 bps when the claim promises only 200 bps.'
    salt='f'*64
    digest=VAULTMOD._hash_commit(61999,VAULT,case_id,who,salt,anchor,thesis)
    MSG.sender_address=Address(who)
    MSG.origin_address=Address(who)
    MSG.value=max(10**14,10**18//20)
    vault.commit_attempt(case_id,digest)
    MSG.value=0
    return salt,anchor,thesis
