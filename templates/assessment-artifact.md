# Assessment Artifact contract

The primary deliverable of this assessment must be a **persistent, interactive Claude Artifact** that serves as the living assessment report and milestone roadmap.

The playbook does analysis and planning. The team implements the roadmap in its own workflow, with its own cadence and review process. The artifact shows the plan and the progress that reassessment observes in the repository. It does not track who works on what.

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

Break each milestone into independently implementable tasks, written as a handoff to whoever implements them.

Each task must include:

- Unique identifier.
- Parent milestone.
- Description and implementation objective.
- Priority.
- Dependencies.
- Linked findings, so that reassessment can tell when the task is addressed.
- Acceptance criteria that someone other than the implementer can check.
- Verification requirements.
- Whether a human decision is needed before anyone implements it.

Tasks must be granular enough to implement individually, in one focused session, without unnecessary ambiguity.

Avoid excessively fragmented tasks that create administrative overhead without improving verification or execution quality.

**4. Progress from reassessment**

Provide an interactive view of:

- Overall assessment status.
- Milestone progress: exit criteria judged met, unmet or unverified, with evidence.
- Tasks addressed (their findings resolved) and open, in dependency order.
- Deferred tasks and their triggers.
- Remaining high-priority findings.
- Whether the roadmap still matches what was approved.

Progress is never self-declared. A task is addressed when reassessment finds its linked findings resolved in the repository. A milestone is complete when reassessment judges every exit criterion met, citing evidence. Nobody marks a task done.

**5. Continuity across sessions**

Subsequent sessions must update the existing assessment and plan rather than generating disconnected reports. The cycle is: review the assessment and roadmap, implement in the team's own workflow, then reassess.

Maintain durable, machine-readable assessment and plan records associated with the assessed repository. During read-only assessment, prepare the records outside the target worktree. Place them at the approved repository path once the roadmap is approved. They must survive the loss of any particular session or Artifact instance.

The repository-backed record is the authoritative assessment and plan, with the artifact providing an interactive view of it.

**6. Evidence and staleness**

Every judgement carries evidence or a reason: criteria, findings, conventions, snapshots and exit criteria alike. A precise citation must point at a real file and line.

Make staleness visible and specific: which areas changed since the assessment, which deterministic probes regressed, and whether the plan changed since it was approved.

Do not mark a milestone complete until its defined exit criteria have been judged met.

**7. Artifact persistence and synchronization**

Use Claude Artifacts' supported persistent storage and interactive capabilities where available.

Determine whether the current Claude Code environment can directly create, publish, update, and synchronize the desired artifact.

Do not assume that Claude Code sessions, Claude Artifact storage, and repository files automatically share state.

If direct artifact creation, persistent storage, or synchronization is unavailable, explicitly identify the limitation and produce the closest supported interactive artifact alongside durable, machine-readable tracking data within the repository.

Never claim persistence or synchronization is functional unless verified.

### Required Artifact Experience

The desired experience is a single assessment workspace where the user can inspect findings, understand priorities, follow milestones, and see what remains.

The ongoing cycle should be:

**Assess → Plan → Approve → Implement in the team's own workflow → Reassess → Update Artifact → Repeat**

The artifact should evolve as issues are resolved and should make remaining work immediately apparent.

## Durable record and handoff

Use a versioned JSON record with assessment identity, assessed revision, revision of the record, and collections for criteria, findings, milestones, tasks and approvals. Give each item a stable ID. Link actionable findings to task IDs, tasks to milestones and prerequisite task IDs. Record observed, inferred, recommended, unknown, or deferred status with its evidence or reason, and judge milestone exit criteria the same way. Record approvals as attributed human decisions, with the roadmap approval bound to the plan it approved.

At session start, report what has gone stale since the assessment. Upon reassessment, update the same record and refresh the existing view. Use a read-only interactive view, and update the record through Claude Code. Provide the record location and refresh steps in the handoff.

Verify by reassessing after a change, reopening from another session, and checking the same IDs, dependencies, judgements and evidence. If native Artifact integration is unavailable, use an interactive report backed by the same record and document the refresh procedure and tested capabilities.
