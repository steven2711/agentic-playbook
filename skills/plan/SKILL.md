---
name: plan
description: Turn the readiness findings into a dependency-ordered milestone roadmap and a task backlog the team can implement in its own workflow, then stop for approval.
argument-hint: "[focus, e.g. 'P0 only' or 'next level']"
disable-model-invocation: true
---
# /agentic:plan

Build or refresh the remediation roadmap from the assessment record. Focus from the user: `$ARGUMENTS`.

The roadmap is a handoff. The team implements it in its own workflow, with its own cadence and review. The playbook tracks no task status: `/agentic:reassess` records progress by resolving findings and judging exit criteria. So write every task so that someone who never saw this session can implement it, and someone else can check it.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md` and `${CLAUDE_PLUGIN_ROOT}/reference/patch-format.md`.

2. Load the current state:
   - `agentic status` and `agentic validate`
   - the record: get its path from `agentic where` and read the findings, criteria, and any existing milestones and tasks
   - the Artifact contract at `${CLAUDE_PLUGIN_ROOT}/templates/assessment-artifact.md`, sections 2 and 3

3. Design the milestones:
   - **Order:** dependencies first, deterministic enforcement and foundational context before elaborate autonomy, and P0 before P1 before P2.
   - **Gates:** the first milestone should close the gates for the next readiness level. Use the "To reach Ln" list from `agentic score`.
   - **Horizon:** plan only the criteria in `agentic score --json` → `horizon.criteria`: everything gated up to two levels above the current one, plus every P0. Do not plan tasks for `horizon.later`. Those findings stay in the record, unlinked, and the roadmap summary lists them as "after <level>". A repository at L0 does not get L4 automation, eval harnesses or janitors in its roadmap, and reassessment moves the horizon as the level rises.
   - **Outcomes:** each milestone is a real engineering outcome, with measurable exit criteria (`M-NNN.Xn`) that can be proven by evidence.
   - **Greenfield:** include first-feature readiness criteria and the triggers for deferred work.

4. Write the tasks:
   - Each one is small enough for one Claude Code session.
   - Each one has acceptance criteria (`T-NNN.ACn`) that someone other than the implementer can verify, plus verification steps, dependencies and linked findings. Link every task to the findings it fixes: a task counts as addressed only when reassessment resolves those findings.
   - A task may depend only on tasks in its own milestone or in milestones its milestone depends on. The CLI refuses anything else.
   - Set `requiresApproval: true` on any task that touches CI, enforcement policy, baselines, CODEOWNERS, branch protection, secrets or production. It tells the team that a human decision is needed before anyone implements it.
   - Defer a task by setting `deferredTrigger` to its activation trigger.
   - Do not fragment work into administrative busywork. The roadmap is the minimum work that raises readiness, not a catalogue of every possible improvement.
   - **One task per artifact.** If two steps below would create tasks that edit the same file or configuration for the same app, write one task that covers both sets of findings. Split it only when one task would be too large for a session.
   - **Extend what works.** Never plan to replace a working mechanism, such as a coverage threshold, a test layer, a documentation home or a tool, only to match the library's preferred form. Extend it, or note the difference in the summary.

5. Plan the conventions work. Read `agentic conventions --json`.
   - **Apps without a scoped conventions file, or with `accepted` recommendations:** add one task per app titled "Draft conventions for <app>", with `requiresApproval: true`.
     - Seed it from `${CLAUDE_PLUGIN_ROOT}/templates/conventions.md`, using the accepted rules (cite their library IDs) and the app's real patterns.
     - The human reviews the drafted text before it is adopted.
   - **Accepted rules with `promoteTo`:** add one task per rule titled "Promote <rule> to <tool>". Its acceptance criteria include a negative fixture that the new lint rule rejects.
   - **Every code-changing task in an app that has conventions:** add an acceptance criterion "Diff conforms to <conventions file> (independent conventions review)".
   - Only `proposed` recommendations: list them as decisions for the human. Do not create tasks for them.

6. Plan the strictness work. Read `agentic strictness --json`.
   - **Missing Tier 1 checks:** add one task per app titled "Enable Tier 1 strictness for <app>", with `requiresApproval: true` because it changes enforcement policy. Split it by tool only if one task would be too large for a session.
     - Acceptance criteria: each check runs in CI and fails on a seeded violation; existing violations are at zero or in a committed tool-native baseline; a new violation in a baselined file still fails.
     - Put it in the first milestone, because every later task is checked by it.
   - **Tier 2 checks:** add these only when their `when` condition holds now. Otherwise mention the trigger in the roadmap summary.
   - **Tier 3 and `not_recommended`:** never schedule Tier 3 without a cited recurring defect, and never schedule anything that is not recommended.
   - **Suppressions (`ARC-08`):** if suppressions lack reasons or can grow freely, enable the reason-requiring rule, convert existing blanket suppressions, and fail on new skipped tests. This is the same lint configuration, so put it in the Tier 1 strictness task when there is one. Make it a separate task, "Require reasons for inline suppressions in <app>", only when Tier 1 is already complete.

7. Plan the testing work. Read `agentic tests --json` and the record's `testing` entries.
   - **Apps without a stated strategy (`VER-11`):** the strategy is a `## Testing` section of the app's scoped conventions file: the layers this app uses, what belongs in each (from the profile's `belongs_here`), and the critical paths. When the app also has a "Draft conventions" task, add this as acceptance criteria of that task. Otherwise add a task "Write test strategy for <app>", with `requiresApproval: true`. The human reviews the text.
   - **Uncovered or wrong-layer critical paths (`VER-12`):** add one task per high-consequence path, titled "Cover <path> with a <layer> test". Acceptance criteria: the test exercises the path's key behaviour through its public interface, and it fails when that behaviour is broken, proven by a captured temporary revert or mutation that a reviewer can rerun.
   - **Missing Tier 1 layers:** the runner or harness, its CI step and one real test. When a "Cover <path>" task needs the layer, set the layer up in the first such task instead of a separate one. Otherwise add a task "Add the <layer> layer for <app>", and put it before the tasks that need it.
   - **Tier 2 layers:** add only when their `when` condition holds now. Never schedule Tier 3 without a cited recurring defect, or anything in `not_recommended`.

8. Plan the documentation work. Read `agentic docs --json` and the record's `docs` snapshot.
   - **If any target entry is relocated, consolidated or archived:** add a first task "Adopt documentation layout", with `requiresApproval: true`. Creating documents alone does not need it: the creation tasks state each new document's home. It writes the target layout (each document's home, load mode and authority) into a short section of the root CLAUDE.md or `docs/README.md`, and the human reviews it. The other documentation tasks depend on it.
   - **Group the remaining actions** into tasks a single session can finish:
     - "Create <artifact> at <home>"
     - "Relocate <path> to <home>"
     - "Consolidate <paths> into <home>"
     - "Archive <path>"

     Tier 1 comes first. Put moves before creations that link to the moved files.
   - **Acceptance criteria:**
     - every relative link in the touched docs resolves (`agentic docs` reports no new broken links)
     - `agentic docs` shows the item present at its home
     - the navigation goal it serves is reachable from CLAUDE.md
     - no instruction is left in two homes
     - the always-loaded line count does not grow, unless the task says why
   - **CI and ownership:** tasks that add a CI docs check or CODEOWNERS entries set `requiresApproval: true`.
   - **Tier 2 items:** add them only when the auditor cited their condition. Never schedule Tier 3 without a cited recurring problem, or anything in `not_recommended`.

9. Plan the maintenance work. Read `agentic maintenance --json` and the record's `maintenance` roster.
   - **Only within the horizon:** janitors are L4 work. Plan janitor tasks only when `horizon.through` is L4, which means the repository is at L2 or above. Otherwise, list the roster in the roadmap summary with what each janitor waits on, and create no tasks for them.
   - **Last milestone:** put janitor tasks in a final milestone, "Autonomous maintenance". It depends on the milestones that make the janitors' prerequisites pass. A janitor guards a contract that earlier work produces (the documentation layout, the conventions, the boundary rules), so it never comes first.
   - **One task per janitor** recommended `now` or `after-prerequisites`, titled "Set up <janitor>", with `requiresApproval: true`. It depends on the tasks that close the criteria in `blockedBy`. It produces:
     - a skill or subagent definition, seeded from `${CLAUDE_PLUGIN_ROOT}/templates/janitor-skill.md`
     - its trigger in the place the roster names (a CI workflow, a Claude Code scheduled task or a hook)
     - its noise limits and a named owner
   - **Acceptance criteria:**
     - its preconditions section re-checks, with the repository's own commands, that the guarded contract exists and the prerequisite checks pass, and it reports instead of acting when they do not
     - for a janitor whose library entry is `autofix_risk: high`, one criterion per library `safeguard`
     - a dry run on the current repository produces a report with evidence and changes nothing
     - the noise limits are configured (caps, deduplication, thresholds)
     - it can change only what the library's `autofix` allows; everything else becomes a proposal
     - it runs without privileged credentials on code from untrusted pull requests
     - its success measure is recorded somewhere a reassessment can read
   - **Order:** pull-request janitors before scheduled ones. Tier 1 first.
   - **Tier 2 janitors:** add only when the auditor cited their condition. Never schedule Tier 3 without a cited recurring problem, or anything in `not_recommended`. Roster entries marked `not-yet` go into the roadmap summary with their condition, not into tasks.

10. Link every actionable finding within the horizon to at least one task. A finding you intentionally will not address becomes `deferred` with a trigger, or stays unlinked with a stated reason. Findings beyond the horizon stay unlinked: the CLI does not warn about them.

11. If milestones already exist, keep the IDs of work that is unchanged. Never remove an addressed task (its findings are resolved): it is the record of that work, and the CLI refuses it.

12. Run `agentic apply <patch> --by agent:plan`. Fix any warnings about unlinked actionable findings, or about criteria blocking the next level with no planned task. Then run `agentic validate`.

13. Follow **Publish the tracker**.

14. Present the roadmap: milestones in order, with their objective, exit criteria and task count; the open tasks in order (`agentic roadmap`); what is beyond the horizon, in one line per level; and the decisions that need a human.

   **Stop and ask the user to approve the roadmap.** When they approve:
   - Record it with `agentic approve roadmap --by human:<name the user gives>`. The approval covers this exact plan. Changing a milestone or task later shows the roadmap as changed since approval, until the user approves it again.
   - Ask whether to adopt the record into the repository (`/agentic:adopt`).
   - Tell the user how to proceed: implement the tasks in their own workflow, in the order `agentic roadmap` lists, then run `/agentic:reassess` to record progress.
