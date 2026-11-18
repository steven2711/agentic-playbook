# Agent evaluations

Each case in `cases/` starts from a clean checkout at the pinned commit, gives the agent one task,
and is graded by the evaluator command, never by the agent's own report.

Reset: `git checkout <start> && git clean -fdx && npm ci`.
