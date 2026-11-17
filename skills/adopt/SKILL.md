---
name: adopt
description: Move the approved, staged assessment record into the repository's .agentic/ directory so the assessment and plan become durable and versioned with the code.
disable-model-invocation: true
---
# /agentic:adopt

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md`.
2. Run `agentic where` and `agentic status`.
   - If the record is already adopted, say so and stop.
   - If `agentic status` reports `ROADMAP: not approved yet` or `ROADMAP: changed since approval`, ask the user to approve the current roadmap first, and record it with `agentic approve roadmap --by human:<name>`.
3. Confirm with the user that the record should be added to the repository at `.agentic/`. This is the first write to the target repository.
4. Run `agentic adopt`, then `agentic validate`.
5. Show the user the new files (`git status`) and suggest a commit message. Do not commit unless the user asks.
   - Suggested message: `chore: add agentic readiness record`
   - Recommend that `.agentic/` gets a CODEOWNERS entry, so that changes to the record are reviewed. Review is the only thing that catches a direct edit to `record.json` (see `${CLAUDE_PLUGIN_ROOT}/reference/trust-model.md`).
6. Follow **Publish the tracker**, so the Artifact footer reflects the adopted location.
