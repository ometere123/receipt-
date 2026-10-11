"""Deliberately contradictory *fictional* fee-policy demo."""
MAX_FEE_BPS = 500


def set_distribution_fee(requested_bps: int) -> int:
    """Return the accepted distribution fee in basis points (100 bps = 1%)."""
    if requested_bps < 0:
        raise ValueError('negative fee')
    if requested_bps <= MAX_FEE_BPS:
        return requested_bps
    raise ValueError('fee is above system limit')
