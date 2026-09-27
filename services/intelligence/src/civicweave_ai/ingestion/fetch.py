import hashlib
import time
from urllib.parse import urlparse

import httpx

from civicweave_ai.settings import get_settings

_last_fetch_time: dict[str, float] = {}


def fetch_url(url: str) -> tuple[bytes, str, str]:
    settings = get_settings()
    host = urlparse(url).netloc

    now = time.time()
    last = _last_fetch_time.get(host, 0.0)
    if now - last < 1.0:
        time.sleep(1.0 - (now - last))

    headers = {"User-Agent": settings.crawler_user_agent}
    with httpx.Client(follow_redirects=True, verify=False) as client:
        resp = client.get(url, headers=headers, timeout=15.0)
        resp.raise_for_status()
        _last_fetch_time[host] = time.time()

        content = resp.content
        mime_type = resp.headers.get("content-type", "").split(";")[0]
        content_hash = hashlib.sha256(content).hexdigest()

        return content, mime_type, content_hash
