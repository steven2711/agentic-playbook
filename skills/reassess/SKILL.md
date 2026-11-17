---
name: reassess
description: Re-run the readiness assessment at the current HEAD, keeping stable IDs, flagging regressions and resolved findings, and rescoring.
argument-hint: "[dimension ids to limit, e.g. VER ARC] [--github]"
disable-model-invocation: true
---
# /agentic:reassess

Refresh the assessment against the current code. The assessment is read-only for the target repository. Arguments: `$ARGUMENTS`.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md`. Run `agentic status`, then `agentic scan` (add `--github` if requested).

2. Collect the changes since the last assessment with `git log --oneline <assessedRevision>..HEAD` and `git diff --stat <assessedRevision>..HEAD`.
   - If the user limited dimensions, audit only those.
   - Otherwise audit every dimension the changes could affect. When unsure, audit all of them.

3. Start the relevant auditors in parallel. Give each one its current criteria and findings from the record, and tell it to:
   - reuse finding IDs for the same issue
   - mark fixed findings `resolved: true`
   - add new findings with new IDs
   - explain every criterion whose status changes

4. Consider whether the mode should change, for example when a greenfield repo now has real features. Propose `{"mode": "existing"}` if so. It reactivates deferred criteria, so confirm with the user first.

5. If the changes touched an app's code or its conventions files, run the `conventions-advisor` for those app roots, following steps 3 to 4 of `${CLAUDE_PLUGIN_ROOT}/skills/conventions/SKILL.md`. Keep existing `CV-` IDs and decisions, and report contradictions that are new since the last run.

6. Apply one merged patch with `"assessedRevision": "HEAD"`, then run `agentic score`.

7. Compare with the previous score history entry. List:
   - criteria that regressed (for example passed to failed), with evidence
   - resolved findings
   - new findings that need tasks. Offer `/agentic:plan` to schedule them.

8. Follow **Publish the tracker**. Confirm `git status --porcelain` is unchanged by the assessment.
