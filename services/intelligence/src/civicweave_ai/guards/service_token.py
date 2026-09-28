import hashlib
import hmac
import time

from fastapi import HTTPException, Security
from fastapi.security import APIKeyHeader

from civicweave_ai.settings import get_settings


class TokenError(Exception):
    pass


def verify(authorization_header: str, secret: str, now: int) -> None:
    if not authorization_header.startswith("Bearer "):
        raise TokenError("invalid header format")

    token = authorization_header[len("Bearer ") :]
    parts = token.split(".")
    if len(parts) != 2:
        raise TokenError("invalid token format")

    exp_str, sig = parts
    import re

    if not re.fullmatch(r"[0-9]+", exp_str):
        raise TokenError("invalid exp")

    exp = int(exp_str)

    if exp < now:
        raise TokenError("expired")
    if exp > now + 120:
        raise TokenError("exp too far ahead")

    expected = hmac.new(secret.encode("utf-8"), exp_str.encode("ascii"), hashlib.sha256).hexdigest()

    if not hmac.compare_digest(expected, sig):
        raise TokenError("signature mismatch")


auth_header = APIKeyHeader(name="Authorization", auto_error=False)


def require_service_token(header: str | None = Security(auth_header)) -> str:
    if not header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    settings = get_settings()
    if not settings.internal_service_secret:
        raise HTTPException(status_code=503, detail="Service configuration error")
    try:
        verify(header, settings.internal_service_secret, int(time.time()))
        return header
    except TokenError as e:
        raise HTTPException(status_code=401, detail=str(e))
