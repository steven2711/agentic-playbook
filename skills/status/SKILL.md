---
name: status
description: Show the agentic readiness score, level, roadmap progress and what has gone stale, and republish the tracker Artifact if it is behind the record.
disable-model-invocation: false
---
# /agentic:status

1. Run `agentic status`. If no record exists, say so and suggest `/agentic:assess`.
2. Report briefly:
   - the score, level and confidence, quoted from the CLI
   - roadmap progress: tasks addressed and open, milestones with every exit criterion met, and the first open task (`agentic roadmap` lists them all)
   - what blocks the next level
   - any line marked ROADMAP (the plan changed since approval, or is unapproved), REGRESSED (a probe got worse), JANITOR (a janitor's contract is no longer established), READ-ONLY (an assessment window is still open) or MIGRATION
3. If the output says the Artifact is stale or unpublished, follow **Publish the tracker** in `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md`.
4. If it says STALE, name the changed areas it lists and offer `/agentic:reassess`, which records progress on the roadmap. An `Uncommitted:` line is information, not staleness: mention it only if the user asks about local changes. Do not reassess automatically.
