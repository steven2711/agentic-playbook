---
name: status
description: Show the agentic readiness score, level, active/blocked/awaiting-verification work and staleness, and republish the tracker Artifact if it is behind the record.
disable-model-invocation: false
---
# /agentic:status

1. Run `agentic status`. If no record exists, say so and suggest `/agentic:assess`.
2. Report briefly:
   - the score, level and confidence, quoted from the CLI
   - in-progress, blocked and awaiting-verification tasks
   - the next ready task
   - what blocks the next level
3. If the output says the Artifact is stale or unpublished, follow **Publish the tracker** in `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md`.
4. If it says HEAD is past the assessed revision, mention it and offer `/agentic:reassess`. Do not reassess automatically.
