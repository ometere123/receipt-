# Verbatim excerpt from contracts/ReceiptV2.py at the final funded release.
# Full-source SHA-256: d57a19a19846f385c263deb04d7216d3a378ee2b4a153220e0710c85f0777cc0
# This compact immutable excerpt is used only for live adjudication because
# ReceiptV2's full source is larger than the deterministic web-body limit.

class ReceiptV2(gl.Contract):
    @gl.public.write
    def withdraw(self) -> None:
        """Dispatch the caller's full internal credit to that same EOA.

        GenVM records the dispatch and updates the internal ledger atomically;
        the external EVM child receipt is not synchronously returned to this
        contract. Consequently, ``EMITTED_UNCONFIRMED`` is the honest dispatch
        status and no automatic re-credit or retry is attempted.
        """
        recipient = gl.message.sender_address
        amount = int(self.credits.get(recipient, u256(0)))
        if amount <= 0:
            _fail('nothing to withdraw')
        if amount > int(self.outstanding):
            _fail('accounting invariant violated')
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
        _Receiver(recipient).emit_transfer(value=u256(amount))
