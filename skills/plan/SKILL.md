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

7. Link every actionable finding to at least one task. A finding you intentionally will not address becomes `deferred` with a trigger, or stays unlinked with a stated reason.

8. If milestones already exist, keep the IDs of work that is unchanged. Never remove completed tasks.

9. Run `agentic apply <patch> --by agent:plan`. Fix any warnings about unlinked actionable findings, then run `agentic validate`.

10. Follow **Publish the tracker**.

11. Present the roadmap: milestones in order, with their objective, exit criteria and task count; the first dependency-ready milestone; and the decisions that need a human.

   **Stop and ask the user to approve the roadmap.** When they approve:
   - Record it with `agentic approve roadmap --by human:<name the user gives>`.
   - Ask whether to adopt the record into the repository (`/agentic:adopt`).
