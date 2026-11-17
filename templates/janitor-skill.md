<!--
Starting point for a "Set up <janitor>" task from /agentic:plan.
Copy to .claude/skills/<janitor-name>/SKILL.md in the target repository and fill every <placeholder>
from the record's maintenance roster entry and the library item (reference/maintenance/janitors.yaml).
Keep it short. Delete this comment.
-->
---
name: <janitor-name>
description: <One sentence: what drift it finds, for which contract.> Runs <on pull requests | on a schedule | after <event>>.
---
# <Janitor title>

Guards: <the accepted contract, with links, for example docs/adr/, .claude/rules/api.md, the boundary config>.
Owner: <a named person or team who reviews its output>.

## 0. Preconditions (checked on every run)

The contract this janitor guards must still exist and be enforced. Before doing anything else, check with the repository's own commands:

- `<command that proves the guarded contract exists, for example the boundary check or the docs layout check>`
- `<command that proves each prerequisite still holds, for example the required CI gate on the default branch>`

If any of them fails, do not act. Report which precondition failed, with the command output, and stop. A janitor whose contract has weakened would enforce something nobody agreed to.

## 1. Detect (deterministic)

Run these, and stop with "nothing to report" if they find nothing:

- `<detector command>`
- `<detector command>`

Look only at <the changed paths | documents and code changed since the last run>.

## 2. Judge

<What needs reasoning, from the roster's agent_step.> For each finding, cite the file and line, and the source it disagrees with.
Do not invent intent. If the contract does not say, record the question for a human instead of fixing it.

## 3. Act

May change without a human, and only this:
- <autofix from the roster; never wider than the library's>

<If the library marks this janitor `autofix_risk: high`, list each of its safeguards here as a rule the janitor checks before acting, for example "quarantine only a test that passed and failed on the same commit".>

Never make a check easier to pass: no deleted or skipped tests, weakened assertions, new suppressions, relaxed configuration or lowered thresholds, unless that is exactly the autofix above.

Everything else becomes a proposal: <a review comment | an issue | a pull request a human must approve>.
Always needs a human: <needs_human>.

## 4. Limits

- At most <N> <pull requests | comments | issues> per run; one concern per pull request.
- Skip anything already proposed and not yet answered, and anything listed in `<ignore file>`.
- Do not propose again a change a human rejected; record the rejection in `<where>`.
- Retry a failing step at most <N> times, then stop and report.
- Never run with privileged credentials on code from an untrusted pull request.

## 5. Report

Write a short summary: what it checked, what it changed, what it proposed, and what needs a human.
Record its success measure (<success>) in <where a reassessment can read it>.
