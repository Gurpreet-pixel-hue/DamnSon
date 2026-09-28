import pytest
from fastapi.testclient import TestClient

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


def test_empty_secret_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import HTTPException

    from civicweave_ai.guards.service_token import require_service_token
    from civicweave_ai.settings import get_settings

    # Override the settings strictly for this test
    monkeypatch.setattr(get_settings(), "internal_service_secret", "")

    with pytest.raises(HTTPException) as exc:
        require_service_token(VALID_HEADER)
    assert exc.value.status_code == 503
    assert exc.value.detail == "Service configuration error"


def test_non_numeric_exp_rejected() -> None:
    now = 1789999950
    bad_exp_header = f"Bearer 179abc.{SIG}"
    with pytest.raises(TokenError, match="invalid"):
        verify(bad_exp_header, SECRET, now)


def test_search_empty_secret_503(monkeypatch: pytest.MonkeyPatch) -> None:
    from civicweave_ai.main import app

    client = TestClient(app)
    from civicweave_ai.settings import get_settings

    settings = get_settings()
    # Mock settings directly
    monkeypatch.setattr(settings, "internal_service_secret", "")

    # Send a request with a theoretically valid token shape (though invalid signature since secret is empty, but our logic checks secret first)
    resp = client.post("/v1/search", json={"query": "test", "locale": "en", "candidates": []}, headers={"Authorization": "Bearer 9999999999.signature"})

    assert resp.status_code == 503
    assert resp.json()["detail"] == "Service configuration error"
