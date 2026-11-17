---
name: testing
description: Assess each app's testing (strategy, layers, critical-path coverage, coverage tooling, test quality) against the sourced testing profiles, record the gaps, and publish them in the tracker.
argument-hint: "[app root]"
disable-model-invocation: true
---
# /agentic:testing

Assess how each app in this repository is tested and where the gaps are. App root to focus on: `$ARGUMENTS` (empty means all apps).

This also runs inside `/agentic:assess`. **It is read-only for the target repository.** Gaps become findings, and recommended layers are proposals until the user plans them.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md`.

2. Run `agentic where`. If there is no record, run `agentic init` and `agentic scan` first. Then run `agentic tests` and show the user each app's detected kind, test and source file counts, and missing Tier 1 layers. If a kind looks wrong, say so and ask before continuing.

3. Start the `test-strategy-auditor` subagent. Give it:
   - the absolute repo path and the mode
   - the app root, if one was given
   - the record's existing `testing` entries and `VER` findings

   For a repository with more than three apps, start one auditor per app **in parallel**, in a single message.

4. Merge the results into a patch in the session scratchpad:
   - `testing`: each app's snapshot, with `"assessedRevision"` set to the current HEAD. The CLI replaces the entry for the same `scope`.
   - `criteria`: `VER-11` and `VER-12`. Also include `VER-07` and `VER-08` if the auditor gave new evidence and the verification auditor has not judged them in this run.
   - `findings`: as returned, with IDs kept stable.
   - Run `agentic apply <patch> --by agent:test-strategy-auditor`, then `agentic score`.

5. Follow **Publish the tracker**. The **Testing** tab shows each app's layers, critical paths and coverage.

6. Report per app:
   - its kind and stated strategy (or that there is none)
   - layers present and missing, with Tier 1 gaps first
   - the critical-path count, and the uncovered high-consequence paths with their consequence
   - coverage, and whether it is measured on changed code
   - recurring quality problems, each with its TST rule
   - Tier 2 layers whose trigger holds

   End with the question **"Which of these gaps do you want to plan?"** and offer `/agentic:plan`.
