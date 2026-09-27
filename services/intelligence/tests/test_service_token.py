import pytest

from civicweave_ai.guards.service_token import TokenError, verify

SECRET = "test-secret"
EXP = 1790000000
SIG = "b4255b18f777d9eade30fb7a1ad05b14a03ce3692f9b55248f99fd4caf629c64"
VALID_HEADER = f"Bearer {EXP}.{SIG}"


def test_valid_token() -> None:
    now = 1789999950
    verify(VALID_HEADER, SECRET, now)


def test_expired_token() -> None:
    now = 1790000001
    with pytest.raises(TokenError, match="expired"):
        verify(VALID_HEADER, SECRET, now)


def test_exp_too_far_ahead() -> None:
    now = 1789999800
    with pytest.raises(TokenError, match="exp too far ahead"):
        verify(VALID_HEADER, SECRET, now)


def test_tampered_signature() -> None:
    now = 1789999950
    tampered_header = f"Bearer {EXP}.badsignature"
    with pytest.raises(TokenError, match="signature mismatch"):
        verify(tampered_header, SECRET, now)
