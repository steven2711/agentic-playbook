# Assessment Artifact contract

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

Maintain durable, machine-readable assessment and task records associated with the assessed repository. During read-only assessment, prepare the records outside the target worktree or as an export for review. Place them at the approved repository path during implementation. Progress must survive the loss of any particular session or Artifact instance.

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

## Durable record and handoff

Use a versioned JSON record with assessment identity, assessed revision, revision of the tracking record, and collections for findings, milestones, tasks, and evidence. Give each item a stable ID. Link actionable findings to task IDs, tasks to milestones and prerequisite task IDs, and milestone exit criteria to verification evidence. Record observed, inferred, recommended, unknown, or deferred status with its evidence or reason. Include blocked reasons and explicit approvals where applicable. Record verifier, command or action, revision, result, and evidence location for completion.

At session start, load the current record and select a task whose dependencies are satisfied. Upon verification, update the same record and refresh the existing view. Keep work awaiting verification visible. If the view permits editing, synchronize edits back to the authoritative record through a supported mechanism and detect conflicting revisions. Otherwise use a read-only interactive view and update the record through Claude Code. Provide the record location and refresh or import steps in the handoff.

Verify by making a task transition, reopening from another session, and checking the same IDs, status, dependencies, and evidence. If native Artifact integration is unavailable, use an interactive report backed by the same export and document the refresh procedure and tested capabilities.
