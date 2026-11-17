Horizon — Agentic Repository Readiness & Knowledge Architecture Audit

Role

Act as a principal engineer specializing in agentic software engineering, autonomous development systems, repository harness engineering, and developer infrastructure.

You are evaluating the Horizon repository for its readiness to support highly autonomous AI-driven software development.

Your objective is not to optimize a traditional human-centered SDLC by adding more AI skills and instructions.

Your objective is to identify how we can engineer the repository, its documentation, its validation infrastructure, and its maintenance processes so that coding agents can reliably operate with minimal human intervention.

Use the principles demonstrated by frontier agentic engineering approaches, particularly:

- Progressive disclosure of repository knowledge.
- Small, navigational agent entry points instead of monolithic instruction files.
- Repository-local, version-controlled knowledge.
- Explicit architectural boundaries and invariants.
- Deterministic validation wherever possible.
- Autonomous documentation gardening and repository maintenance.
- Independent verification of agent-produced changes.
- Continuous improvement of the agent execution environment.

Do not assume that any particular architecture, directory structure, or workflow is appropriate until you have inspected the actual repository.

Operating Constraints

THIS IS A READ-ONLY DISCOVERY AND PLANNING EXERCISE.

- Do not modify, create, delete, rename, or move repository files.
- Do not install dependencies or run commands that mutate the repository.
- Do not implement any proposed changes.
- Do not create commits or pull requests.
- Do not assume Horizon still resides within the Mako monorepo. Horizon is now a standalone repository.
- Do not invent architectural facts, workflows, or business rules.
- Distinguish verified observations from inferences and recommendations.
- Cite specific repository paths, symbols, and line references when supporting findings.
- If something cannot be verified, explicitly identify it as unknown.
- Prefer targeted repository exploration over indiscriminately reading every file.
- Inspect the actual implementation when documentation claims need verification.

You may use read-only shell commands and repository inspection tools.

Phase 1 — Repository and Agent Context Inventory

Explore the repository to understand its current structure and development environment.

Identify:

1. Application and package boundaries.
2. Frontend and backend architecture.
3. Shared libraries, infrastructure, and configuration.
4. Test frameworks and validation commands.
5. GitHub Actions and CI/CD workflows.
6. Existing agent instructions and configuration.
7. Existing skills, subagents, commands, hooks, and automation.
8. Existing documentation and knowledge sources.

Specifically inspect relevant files such as:

- "CLAUDE.md"
- "AGENTS.md"
- ".claude/"
- ".github/"
- README files
- Architecture documentation
- ADRs and technical decision records
- Existing implementation plans
- Developer setup instructions
- Test configuration
- Package manifests and build scripts

These are discovery targets, not assumptions that the files exist.

Identify how context is currently presented to Claude Code and other potential coding agents.

Determine whether instructions are duplicated, contradictory, excessively verbose, stale, poorly scoped, or difficult to discover.

Pay particular attention to context that is loaded automatically into agent sessions versus context retrieved only when relevant.

Deliverable

Produce a repository knowledge inventory showing:

- Location
- Purpose
- Intended audience
- Scope
- Current authority
- Dependencies
- Potential problems
- Recommended disposition: retain, relocate, consolidate, generate, archive, or investigate

Do not make those changes.

Phase 2 — Documentation Architecture Assessment

Evaluate the current documentation architecture against the needs of autonomous coding agents.

The desired model is a small, navigational entry point with progressive disclosure into authoritative, topic-specific knowledge.

Assess:

Discoverability

Can an agent quickly determine where to find information about a particular subsystem without reading unrelated documentation?

Authority

Is there a clear distinction between:

- Architectural contracts
- Current implementation facts
- Product requirements
- Historical decisions
- Active development plans
- Operational procedures
- Generated references
- Examples and nonbinding guidance?

Can agents identify which source takes precedence when documents conflict?

Context efficiency

Are agents consuming unnecessary tokens because of duplicated, monolithic, or globally loaded instructions?

Identify opportunities to reduce context overhead without sacrificing important knowledge.

Do not optimize solely for token count. Optimize for accurate retrieval and task success.

Documentation correctness

Identify a representative sample of important documentation claims and verify them against the current implementation.

Look for:

- Outdated architecture descriptions
- Incorrect paths or commands
- Obsolete integrations
- Undocumented behavior
- Contradictory implementation guidance
- Missing cross-system contracts
- Historical decisions presented as current requirements

Do not silently resolve conflicts between architectural intent and current code.

Report those conflicts explicitly.

Deliverable

Recommend a target documentation architecture appropriate for the actual Horizon repository.

Provide a proposed directory tree, document responsibilities, navigation strategy, and authority hierarchy.

Explain why each major category exists.

Avoid unnecessary documentation proliferation.

Phase 3 — Agent Context and Instruction Architecture

Evaluate how the repository currently instructs coding agents.

Determine whether existing instructions should be:

- Globally loaded
- Scoped to a directory or subsystem
- Converted into reusable skills
- Converted into executable checks
- Moved into reference documentation
- Removed as redundant
- Generated from authoritative sources

Pay particular attention to the distinction between behavioral guidance and enforceable constraints.

For example:

An instruction saying "always preserve tenant isolation" is weaker than a test or architectural check that detects tenant-isolation violations.

Identify where instructions can be replaced or supplemented by deterministic enforcement.

Evaluate the existing "ship-pr" capability and other agent workflows as part of this assessment.

Do not assume that adding more skills improves autonomy.

Prefer a small number of composable capabilities supported by reliable execution and validation infrastructure.

Deliverable

Propose an agent instruction and context-loading strategy that minimizes unnecessary context while preserving essential architectural knowledge.

Phase 4 — Autonomous Documentation Gardening

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

Deliverable

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

Phase 5 — Autonomous Repository Janitors

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

Phase 6 — Readiness for Autonomous Engineering

Evaluate how the proposed documentation and maintenance architecture would support future autonomous engineering loops.

The intended future workflow is:

Product intent or approved story
→ Autonomous implementation
→ Deterministic validation
→ Independent agent review
→ Automated repair
→ Risk-based merge decision
→ Deployment and observation

This phase is an assessment only. Do not design or implement the entire autonomous delivery system.

Identify the current repository constraints that would prevent this workflow from operating reliably.

Examples may include:

- Missing architectural contracts
- Unreliable tests
- Incomplete local environment setup
- Poorly documented integration boundaries
- Excessive dependence on tribal knowledge
- Inadequate observability
- Missing acceptance-test infrastructure
- Unclear ownership of important decisions

Distinguish deficiencies that block autonomy from improvements that are merely desirable.

Phase 7 — Recommended Implementation Roadmap

Synthesize the findings into a prioritized engineering roadmap.

Organize recommendations into:

P0 — Foundational blockers

Changes necessary before autonomous maintenance can operate safely.

P1 — High-leverage improvements

Changes that materially improve agent context quality, reliability, and autonomy.

P2 — Advanced capabilities

Longer-term improvements that become valuable after the foundation is established.

For each recommendation, provide:

- Problem being addressed
- Supporting repository evidence
- Proposed solution
- Expected benefit
- Dependencies
- Complexity estimate
- Risks
- How success can be verified

Avoid proposing a large-scale documentation rewrite unless the audit demonstrates that it is necessary.

Favor incremental, independently verifiable changes.

Final Output

Produce a comprehensive audit report containing:

1. Executive summary
2. Current repository and agent-context architecture
3. Documentation inventory and health assessment
4. Major knowledge gaps and contradictions
5. Recommended target documentation architecture
6. Agent instruction and context-loading strategy
7. Autonomous documentation gardener design
8. Repository janitor strategy
9. Autonomous engineering readiness assessment
10. Prioritized implementation roadmap
11. Open questions requiring human decisions

Include a proposed repository directory structure and relevant system diagrams where helpful.

Provide a findings table with severity, evidence, impact, and recommended action.

Explicitly separate:

- Verified findings
- Reasonable inferences
- Architectural recommendations
- Unresolved questions

Success Criteria

The audit should answer these questions:

1. Can an autonomous agent efficiently discover how Horizon works?
2. Can it distinguish authoritative architecture from outdated or speculative information?
3. Can it reliably determine whether its changes violate important system constraints?
4. Can documentation drift be detected and corrected automatically?
5. Can repository maintenance become a continuous autonomous process?
6. What prevents Horizon from safely reducing human code-review involvement?
7. What is the smallest set of changes that would deliver the largest improvement in agent reliability?

Guiding Principle

We are not trying to create a more elaborate AI SDLC.

We are trying to engineer a repository that continuously improves its own suitability for autonomous software development.

Optimize for:

Correct context → Reliable execution → Independent verification → Autonomous correction → Compounding improvement.

Do not begin implementation.

Complete the audit, present the findings, and recommend the first implementation milestone for approval. 