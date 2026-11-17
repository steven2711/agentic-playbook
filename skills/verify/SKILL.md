---
name: verify
description: Independently verify a task awaiting verification against its acceptance criteria, record evidence, complete it if it passes, and rescore.
argument-hint: "<task id>"
disable-model-invocation: true
---
# /agentic:verify

Verify task `$ARGUMENTS`. If no ID is given, use the first task listed under "Awaiting verification" by `agentic next`.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md`.

2. Check the task with `agentic show <id>`. It must be in `verification_required`.

3. Start the `independent-verifier` subagent. Give it:
   - the repo path
   - the task ID and milestone ID
   - nothing about how the task was implemented beyond the diff location (for example `git diff` against the base branch)

   It records evidence and completes the task itself if every acceptance criterion passes.

4. Act on the verifier's verdict:
   - **Pass:** confirm the task now shows `completed` with `agentic show <id>`. Then re-judge the rubric criteria the verifier named: apply a patch that updates only those criteria, with the new evidence strings. Mark any linked findings that are now fixed as `resolved: true`.
   - **Fail:** run `agentic task <id> in_progress --by agent:implementer --reason "verification failed: <summary>"`. Report the failing criteria. Recommend `/agentic:next <id>` to repair.

5. Run `agentic score`. Then check whether the milestone completed with `agentic show <milestone id>`.
   - It may show `verification_required`, meaning all tasks are done but the exit criteria have no evidence yet. If so, verify the exit criteria with the same subagent.

6. Follow **Publish the tracker**.

7. Report: the verdict per criterion, the evidence IDs, the score change (before and after, as printed by the CLI), milestone status, and the next ready task.
