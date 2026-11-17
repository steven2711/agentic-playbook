# Autonomous development and maintenance

## Implementation workflow

Define a repository-native workflow for autonomous implementation:

**Approved intent → Focused implementation plan → Isolated code changes → Deterministic verification → Self-repair → Independent acceptance evaluation → Pull request**

Specify:

- When agents should plan before implementing.
- Which source documents agents must consult.
- How agents discover correct build and test commands.
- How agents should handle ambiguity in requirements.
- How failed validation results feed back into implementation.
- How many remediation attempts are appropriate before stopping or escalating.
- When agents must stop and request approval.
- How high-risk changes and changes to enforcement policies are protected.
- How implementation evidence is recorded.
- How agents avoid introducing unnecessary abstractions or scope expansion.
- How task completion can be independently verified.

Do not introduce a custom agent orchestration framework if existing tools already provide the required capabilities.

Prefer established Claude Code capabilities (`CLAUDE.md`, `.claude/rules/`, skills, hooks, subagents, and settings) and repository-native tooling wherever appropriate.

Keep verification deterministic: CI and local check scripts must produce the same verdict regardless of which agent or human made the change.

## Documentation gardening

Design a proposed autonomous documentation maintenance system.

The objective is to continuously identify and correct documentation drift with minimal human intervention.

Evaluate two complementary execution models.

A. PR-triggered documentation verification

When implementation changes occur:

1. Identify potentially affected documentation.
2. Detect broken references and outdated generated content.
3. Compare relevant documentation claims against changed code.
4. Identify undocumented architectural or behavioral changes.
5. Propose precise documentation corrections.
6. Validate corrections before inclusion.

Determine which checks can be deterministic and which require agent reasoning.

B. Scheduled documentation gardening

Design an autonomous process that periodically:

1. Inventories documentation health.
2. Identifies stale or contradictory knowledge.
3. Verifies documentation against current implementation.
4. Detects missing architectural references.
5. Produces narrowly scoped correction PRs.
6. Records unresolved ambiguity for human review.

Evaluate the appropriate scheduling mechanism, execution environment, permissions, and cost controls.

Do not assume GitHub Actions is automatically the best orchestration mechanism.

Compare reasonable alternatives based on the existing repository and infrastructure.

Safety and autonomy requirements

The proposed system must:

- Avoid inventing architectural intent.
- Distinguish verified corrections from speculative interpretations.
- Provide source evidence for proposed changes.
- Avoid rewriting documents merely because they are old.
- Prevent repeated oscillation between conflicting interpretations.
- Use bounded execution and retry limits.
- Avoid granting untrusted code access to privileged credentials.
- Escalate ambiguous architectural changes.
- Support narrowly scoped auto-merging only when reliable verification exists.

Provide a concrete architecture for a documentation gardener, including:

- Triggers
- Inputs
- Context retrieval
- Verification mechanisms
- Agent responsibilities
- Output artifacts
- PR creation strategy
- Approval and auto-merge policies
- Failure handling
- Observability
- Cost considerations

## Autonomous repository janitors

Extend the analysis beyond documentation.

Identify opportunities for autonomous maintenance agents that continuously improve the repository's suitability for agentic development.

Investigate:

Architecture janitor

Detect architectural drift, duplicated patterns, boundary violations, and inconsistencies with established engineering principles.

Quality janitor

Detect flaky tests, missing regression coverage, obsolete dependencies, dead code, and unreliable validation infrastructure.

Context janitor

Detect duplicated instructions, obsolete skills, broken documentation references, unnecessary context loading, and conflicting agent guidance.

Knowledge-gap detection

Identify recurring situations where agents are likely to lack sufficient information to make reliable engineering decisions.

Propose how those failures could become documentation improvements, automated tests, or enforceable constraints.

For each janitor, determine:

- What it can reliably detect.
- What evidence it requires.
- Which corrections can be safely automated.
- Which corrections require human approval.
- How it avoids noisy or low-value PRs.
- How success should be measured.

Do not recommend autonomous refactoring simply because a pattern looks stylistically inconsistent.

Prioritize correctness, maintainability, architectural integrity, and reduction of future agent failures.

Prefer PR-triggered impact analysis and consider periodic gardening when application and documentation maturity justify the cost. Trace proposed corrections to evidence and review their verification before merging. Assess independent review, risk-based merge decisions, deployment, and observation against existing capabilities.
