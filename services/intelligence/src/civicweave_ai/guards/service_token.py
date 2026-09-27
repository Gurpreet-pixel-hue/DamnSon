import hashlib
import hmac
import time

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from civicweave_ai.settings import get_settings


class TokenError(Exception):
    pass


def verify(authorization_header: str, secret: str, now: int) -> None:
    if not secret:
        raise TokenError("Empty or missing secret")
    if not authorization_header.startswith("Bearer "):
        raise TokenError("invalid header format")

    token = authorization_header[len("Bearer ") :]
    parts = token.split(".")
    if len(parts) != 2:
        raise TokenError("invalid token format")

    exp_str, sig = parts
    try:
        exp = int(exp_str)
    except ValueError:
        raise TokenError("invalid exp")

    if exp < now:
        raise TokenError("expired")
    if exp > now + 120:
        raise TokenError("exp too far ahead")

    expected = hmac.new(secret.encode("utf-8"), exp_str.encode("ascii"), hashlib.sha256).hexdigest().lower()

    if not hmac.compare_digest(expected, sig.lower()):
        raise TokenError("signature mismatch")


auth_header = APIKeyHeader(name="Authorization", auto_error=False)


def require_service_token(header: str | None = Security(auth_header)) -> None:
    if not header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    settings = get_settings()
    try:
        verify(header, settings.internal_service_secret, int(time.time()))
    except TokenError as e:
        raise HTTPException(status_code=401, detail=str(e))
