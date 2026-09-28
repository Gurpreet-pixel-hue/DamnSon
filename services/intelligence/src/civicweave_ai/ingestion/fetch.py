import hashlib
import time
import urllib.robotparser
from urllib.parse import urlparse

import httpx

from civicweave_ai.settings import get_settings

_last_fetch_time: dict[str, float] = {}
_robot_parsers: dict[str, urllib.robotparser.RobotFileParser] = {}


def _can_fetch(url: str, user_agent: str) -> bool:
    parsed = urlparse(url)
    host = parsed.netloc
    scheme = parsed.scheme

    if host not in _robot_parsers:
        robots_url = f"{scheme}://{host}/robots.txt"
        rp = urllib.robotparser.RobotFileParser()
        rp.set_url(robots_url)
        try:
            with httpx.Client(follow_redirects=True) as client:
                resp = client.get(robots_url, timeout=5.0)
                if resp.status_code == 200:
                    rp.parse(resp.text.splitlines())
                    _robot_parsers[host] = rp
                elif resp.status_code == 404:
                    # 404 means allowed (no robots.txt = crawl freely)
                    _robot_parsers[host] = rp
                elif resp.status_code in (401, 403):
                    # 401/403 means disallowed
                    rp.parse(["User-agent: *", "Disallow: /"])
                    _robot_parsers[host] = rp
                else:
                    # Other status codes are temporary errors
                    raise ValueError(f"Temporary error fetching robots.txt: {resp.status_code}")
        except httpx.RequestError as e:
            # Network error = retry later (temporary), do not cache
            raise ValueError(f"Network error fetching robots.txt: {e}") from e

    # If the site doesn't have a robots.txt or didn't explicitly disallow, it returns True
    return _robot_parsers[host].can_fetch(user_agent, url)


def fetch_url(url: str) -> tuple[bytes, str, str]:
    settings = get_settings()
    host = urlparse(url).netloc

    if not _can_fetch(url, settings.crawler_user_agent):
        raise ValueError(f"robots.txt disallows fetching {url}")

    now = time.time()
    last = _last_fetch_time.get(host, 0.0)
    if now - last < 1.0:
        time.sleep(1.0 - (now - last))

    headers = {"User-Agent": settings.crawler_user_agent}
    with httpx.Client(follow_redirects=True) as client:
        resp = client.get(url, headers=headers, timeout=15.0)
        resp.raise_for_status()
        _last_fetch_time[host] = time.time()

        content = resp.content
        mime_type = resp.headers.get("content-type", "").split(";")[0]
        content_hash = hashlib.sha256(content).hexdigest()

        return content, mime_type, content_hash
