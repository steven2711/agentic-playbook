#!/usr/bin/env sh
# PreToolUse guard for Edit, Write and NotebookEdit: refuses writes inside a
# repository while `agentic readonly begin` has an assessment window open.
# Fast path: with no open window anywhere, exit without starting node.
# Exit 2 blocks the tool call and shows the reason to Claude.
home="${AGENTIC_HOME:-$HOME/.agentic-playbook}"
set -- "$home"/*/readonly.json
[ -e "$1" ] || exit 0
root="$(cd "$(dirname "$0")/.." && pwd)"
cli="${AGENTIC_CLI_JS:-$root/cli/dist/agentic.mjs}"
command -v node >/dev/null 2>&1 || exit 0
[ -f "$cli" ] || exit 0
node "$cli" readonly check --hook
