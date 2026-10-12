"""Exact GenVM Direct Mode checks for standalone V2's safe starting state."""
import json

def test_v2_contract_is_one_unchained_address_with_funding_disabled(direct_vm,direct_deploy,direct_alice):
    direct_vm._chain_id=61999
    direct_vm.sender=direct_alice
    direct_vm.origin=direct_alice
    v=direct_deploy('contracts/ReceiptV2.py')
    config=json.loads(v.get_config())
    assert config['architecture']=='SINGLE_IC'
    assert config['funding_enabled'] is False
    assert config['chain']==61999
    assert config['withdrawal_status']=='DISABLED_FAIL_CLOSED'
    assert config['funding_mode']=='FAIL_CLOSED_UNTIL_PAYOUT_PROOF'
    treasury=json.loads(v.get_treasury_status())
    assert treasury['accepted_wei']=='0'
    assert treasury['credited_wei']=='0'
    assert treasury['outstanding_wei']=='0'
    with direct_vm.expect_revert('external withdrawals disabled'):
        v.withdraw()
    with direct_vm.expect_revert('live funding disabled'):
        v.commit_attempt(1,'a'*64)
