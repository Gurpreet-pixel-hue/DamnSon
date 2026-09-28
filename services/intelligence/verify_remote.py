import sys
import time
import hmac
import hashlib
import httpx
from civicweave_ai.settings import get_settings

if len(sys.argv) < 2:
    print("Usage: uv run python verify_remote.py <CLOUD_RUN_URL>")
    sys.exit(1)

base_url = sys.argv[1].rstrip("/")
settings = get_settings()

# 1. Check Health (Public)
print(f"--- Curling {base_url}/health ---")
r_health = httpx.get(f"{base_url}/health")
print(f"Status: {r_health.status_code}")
print(r_health.text)
print()

# 2. Check Search (Protected)
print(f"--- Curling {base_url}/v1/search ---")
now = int(time.time())
secret = settings.internal_service_secret
exp_str = str(now + 60)
sig = hmac.new(secret.encode("utf-8"), exp_str.encode("ascii"), hashlib.sha256).hexdigest().lower()
token = f"Bearer {exp_str}.{sig}"

payload = {
    "query": "I want to start a SaaS company in Mumbai",
    "locale": "en-IN",
    "candidates": []
}

r_search = httpx.post(
    f"{base_url}/v1/search",
    json=payload,
    headers={"Authorization": token, "Content-Type": "application/json"}
)
print(f"Status: {r_search.status_code}")
print(r_search.text)
