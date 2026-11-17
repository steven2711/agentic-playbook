---
name: assess
description: Run a read-only agentic readiness assessment of the current repository (greenfield or existing), score it, and publish the tracker Artifact.
argument-hint: "[greenfield|existing] [--github]"
disable-model-invocation: true
---
# /agentic:assess

Assess this repository's readiness for autonomous agentic engineering. **The assessment is read-only for the target repository.**

Arguments: `$ARGUMENTS`. This can be an optional mode override (`greenfield` or `existing`) and `--github` to read branch protection through `gh`.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md` and follow it throughout.

2. Run `agentic where`.
   - If a record already exists, stop. Tell the user, and offer `/agentic:reassess` (keeps the IDs) or `agentic init --force` (starts over, after confirmation).
   - Otherwise run `agentic init` (add `--mode <mode>` if the user gave one).
   - Then run `agentic scan` (add `--github` if asked and `gh auth status` succeeds).

3. Read the mode that init reports.
   - Follow `${CLAUDE_PLUGIN_ROOT}/assessments/greenfield.md` or `${CLAUDE_PLUGIN_ROOT}/assessments/existing-project.md`.
   - If the detected mode looks wrong for this repository, say why and ask before continuing. Switch with a patch `{"mode": "..."}`.

4. Start the four auditors **in parallel** in a single message: `context-auditor`, `verification-auditor`, `eval-designer` and `workflow-auditor`. Give each of them:
   - the absolute repo path
   - the mode
   - the `scan.json` path from `agentic where`
   - the instruction to return only JSON as their definition specifies

5. Merge their outputs into one patch in the session scratchpad.
   - Include `"assessedRevision": "HEAD"`, all criteria, and all findings.
   - Do not invent anything the auditors did not evidence.
   - Resolve overlaps:
     - **Duplicate findings:** keep the stronger evidence.
     - **Contradictory findings:** record the contradiction as an `unknown` finding with a reason, and do not pick a side.
   - Run `agentic apply <patch> --by agent:assess`. Fix and retry until it applies.

6. Run `agentic score`.

7. **Conventions recommendations.** Follow steps 3 to 4 of `${CLAUDE_PLUGIN_ROOT}/skills/conventions/SKILL.md`. This starts the `conventions-advisor` for every app root and applies its results. The advisor compares each app with published industry practice from the sourced baseline library. Recommendations do not change the score.

8. Follow **Publish the tracker** from the operating rules.

9. Run `git status --porcelain` in the target repository and confirm nothing changed. Report anything that did.

10. Report to the user in a short summary:
   - the score, level and confidence, as printed by the CLI
   - the top P0 findings
   - what blocks the next level
   - the inventory highlights
   - per app: its stack, whether it has scoped conventions, and the top 3 to 5 conventions recommendations, each with rule ID and source title. Ask which ones to adopt.
   - open questions that need a human decision
   - the Artifact link

   Recommend `/agentic:plan` as the next step. Do not start planning or making changes yet.
