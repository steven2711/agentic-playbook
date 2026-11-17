---
name: plan
description: Turn the readiness findings into a dependency-ordered milestone roadmap and executable task backlog, then stop for approval.
argument-hint: "[focus, e.g. 'P0 only' or 'next level']"
disable-model-invocation: true
---
# /agentic:plan

Build or refresh the remediation roadmap from the assessment record. Focus from the user: `$ARGUMENTS`.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md` and `${CLAUDE_PLUGIN_ROOT}/reference/patch-format.md`.

2. Load the current state:
   - `agentic status` and `agentic validate`
   - the record: get its path from `agentic where` and read the findings, criteria, and any existing milestones and tasks
   - the Artifact contract at `${CLAUDE_PLUGIN_ROOT}/templates/assessment-artifact.md`, sections 2 and 3

3. Design the milestones:
   - **Order:** dependencies first, deterministic enforcement and foundational context before elaborate autonomy, and P0 before P1 before P2.
   - **Gates:** the first milestone should close the gates for the next readiness level. Use the "To reach Ln" list from `agentic score`.
   - **Outcomes:** each milestone is a real engineering outcome, with measurable exit criteria (`M-NNN.Xn`) that can be proven by evidence.
   - **Greenfield:** include first-feature readiness criteria and the triggers for deferred work.

4. Write the tasks:
   - Each one is small enough for one Claude Code session.
   - Each one has acceptance criteria (`T-NNN.ACn`) that someone other than the implementer can verify, plus verification steps, dependencies and linked findings.
   - Set `requiresApproval: true` on any task that touches CI, enforcement policy, baselines, CODEOWNERS, branch protection, secrets or production.
   - Do not fragment work into administrative busywork.

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
   - **Suppressions (`ARC-08`):** if suppressions lack reasons or can grow freely, add a task "Require reasons for inline suppressions in <app>": enable the reason-requiring rule, convert existing blanket suppressions, and fail on new skipped tests.

7. Plan the testing work. Read `agentic tests --json` and the record's `testing` entries.
   - **Apps without a stated strategy (`VER-11`):** add a task "Write test strategy for <app>", with `requiresApproval: true`. It adds a `## Testing` section to the app's scoped conventions file: the layers this app uses, what belongs in each (from the profile's `belongs_here`), and the critical paths. The human reviews the text.
   - **Uncovered or wrong-layer critical paths (`VER-12`):** add one task per high-consequence path, titled "Cover <path> with a <layer> test". Acceptance criteria: the test exercises the path's key behaviour through its public interface, and it fails when that behaviour is broken, proven by a captured temporary revert or mutation that the verifier runs.
   - **Missing Tier 1 layers:** add a task "Add the <layer> layer for <app>": the runner or harness, one real test, and the CI step. Put it before the tasks that need that layer.
   - **Tier 2 layers:** add only when their `when` condition holds now. Never schedule Tier 3 without a cited recurring defect, or anything in `not_recommended`.

8. Plan the documentation work. Read `agentic docs --json` and the record's `docs` snapshot.
   - **If any target entry has an action other than `retain` or `none`:** add a first task "Adopt documentation layout", with `requiresApproval: true`. It writes the target layout (each document's home, load mode and authority) into a short section of the root CLAUDE.md or `docs/README.md`, and the human reviews it. The other documentation tasks depend on it.
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

9. Link every actionable finding to at least one task. A finding you intentionally will not address becomes `deferred` with a trigger, or stays unlinked with a stated reason.

10. If milestones already exist, keep the IDs of work that is unchanged. Never remove completed tasks.

11. Run `agentic apply <patch> --by agent:plan`. Fix any warnings about unlinked actionable findings, then run `agentic validate`.

12. Follow **Publish the tracker**.

13. Present the roadmap: milestones in order, with their objective, exit criteria and task count; the first dependency-ready milestone; and the decisions that need a human.

   **Stop and ask the user to approve the roadmap.** When they approve:
   - Record it with `agentic approve roadmap --by human:<name the user gives>`.
   - Ask whether to adopt the record into the repository (`/agentic:adopt`).
