#!/usr/bin/env bash
# One end-to-end agent run of a calibration scenario with stock Claude Code (no custom runner):
#   calibration/run-agent.sh <scenario> [variant] <workdir>
# Scaffolds the scenario into <workdir>/repo, runs /agentic:assess then /agentic:plan headlessly with
# this checkout loaded as the plugin, and copies the resulting record to <workdir>/record.json.
# The staging home is <workdir>/home, so nothing outside <workdir> is written by the playbook.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
plugin="${CALIBRATION_PLUGIN:-$(cd "$here/.." && pwd)}"   # override to evaluate another checkout
scenario="$1"; shift
variant=""; if [ $# -eq 2 ]; then variant="$1"; shift; fi
work="$1"
mkdir -p "$work/scratch"
work="$(cd "$work" && pwd)"
"$here/scaffold.sh" "$scenario" ${variant:+"$variant"} "$work/repo" >/dev/null
export AGENTIC_HOME="$work/home"
tools=(Read Glob Grep Agent Task Skill TodoWrite Write Edit
  "Bash(agentic:*)" "Bash(node:*)" "Bash(git:*)" "Bash(ls:*)" "Bash(cat:*)" "Bash(find:*)" "Bash(grep:*)"
  "Bash(rg:*)" "Bash(wc:*)" "Bash(head:*)" "Bash(tail:*)" "Bash(jq:*)" "Bash(mkdir:*)" "Bash(test:*)")
note="Calibration run. Put patches and notes in $work/scratch (the session scratchpad). The user is not available: when a skill says to stop and ask, stop and report instead."
cd "$work/repo"
claude -p "/agentic:assess" --plugin-dir "$plugin" --add-dir "$work/scratch" --allowedTools "${tools[@]}" \
  --append-system-prompt "$note" --output-format json > "$work/assess.json" 2> "$work/assess.err" || true
claude -p -c "/agentic:plan" --plugin-dir "$plugin" --add-dir "$work/scratch" --allowedTools "${tools[@]}" \
  --append-system-prompt "$note" --output-format json > "$work/plan.json" 2> "$work/plan.err" || true
record="$(find "$work/home" -name record.json -not -path '*/published/*' | head -1)"
[ -n "$record" ] && cp "$record" "$work/record.json"
git -C "$work/repo" status --porcelain > "$work/worktree-changes.txt"
echo "$work: $([ -n "$record" ] && echo "record copied" || echo "NO RECORD"); worktree changes: $(wc -l < "$work/worktree-changes.txt" | tr -d ' ')"
