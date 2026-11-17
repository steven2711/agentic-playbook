---
name: reassess
description: Re-run the readiness assessment at the current HEAD, keeping stable IDs, flagging regressions and resolved findings, judging milestone exit criteria, and rescoring. This is how roadmap progress is recorded.
argument-hint: "[dimension ids to limit, e.g. VER ARC] [--github]"
disable-model-invocation: true
---
# /agentic:reassess

Refresh the assessment against the current code. The assessment is read-only for the target repository. It is also how the roadmap records progress: the team implements tasks in its own workflow, and reassessment resolves their findings and judges each milestone's exit criteria from what is now in the repository. Arguments: `$ARGUMENTS`.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md`. Run `agentic status` and `agentic changes --json` **before** scanning, so probe regressions are measured against the previous scan. Then run `agentic readonly begin` and `agentic scan` (add `--github` if requested).

2. Decide what to audit from `agentic changes --json`:
   - `dimensions` lists the rubric dimensions each changed path can affect, and `snapshots` lists the conventions, strictness, testing, docs and maintenance snapshots it makes stale. `apps` lists the app roots whose code changed. `probeRegressions` lists probes that got worse since the last scan.
   - Audit every dimension and snapshot listed, plus any dimension with a regressed probe. If the user limited dimensions, audit only those, and say which listed ones you skipped.
   - If `revisionKnown` is false (the assessed revision is no longer in history), audit everything.
   - Read `git log --oneline <assessedRevision>..HEAD` for context on what the team did.

3. Start the relevant auditors in parallel. Give each one its current criteria and findings from the record, and tell it to:
   - reuse finding IDs for the same issue
   - mark fixed findings `resolved: true`, citing the evidence that it is fixed. A finding is resolved by what the repository shows, never because someone says the work is done.
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

10. Judge the exit criteria of every milestone that is not `completed`. For each exit criterion, decide from the repository whether it is now `met` (cite the evidence), `unmet` (cite what is missing), or `unverified` (give the reason, for example that it needs a CI run you cannot read). Send them as `"milestones": [{"id": "M-001", "exitCriteria": [{"id": "M-001.X1", "status": "met", "evidence": ["..."]}]}]`. Exit criteria merge by ID, so leave out the text. A milestone completes only when every exit criterion is `met`.

11. Apply one merged patch with `"assessedRevision": "HEAD"`, then run `agentic score`. Then run `agentic readonly end` and report any change it lists.

12. Compare with the previous score history entry. List:
   - criteria that regressed (for example passed to failed), with evidence
   - resolved findings, and the tasks they addressed (`agentic roadmap` lists what is still open)
   - milestones whose exit criteria changed, and any milestone now completed
   - new findings that need tasks. Offer `/agentic:plan` to schedule them.
   - if `agentic status` says the roadmap changed since its approval, say so

13. Follow **Publish the tracker**.
