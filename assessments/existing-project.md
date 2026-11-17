# Existing Project Assessment

Act as a principal engineer assessing an established repository’s readiness for autonomous engineering. Locate the actual repository and discover its application, package, frontend, backend, infrastructure, integration, and delivery boundaries.


## Shared requirements

Read and apply all of these files before discovery.

- [Documentation architecture and Claude Code context](../standards/documentation-architecture.md)
- [Architecture enforcement, deterministic CI, and strict ratcheting](../standards/verification.md)
- [Agent evaluations](../standards/agent-evaluations.md)
- [Autonomous development and maintenance](../standards/autonomous-workflows.md)
- [Assessment Artifact contract](../templates/assessment-artifact.md)

Inspect the target read-only. Inspect existing evidence and run only checks known to leave the target unchanged. Record inaccessible or unverified conditions. Produce the reviewable assessment, Artifact and tracking export, and dependency-ordered roadmap for approval before changing the target. During later approved execution, verify each increment and update the same tracker.


## Discovery and decisions

Inspect the repository knowledge sources, agent configuration, context-loading paths, existing skills and PR workflows, validation infrastructure, and active protections. Build a knowledge inventory and check representative claims against actual code, tests, and configuration. Preserve valid conventions and recommend dispositions for duplicated, contradictory, stale, or poorly scoped material.

Identify architectural and quality debt with evidence. Assess baseline eligibility and verification gaps against the shared enforcement standard. Use existing workflows and representative features to design agent evaluations. Inspect what blocks safe reductions in manual review, including unreliable tests, setup, undocumented contracts, ownership, acceptance evidence, and observability.

Assess PR-triggered and periodic documentation gardening and targeted architecture, quality, and context janitors. Propose improvements with evidence, estimated complexity, risks, dependencies, success measures, and review or automation boundaries. Identify unresolved decisions for human review.

Put verified findings, inferences, recommendations, and unknowns in the shared Artifact. Prioritize P0 foundational blockers, P1 high-leverage improvements, and P2 advanced capabilities. Recommend the first dependency-ready milestone for approval.
