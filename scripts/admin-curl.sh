#!/usr/bin/env bash
# scripts/admin-curl.sh — proves the admin API's 401 / 403 / 400 / 409 / 422 / 200 paths (PL-5, F.2).
#
# Prerequisites, all local:
#   1. .env.local points at civicweave-dev (DATA_SOURCE=db) and the database has been seeded.
#   2. A test admin and a non-admin exist:
#        npm run grant-admin -- admin@example.com   --password '<pw>'
#        npm run grant-admin -- citizen@example.com --password '<pw>' --role citizen
#      and .env.local carries TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD and
#      TEST_CITIZEN_EMAIL / TEST_CITIZEN_PASSWORD.
#   3. The app is running:  npm run dev
#
# Session cookies come from scripts/admin-session.ts, which signs in with the publishable key and lets
# @supabase/ssr serialise the cookies, so they are exactly what the server reads back.
#
# Usage:  bash scripts/admin-curl.sh [module-id] [template-id]
set -uo pipefail

BASE="${BASE_URL:-http://localhost:3000}/api/v1/admin"
MODULE="${1:-ex-tax}"
TEMPLATE="${2:-example-startup}"
FAILURES=0

set -a; . ./.env.local; set +a

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then printf '  ok    %-52s %s\n' "$1" "$3"
  else printf '  FAIL  %-52s expected %s, got %s\n' "$1" "$2" "$3"; FAILURES=$((FAILURES + 1)); fi
}
status() { curl -s -o /tmp/cw-admin-body -w '%{http_code}' "$@"; }
code_of() { python3 -c 'import json,sys; print(json.load(open("/tmp/cw-admin-body"))["error"]["code"])' 2>/dev/null || echo "-"; }

say "Signing in"
ADMIN_COOKIE="$(npx tsx scripts/admin-session.ts)" || { echo "could not get an admin session"; exit 1; }
CITIZEN_COOKIE="$(npx tsx scripts/admin-session.ts "$TEST_CITIZEN_EMAIL" "$TEST_CITIZEN_PASSWORD")" || { echo "could not get a citizen session"; exit 1; }
echo "  admin and non-admin sessions issued"

say "401 — no session"
check "GET  /admin/modules"                401 "$(status "$BASE/modules")"
check "  error code is unauthorized"       unauthorized "$(code_of)"
check "GET  /admin/audit"                  401 "$(status "$BASE/audit")"
check "PUT  /admin/modules/$MODULE/draft"  401 "$(status -X PUT -H 'content-type: application/json' -d '{}' "$BASE/modules/$MODULE/draft")"

say "403 — signed in, but not an admin"
check "GET  /admin/modules"          403 "$(status -H "Cookie: $CITIZEN_COOKIE" "$BASE/modules")"
check "  error code is forbidden"    forbidden "$(code_of)"
check "POST /admin/templates/publish" 403 "$(status -X POST -H "Cookie: $CITIZEN_COOKIE" -H 'content-type: application/json' -d '{"expectedRevision":1}' "$BASE/templates/$TEMPLATE/publish")"

say "200 — admin reads"
check "GET  /admin/modules"           200 "$(status -H "Cookie: $ADMIN_COOKIE" "$BASE/modules")"
check "GET  /admin/modules/$MODULE"   200 "$(status -H "Cookie: $ADMIN_COOKIE" "$BASE/modules/$MODULE")"
cp /tmp/cw-admin-body /tmp/cw-module.json
check "GET  /admin/audit?limit=5"     200 "$(status -H "Cookie: $ADMIN_COOKIE" "$BASE/audit?limit=5")"
check "404 for a module that does not exist" 404 "$(status -H "Cookie: $ADMIN_COOKIE" "$BASE/modules/no-such-module")"
check "400 for an id that is not kebab-case" 400 "$(status -H "Cookie: $ADMIN_COOKIE" "$BASE/modules/Not%20An%20Id")"

say "409 — stale baseHash"
python3 - <<'PY'
import json
d = json.load(open("/tmp/cw-module.json"))
content = (d.get("draft") or d["published"])["content"]
json.dump({"content": content, "baseHash": "0" * 64}, open("/tmp/cw-draft.json", "w"))
PY
check "PUT  draft with a wrong baseHash" 409 "$(status -X PUT -H "Cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data @/tmp/cw-draft.json "$BASE/modules/$MODULE/draft")"
check "  error code is conflict"         conflict "$(code_of)"

say "422 — schema-valid but the analyzer rejects it"
python3 - <<'PY'
import json
d = json.load(open("/tmp/cw-module.json"))
current = d.get("draft") or d["published"]
content = json.loads(json.dumps(current["content"]))
# A source id that the module does not define: valid against the schema, UNKNOWN_SOURCE_REF to analyzeModule.
content["steps"][0]["sourceIds"] = ["ghost"]
json.dump({"content": content, "baseHash": current["contentHash"]}, open("/tmp/cw-draft.json", "w"))
PY
check "PUT  draft that fails analyzeModule" 422 "$(status -X PUT -H "Cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data @/tmp/cw-draft.json "$BASE/modules/$MODULE/draft")"
check "  error code is invalid_graph"       invalid_graph "$(code_of)"
python3 -c 'import json;print("  issues:", [i["code"] for i in json.load(open("/tmp/cw-admin-body"))["error"]["details"]["issues"]])'

say "400 — body id does not match the URL"
python3 - <<'PY'
import json
d = json.load(open("/tmp/cw-module.json"))
current = d.get("draft") or d["published"]
content = json.loads(json.dumps(current["content"]))
content["moduleId"] = "some-other-module"
json.dump({"content": content, "baseHash": current["contentHash"]}, open("/tmp/cw-draft.json", "w"))
PY
check "PUT  draft for a different moduleId" 400 "$(status -X PUT -H "Cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data @/tmp/cw-draft.json "$BASE/modules/$MODULE/draft")"

say "200 — save a real draft (flags a step, as an admin reviewing would)"
python3 - <<'PY'
import json
d = json.load(open("/tmp/cw-module.json"))
current = d.get("draft") or d["published"]
content = json.loads(json.dumps(current["content"]))
content["steps"][0]["review"] = {"status": "flagged", "note": "Checked by scripts/admin-curl.sh"}
json.dump({"content": content, "baseHash": current["contentHash"]}, open("/tmp/cw-draft.json", "w"))
PY
check "PUT  draft with the right baseHash" 200 "$(status -X PUT -H "Cookie: $ADMIN_COOKIE" -H 'content-type: application/json' --data @/tmp/cw-draft.json "$BASE/modules/$MODULE/draft")"
python3 -c 'import json;d=json.load(open("/tmp/cw-admin-body"));print("  draft version", d["version"], "hash", d["contentHash"][:12] + "...")'

say "409 / 200 — publish"
REV="$(status -H "Cookie: $ADMIN_COOKIE" "$BASE/modules" > /dev/null; curl -s "${BASE_URL:-http://localhost:3000}/api/v1/templates/$TEMPLATE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["template"]["revision"])')"
echo "  published revision is $REV"
check "POST publish with a stale expectedRevision" 409 "$(status -X POST -H "Cookie: $ADMIN_COOKIE" -H 'content-type: application/json' -d "{\"expectedRevision\":$((REV + 5))}" "$BASE/templates/$TEMPLATE/publish")"
check "POST publish with the current revision"     200 "$(status -X POST -H "Cookie: $ADMIN_COOKIE" -H 'content-type: application/json' -d "{\"expectedRevision\":$REV}" "$BASE/templates/$TEMPLATE/publish")"
python3 -c 'import json;d=json.load(open("/tmp/cw-admin-body"));print("  new revision", d["revision"], "modules", len(d["modulesPublished"]))'

say "Cache-Control on admin responses"
CC="$(curl -s -o /dev/null -D- -H "Cookie: $ADMIN_COOKIE" "$BASE/modules" | tr -d '\r' | awk -F': ' 'tolower($1)=="cache-control"{print $2}')"
check "private, no-store" "private, no-store" "$CC"

rm -f /tmp/cw-admin-body /tmp/cw-draft.json /tmp/cw-module.json
if [ "$FAILURES" -eq 0 ]; then printf '\n\033[32mall checks passed\033[0m\n'; else printf '\n\033[31m%s check(s) failed\033[0m\n' "$FAILURES"; exit 1; fi
