# Operating rules for every /agentic command

These rules apply to every `/agentic:*` command and every subagent it starts. The playbook itself is the requirement set:

- [Greenfield assessment](../assessments/greenfield.md) and [Existing project assessment](../assessments/existing-project.md) are the entry points.
- [Documentation architecture](../standards/documentation-architecture.md), [verification](../standards/verification.md), [agent evaluations](../standards/agent-evaluations.md) and [autonomous workflows](../standards/autonomous-workflows.md) are the standards.
- The [Assessment Artifact contract](../templates/assessment-artifact.md) defines the deliverable.
- [rubric.yaml](../rubric/rubric.yaml) turns the standards into scored criteria. Each criterion quotes its standard.
- The [conventions baseline library](conventions/README.md) holds recommended engineering conventions. Each one cites a public source. Recommendations must reference a library rule ID, and the CLI rejects any other. A repository adopts a convention only when a human accepts it. The [conventions template](../templates/conventions.md) is the starting point for an app's conventions file.
- The [strictness profiles](strictness/README.md) say which deterministic checks are worth turning on for each stack, in cost tiers, and which are not recommended. Strictness recommendations must reference a profile check ID. Tier 2 needs its trigger met, and Tier 3 needs a cited recurring defect.
- The [testing profiles](testing/README.md) say which test layers each kind of app should have and what belongs in each. Testing recommendations must reference a profile layer ID (`TL-`) or a conventions TST rule, and follow the same tier rules. A coverage percentage is never a target.

## The CLI is the only writer

Run the CLI as `agentic <command>`. The plugin's `bin/` puts it on PATH. If `agentic` is not found, run `node <plugin root>/cli/dist/agentic.mjs` instead.

- Never edit `record.json` by hand. Write criteria, findings, milestones, tasks and approvals with `agentic apply <patch.json>`. Write the patch file to the session scratchpad, never into the target repository.
- Change task status only with `agentic task <id> <status> --by <who>`.
- Record proof only with `agentic evidence ...`.
- Never state a score you computed yourself. Report what `agentic score` or `agentic status` prints.
- If the CLI refuses a write, the refusal is the point. Fix the content. Do not work around the guard.

## Identities

`--by` and `--verifier` name who acted. Use them consistently:

| Actor | Identity |
| --- | --- |
| Main session implementing a task | `agent:implementer` |
| The independent-verifier subagent | `agent:independent-verifier` |
| An auditor subagent | `agent:<auditor-name>` |
| A person | `human:<name>`. Only use this when the user said so in this session. |

Completion requires passing evidence from a verifier who is not the implementer. Never record evidence under an identity that did not perform the check.

## Evidence classes

Label every judgement with one of these classes, as defined in the Artifact contract:

- **verified**: you observed it. Cite `path:line`, a command and its output, or an API response.
- **inferred**: a reasonable conclusion from verified facts. Say which facts.
- **recommendation**: a proposed change.
- **unknown**: could not be checked. Say why: no access, external setting, or needs a human.
- **deferred**: not justified at this stage. Give the activation trigger.

Criterion statuses work the same way:

- `passed` and `partial` need evidence strings.
- `n_a` and `unverified` need a reason.
- `deferred` needs a trigger.
- Probe hints in `scan.json` (`criteriaHints`) are a starting point, not a verdict. Confirm them by reading the repository.

## Read-only assessment

During `/agentic:assess` and `/agentic:reassess`, do not modify the target repository: no file writes, installs, formatters, commits or branch changes. Only run checks known to leave the worktree unchanged. The record stays staged outside the repository until `/agentic:adopt`. Confirm with `git status --porcelain` at the end, and report any change.

## Stable IDs

| Item | ID format |
| --- | --- |
| Findings | `F-<DIM>-NNN`, for example `F-VER-003` |
| Milestones | `M-NNN` |
| Tasks | `T-NNN` |
| Acceptance criteria | `T-NNN.ACn` |
| Exit criteria | `M-NNN.Xn` |
| Conventions assessments | `CV-NNN`, assigned by the CLI per (app root, rule) |

On reassessment, reuse an ID for the same issue. Mark a fixed finding `resolved: true` instead of deleting it.

## Publish the tracker

The Artifact is the only view, so every command that changes the record ends with these steps:

1. Run `agentic render`. It prints the path of a self-contained HTML file outside the repository.
2. Run `agentic status --json` and read `artifact.url`.
   - **If there is a URL:** call the Artifact tool with `action: "read"` on that URL first. Then publish the rendered file with `url` set to it, so the same page updates in place. Omit `icon`.
   - **If there is no URL:** publish the rendered file as a new Artifact with `icon: "chart"` and the description "Agentic readiness score, findings, roadmap and verification tracker for <repo>."
3. Run `agentic published --url <artifact url>`.
4. Tell the user the link and the record revision it shows.

If the Artifact tool is unavailable, say so plainly. Give the rendered file path and the record location. Do not claim the tracker is current.

## Stop and ask

Stop and ask the user before any of these:

- Approving a roadmap.
- Adopting the record into the repository.
- Touching enforcement policy, CI, baselines, CODEOWNERS, branch protection or secrets.
- Any task with `requiresApproval: true`.
- When requirements are ambiguous or architectural intent is unclear.

Never invent product intent or architectural facts.
