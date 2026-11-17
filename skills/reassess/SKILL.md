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

6. Compare inline suppression counts (`agentic strictness`) with the counts in the current `ARC-08` evidence. Report any growth per app and kind as a regression, and record the new counts in the `ARC-08` evidence.

7. If the changes touched an app's code or tests, run the `test-strategy-auditor` for those app roots, following steps 3 to 4 of `${CLAUDE_PLUGIN_ROOT}/skills/testing/SKILL.md`. Compare its snapshot with the record's previous `testing` entry for the app: report fewer covered critical paths, or a Tier 1 layer that went missing, as a regression.

8. If the changes touched CLAUDE.md, `.claude/`, docs or README files, make sure the `context-auditor` ran and returned a new `docs` snapshot. Compare it with the record's previous `docs` snapshot, and report these as regressions:
   - a target item that was `present` and is now `absent` or `misplaced`
   - more always-loaded lines without a stated reason
   - new broken links (`agentic docs`)
   - a navigation goal that was reachable and no longer is

9. If the record has a `maintenance` roster, or the changes touched CI workflows, `.claude/` or dependency-update config, make sure the `workflow-auditor` returned a new roster. Run `agentic maintenance` and compare with the previous roster. Report these as regressions:
   - a janitor that was `present` and is now `absent`
   - a running janitor whose prerequisites no longer pass: the contract it guards has weakened, so its reports can no longer be trusted
   Report a janitor that was waiting and whose prerequisites now pass as ready to plan.

10. Apply one merged patch with `"assessedRevision": "HEAD"`, then run `agentic score`.

11. Compare with the previous score history entry. List:
   - criteria that regressed (for example passed to failed), with evidence
   - resolved findings
   - new findings that need tasks. Offer `/agentic:plan` to schedule them.

12. Follow **Publish the tracker**. Confirm `git status --porcelain` is unchanged by the assessment.
