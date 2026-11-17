# Greenfield Assessment

Act as a principal engineer assessing a newly initialized repository before significant feature implementation. Establish the smallest justified foundation for autonomous development. Treat missing product behavior, domain tests, and mature infrastructure as stage-dependent.


## Shared requirements

Read and apply all of these files before discovery.

- [Documentation architecture and Claude Code context](../standards/documentation-architecture.md)
- [Architecture enforcement, deterministic CI, and strict ratcheting](../standards/verification.md)
- [Agent evaluations](../standards/agent-evaluations.md)
- [Autonomous development and maintenance](../standards/autonomous-workflows.md)
- [Assessment Artifact contract](../templates/assessment-artifact.md)

Inspect the target read-only. Inspect existing evidence and run only checks known to leave the target unchanged. Record inaccessible or unverified conditions. Produce the reviewable assessment, Artifact and tracking export, and dependency-ordered roadmap for approval before changing the target. During later approved execution, verify each increment and update the same tracker.


## Discovery and decisions

Identify the scaffold, stack, manifests, commands, agent configuration, CI, repository protections, product intent, accepted decisions, and justified boundaries. Preserve valid existing decisions. Identify what is established, proposed, deferred, or unknown and cite supporting evidence. Keep approved intent distinct from agent proposals.

Propose the minimum product and context contracts, architecture, security and delivery controls, and reproducible quality checks. Specify where each check applies now and when deferred checks should activate. Establish lightweight documentation validation and defer costly maintenance until justified. Plan proof of reproducible setup, navigation from `CLAUDE.md`, clean CI, failure of prohibited changes, and resistance to policy relaxation. Propose isolated fixtures where real features are unavailable.

Deliver the target foundation and enforcement specification, findings mapped to milestone tasks, first-feature readiness criteria, and triggers for deferred work in the shared Artifact. Start with the dependencies needed for foundational context and enforcement.
