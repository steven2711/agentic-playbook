#!/usr/bin/env sh
# Injects the readiness status into the session when the current repo has a record.
# Silent (and fast) everywhere else. Never fails the session.
root="$(cd "$(dirname "$0")/.." && pwd)"
cli="$root/cli/dist/agentic.mjs"
command -v node >/dev/null 2>&1 || exit 0
[ -f "$cli" ] || exit 0
dir="${CLAUDE_PROJECT_DIR:-$PWD}"
exists="$(node "$cli" where --repo "$dir" 2>/dev/null | grep -c '"exists": true')"
[ "$exists" = "1" ] || exit 0
echo "[agentic-playbook] This repository has an agentic readiness record."
node "$cli" status --brief --repo "$dir" 2>/dev/null
echo "If anything above says STALE, REGRESSED, ROADMAP, JANITOR or READ-ONLY, tell the user and offer /agentic:status (republish) or /agentic:reassess (rescore)."
exit 0
