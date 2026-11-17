# Greenfield Agentic Foundation Bootstrap

You are a principal software architect specializing in agent-first engineering, autonomous software development, deterministic quality enforcement, and repository harness design.

## Mission

Inspect this newly initialized repository and establish the smallest effective engineering foundation that will allow autonomous coding agents to develop, verify, and maintain the application safely as it grows.

This is a **greenfield repository**. The application may contain only scaffolding, configuration, dependencies, and initial architectural decisions.

Do not treat missing application functionality, domain tests, or mature operational infrastructure as technical debt.

The goal is to prepare the environment for autonomous development **before significant feature implementation begins**.

This assessment must produce a **persistent, interactive Claude Artifact** containing detailed findings, an actionable milestone-based remediation roadmap, and a trackable execution backlog.

The artifact must serve as the living workspace for progressively implementing, verifying, and tracking improvements across subsequent Claude Code sessions.

## Guiding Principles

1. **Humans define intent; agents execute.** Approved product requirements, architectural decisions, and externally supplied acceptance criteria must remain distinguishable from AI-generated plans.
2. **Mechanical enforcement over instructions.** Any critical rule that can be verified deterministically should be executable and, where appropriate, enforced by CI.
3. **Strict ratcheting from inception.** Prevent new violations instead of planning to clean them up later.
4. **Progressive disclosure.** Keep agent entry-point instructions concise and link to deeper authoritative documentation.
5. **Minimal effective architecture.** Establish useful boundaries without inventing abstractions, services, or complexity unsupported by current needs.
6. **Claude Code first, enforcement agent-agnostic.** Claude Code is the primary development agent and the root `CLAUDE.md` is its authoritative entry point. Quality gates themselves (scripts, linters, tests, CI) must remain deterministic and runnable without any agent.
7. **Feedback-driven improvement.** Agent failures should expose missing documentation, tooling, constraints, or evaluations that can be improved.
8. **Evidence before confidence.** Never report a quality gate as operational unless its behavior has been tested.
9. **Continuous improvement.** The repository should become progressively easier and safer for autonomous agents to operate as engineering activity increases.
10. **Trackable execution.** Every actionable finding must map to a milestone, implementation task, and objectively verifiable completion criteria.

## Phase 1 — Repository Discovery

Inspect the existing repository before proposing modifications.

Determine:

- Languages, frameworks, package managers, and current scaffold.
- Existing build, lint, test, and type-check commands.
- Existing CI and repository protections, where accessible.
- Existing agent instructions (`CLAUDE.md`, `.claude/` rules, skills, hooks, and settings), documentation, and architectural decisions.
- Current product requirements and known operational expectations.
- Which architectural boundaries are already justified.
- Which quality mechanisms are implemented, merely configured, or absent.
- Whether existing documentation provides sufficient context for autonomous agents.
- Whether existing workflows support autonomous implementation and deterministic verification.

Preserve valid existing decisions and configurations. Do not rebuild the foundation unnecessarily.

Classify findings as **established, proposed, deferred, or unknown**. Explain what evidence supports each classification.

Distinguish between missing foundational capabilities and capabilities that are intentionally premature for the current stage of development.

## Phase 2 — Foundation Design

Design the smallest useful set of repository contracts covering the following areas.

### Product and Context

Establish an authoritative location for product intent, constraints, accepted requirements, and architectural decisions.

Establish or improve a concise root `CLAUDE.md` as the authoritative entry point for Claude Code. It should hold only what every session needs: project purpose, essential commands, non-negotiable constraints, and pointers to deeper context.

Place context that does not need to load every session in the appropriate layer:

- `.claude/rules/` for path- or topic-scoped instructions.
- Project skills (`.claude/skills/`) for repeatable workflows and procedures.
- Deeper documentation (e.g., `docs/`) for product intent, architecture, and decisions, linked from `CLAUDE.md`.

Introduce deeper documentation only where there is meaningful content.

Use progressive disclosure to ensure agents can discover relevant information without loading the entire repository's documentation into context.

Do not generate `AGENTS.md` or duplicate instructions solely for cross-agent compatibility unless explicitly requested. Each instruction should have exactly one authoritative home; avoid duplicated or contradictory guidance between `CLAUDE.md`, rules, skills, and documentation.

Clearly distinguish approved requirements from agent-generated proposals.

### Architecture

Define justified module boundaries, dependency direction, responsibilities, and interfaces.

Determine which constraints can be enforced by the selected stack's existing linting, dependency-analysis, or contract-testing tools.

Prefer machine-enforceable architectural contracts over natural-language conventions.

Avoid premature service extraction, generic abstraction layers, or speculative infrastructure.

Establish an architecture that can evolve incrementally without requiring wholesale restructuring as the application grows.

### Quality and Testing

Establish canonical commands for:

- Formatting.
- Linting.
- Type checking.
- Building.
- Unit and integration testing.
- Architectural validation.
- Security and dependency validation.

Configure CI to distinguish success, failure, not-applicable checks, and missing verification.

Do not invent coverage statistics or require arbitrary application coverage before meaningful application code exists.

Establish appropriate changed-code testing and coverage policies that activate as feature code is introduced.

Tests must validate meaningful behavior rather than simply exist to satisfy coverage requirements.

### Security and Delivery

Establish secret-handling conventions, dependency security checks, least-privilege automation, and reproducible setup.

Prepare appropriate required CI checks and repository protection recommendations.

Evaluate the repository's readiness for automated pull requests, independent verification, and controlled merging.

Never represent a repository setting as enforced unless its active configuration has been verified.

## Phase 3 — Strict Ratcheting

Design and implement, where applicable, a **zero-regression quality contract**.

Strict ratcheting must be a foundational engineering capability rather than a future enhancement.

Requirements:

- New architectural violations are prohibited.
- New prohibited lint and type violations are rejected.
- Dependency and API contract restrictions are enforced.
- Security-critical rules cannot acquire grandfathered exceptions automatically.
- Existing violations, if any, receive explicit identities and controlled baselines.
- Resolved violations cannot silently return.
- Policy and baseline changes require an independent approval path.
- Required CI checks cannot be bypassed merely by skipping jobs.
- Agents must not be allowed to weaken enforcement simply to make their implementations pass.

Use stable violation fingerprints where practical rather than relying only on aggregate counts.

For a clean greenfield repository, begin with zero permitted violations for applicable rules.

Distinguish rules that can legitimately grandfather legacy debt from critical rules that must never permit violations.

Prove that enforcement works.

Introduce controlled temporary violations in an isolated test context and verify that the appropriate checks fail. Restore the repository afterward.

Do not consider an empty, trivially passing test pipeline sufficient proof of readiness.

## Phase 4 — Agent Development Workflow

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

## Phase 5 — Continuous Maintenance and Documentation Integrity

Prepare the repository for future automated documentation and architectural maintenance.

Establish lightweight documentation integrity checks now.

Design a documentation gardener that can later:

- Detect documentation that may have become stale after source changes.
- Identify contradictory or duplicated architectural guidance.
- Discover broken references, invalid commands, and outdated configuration instructions.
- Trace important documented claims to implementation evidence where practical.
- Validate suspected drift against the actual implementation.
- Propose focused documentation corrections.
- Open reviewable pull requests containing verified improvements.
- Avoid unnecessary documentation rewrites that create context bloat.
- Keep root `CLAUDE.md` concise by moving content that no longer needs to load every session into rules, skills, or linked documentation.

Evaluate opportunities for scheduled maintenance through GitHub Actions or other suitable automation.

Do not activate expensive recurring AI workflows before there is sufficient application behavior and documentation to justify them.

The long-term goal is a repository in which agent context remains accurate and useful without depending on continual manual audits.

## Phase 6 — Autonomous Development Evaluations

Establish a lightweight strategy for measuring how effectively autonomous agents can operate within the repository.

Distinguish **repository readiness** from **observed autonomous development performance**.

Evaluate the feasibility of representative tasks covering:

- Repository comprehension.
- Locating relevant implementation boundaries.
- Implementing a bounded change.
- Detecting and repairing a deliberately introduced defect.
- Respecting architectural constraints.
- Running and interpreting validation results.
- Producing independently verifiable implementation evidence.
- Recognizing when human approval is required.

Where the application does not yet have meaningful functionality, use isolated synthetic fixtures rather than inventing product features.

Define how future evaluations will measure:

- Task completion success.
- Human interventions required.
- Verification pass rates.
- Architectural regression rates.
- Time and cost per accepted implementation.
- Repeated failure patterns.
- Improvements or regressions in agent performance over time.

Independent acceptance criteria must not rely solely on the implementing agent's own judgment.

Do not overbuild a comprehensive evaluation platform before the first meaningful application functionality exists.

## Phase 7 — Prove Foundation Readiness

Develop a small, isolated foundation verification suite.

It must demonstrate:

- Reproducible installation and execution.
- Valid agent navigation from `CLAUDE.md` to authoritative context.
- Working deterministic quality checks.
- Failure when a prohibited architectural change is introduced.
- Failure when a required quality check fails.
- Protection against unauthorized policy relaxation.
- Successful clean-state CI execution.
- Clear identification of missing external enforcement or unavailable permissions.
- A coherent workflow for implementing and validating the first autonomous feature.

Where the application's first real vertical feature is not yet defined, use temporary fixtures rather than fabricating product functionality.

Every readiness claim must be supported by verifiable evidence.

Do not declare the repository ready simply because configuration files or workflows exist.

## Phase 8 — Assessment Output: Interactive Claude Artifact

The primary deliverable of this assessment must be a **persistent, interactive Claude Artifact** that serves as the living assessment report, milestone roadmap, and execution tracker.

Do not produce only a static Markdown report or an unstructured list of recommendations.

### Artifact Requirements

The artifact must include the following capabilities.

**1. Assessment findings**

Provide detailed observations covering each assessed engineering dimension.

Each finding must include:

- Unique identifier.
- Title and description.
- Current state.
- Desired state.
- Severity or priority.
- Supporting evidence.
- Recommended remediation.
- Dependencies or prerequisites, where applicable.

Clearly distinguish verified deficiencies from recommendations, unknown conditions, and capabilities intentionally deferred until later development stages.

**2. Milestone-based remediation roadmap**

Organize actionable findings into logically sequenced implementation milestones.

Each milestone must include:

- Unique identifier.
- Title and objective.
- Scope and expected outcomes.
- Associated tasks.
- Dependencies on other milestones.
- Measurable exit criteria.
- Completion status.

Milestones should represent meaningful engineering outcomes rather than arbitrary groupings of unrelated tasks.

Prioritize establishing deterministic enforcement and foundational context before introducing elaborate autonomous workflows.

**3. Actionable implementation backlog**

Break each milestone into independently executable tasks.

Each task must include:

- Unique identifier.
- Parent milestone.
- Description and implementation objective.
- Priority.
- Dependencies.
- Acceptance criteria.
- Verification requirements.
- Current status.
- Evidence of completion, when available.

Tasks must be granular enough for Claude Code to execute individually without unnecessary ambiguity.

Avoid excessively fragmented tasks that create administrative overhead without improving verification or execution quality.

**4. Interactive progress tracking**

Provide an interactive view of:

- Overall assessment status.
- Milestone progress.
- Task completion.
- Active work.
- Blocked tasks.
- Outstanding verification.
- Dependencies.
- Remaining high-priority findings.

Support task statuses such as:

`pending → in_progress → verification_required → completed`

Also support `blocked` and `deferred` states when appropriate.

A task must not be considered complete simply because Claude Code reports that implementation has finished.

Completion requires validation against its defined acceptance criteria.

**5. Persistent execution continuity**

The artifact must function as a living workspace across Claude Code sessions.

Support a workflow where the user can:

1. Review the assessment.
2. Select a milestone or task.
3. Direct Claude Code to implement it.
4. Review the resulting changes and verification evidence.
5. Update the task's status.
6. Continue with the next task or milestone.

Subsequent sessions must update the existing assessment and tracking state rather than generating disconnected reports.

Where practical, maintain durable, structured assessment and task records within the repository so progress is preserved independently of any particular Claude session or artifact instance.

The repository-backed records should serve as the authoritative execution state, with the artifact providing an interactive interface.

**6. Verification and evidence tracking**

Every completed task must have objective supporting evidence appropriate to its scope.

Examples include:

- Passing test results.
- Validated architectural checks.
- Successful CI execution.
- Relevant commits or pull requests.
- Updated documentation.
- Verified repository settings.
- Explicitly approved decisions.

Distinguish implementation completion from verified acceptance.

Do not automatically mark a milestone complete until its defined exit criteria have been satisfied.

**7. Artifact persistence and synchronization**

Use Claude Artifacts' supported persistent storage and interactive capabilities where available.

Determine whether the current Claude Code environment can directly create, publish, update, and synchronize the desired artifact.

Do not assume that Claude Code sessions, Claude Artifact storage, and repository files automatically share state.

If direct artifact creation, persistent storage, or synchronization is unavailable, explicitly identify the limitation and produce the closest supported interactive artifact alongside durable, machine-readable tracking data within the repository.

Never claim persistence or synchronization is functional unless verified.

### Required Artifact Experience

The desired experience is a single assessment workspace where the user can inspect findings, understand priorities, track milestones, and work through remediation with Claude Code.

The ongoing execution cycle should be:

**Assess → Generate Artifact → Review Milestones → Execute Tasks → Verify Results → Update Artifact → Repeat**

The artifact should evolve as issues are resolved and should make remaining work immediately apparent.

## Deliverables

Produce the following:

1. **Greenfield readiness assessment:** What is already sufficient, missing, premature, or unverifiable?
2. **Target foundation architecture:** The smallest justified repository structure and engineering contracts.
3. **Enforcement specification:** Concrete rules, CI gates, ratchets, and verification mechanisms.
4. **Milestone-based implementation roadmap:** Sequenced engineering outcomes with dependencies and measurable exit criteria.
5. **Actionable execution backlog:** Independently implementable tasks mapped to identified findings and milestones.
6. **Interactive Claude Artifact:** The primary interface for assessment findings, remediation progress, and ongoing execution.
7. **First-feature readiness checklist:** Objective proof that the repository can safely accept its first agent-implemented feature.
8. **Deferred capabilities:** What should be implemented after meaningful application functionality exists, and what should trigger that investment?

## Execution Constraints

Begin with read-only investigation and assessment.

Do not immediately create a large documentation hierarchy, install unnecessary packages, or implement application features.

Do not begin implementing remediation tasks during the initial assessment.

First produce the assessment, interactive artifact, and actionable milestone plan for review and approval.

Prioritize improvements by their value to autonomous reliability and their maintenance cost.

Clearly distinguish recommendations from verified working controls.

Once the plan is approved, implementation should occur in small, independently verifiable increments.

Maintain continuity with the existing artifact and milestone tracker throughout implementation.

Do not declare tasks complete without supporting verification evidence.

## Definition of Done

The initial assessment is complete when:

- The repository's current foundation has been evaluated against the relevant agentic engineering requirements.
- Findings are supported by evidence and appropriately prioritized.
- Missing foundational capabilities are distinguished from intentionally deferred capabilities.
- Strict-ratcheting requirements have been specified.
- A coherent, dependency-aware remediation roadmap exists.
- Every actionable finding maps to an executable task with acceptance criteria.
- A persistent, interactive Claude Artifact has been created and its actual capabilities verified, or documented platform limitations and an explicit fallback have been provided.
- The user can review, prioritize, and begin working through milestones without repeating the assessment.

The repository's **foundation implementation** is complete only when an autonomous development agent can understand the repository's purpose, locate authoritative guidance, make a bounded change, run appropriate verification, receive actionable feedback, and produce a reviewable result without compromising established engineering guarantees.

Do not optimize for the number of files, checks, documents, tasks, or tools created.

**Optimize for the probability that future autonomous changes will be correct, verifiable, and maintainable with minimal human intervention.**

The ultimate goal is not simply an AI-friendly repository. It is a self-improving engineering environment where autonomous agents can operate reliably, failures produce actionable feedback, and human oversight focuses increasingly on intent, architecture, and exceptions rather than routine implementation.