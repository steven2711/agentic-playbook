---
name: next
description: Pick the next dependency-ready roadmap task (or a named one), implement it with bounded self-repair, run deterministic checks, and hand it to verification.
argument-hint: "[task id]"
disable-model-invocation: true
---
# /agentic:next

Implement one roadmap task. Requested task: `$ARGUMENTS` (empty means the next ready task).

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md` and `${CLAUDE_PLUGIN_ROOT}/standards/autonomous-workflows.md`, section "Implementation workflow". Then read the target repository's own CLAUDE.md and its relevant docs.

2. Check the preconditions:
   - Run `agentic status --brief`. If the record is not adopted, recommend `/agentic:adopt` first. Work can proceed, but the record will not be versioned with the changes.
   - If any task is `in_progress` or `verification_required`, surface it before starting another one.

3. Choose the task:
   - Run `agentic next` and pick the requested task, or the first ready one. Read it fully with `agentic show <id>`, then its findings and milestone.
   - If it has `requiresApproval` and no approval is recorded, show the plan and ask the user. Record their answer with `agentic approve <id> --by human:<name>`.
   - Run `agentic task <id> in_progress --by agent:implementer`.

4. Implement:
   - Read the conventions for every app root you will touch (`agentic conventions --app <root>` lists the files) and follow them. When a convention conflicts with the task, stop and ask. Do not silently break the convention.
   - Plan briefly before editing.
   - Keep the change scoped to the acceptance criteria: no unrelated refactors and no new abstractions the task does not need.
   - If requirements or architectural intent are ambiguous, stop and ask. Do not guess.

5. Verify deterministically:
   - Run the repository's canonical checks plus the task's verification steps.
   - If a check fails, repair and re-run. You get **at most 3 repair attempts**.
   - After 3 failed attempts, run `agentic task <id> blocked --by agent:implementer --reason "<what failed and why>"`, report, and stop.

6. When your checks pass:
   - Run `agentic task <id> verification_required --by agent:implementer`.
   - Do not record evidence for your own task, and do not complete it.
   - Summarise for the user: the diff, what you ran and the results.
   - Recommend `/agentic:verify <id>`, which starts an independent verifier.

7. Follow **Publish the tracker**.

Do not commit, push or open pull requests unless the user asks. If they ask, include the task ID in the commit message.
