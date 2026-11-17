# Trust model

The Agentic Playbook does **analysis and planning**. It assesses a repository, scores it, and produces a remediation roadmap. Implementation belongs to the team's own workflow, cadence and review process. The playbook does not run tasks, verify them, or track who works on what.

So the trust question is narrower than for an execution system. It is: **can a reader rely on what the record says about the repository and the plan?** This page states what is established deterministically, what is an agent's judgement, what is a human's attributed decision, and what nothing here can prevent.

## Boundaries

| Layer | Who produces it | How far to trust it |
| --- | --- | --- |
| Deterministic facts | The CLI: `scan` probes, `strictness`, `tests`, `docs`, `maintenance` detection, `changes`, worktree fingerprints, citation checks | Reproducible from the repository. They are hints with evidence, not verdicts: a probe can miss a check that lives somewhere it does not look. |
| Agent judgements | Auditor subagents, through `agentic apply`: criterion statuses, findings, conventions, testing, docs and maintenance snapshots, exit-criterion judgements | Agent-reported. The CLI checks their form: precise citations exist, a pass against a failing probe gives a reason, references resolve, and the plan is coherent. It cannot check that the judgement is right. |
| Human decisions | `agentic approve` (roadmap approval, other decisions), and convention `decision: accepted` | **Attributed, not authenticated.** The CLI records `human:<name>` as stated in the session, and cannot tell whether a person or an agent typed the command. |
| Implementation, review and merge | The team's own workflow | Out of scope. Authorization for the work itself lives in the team's review process and repository protections. |

## What is enforced

| Protection | Class | Mechanism |
| --- | --- | --- |
| Every write is validated: schema, references, dependency cycles, evidence or reason per status | Mechanical | `saveRecord` refuses to write an invalid record. |
| Precise citations (`path:line`, `path:a-b`) in written evidence exist in the worktree | Mechanical | `agentic apply` (`cli/src/citations.ts`). Absence claims and bare names are not checked. |
| A criterion marked `passed` while its deterministic probe failed carries a stated reason in `notes` | Mechanical | `agentic apply`, against `scan.json`. Skipped, with a warning, when there is no scan. |
| Approvals cannot be written, changed or removed through a patch | Mechanical | `agentic apply` rejects `approvals`. Only `agentic approve --by human:<name>` writes one. |
| A roadmap approval covers only the plan it approved | Mechanical (detection) | The approval stores a hash of the milestones and tasks. `status`, the session hook and the tracker report a plan changed since approval. Reassessment judgements do not change the hash. |
| A janitor is not recommended `now` before its prerequisites pass. `n_a` does not count as passed. | Mechanical (at roster write) | `agentic apply` rejects the roster. A prerequisite that regresses later is reported by `status`, and never locks the record. |
| A high-risk janitor autofix (test quarantine, dependency auto-merge, dead-code removal) lists its safeguards | Mechanical (library) | `lint-playbook`. The safeguards become acceptance criteria when the janitor is planned. |
| The plan is coherent: a task depends only on tasks in its own milestone or in an upstream one | Mechanical | `saveRecord` validation. A next-level blocker with no planned task produces a warning. |
| Assessment does not modify the repository: file-tool writes | Harness-enforced | The plugin's PreToolUse hook refuses `Edit`, `Write` and `NotebookEdit` inside a repository with an open `agentic readonly` window, including `.git/` and `.agentic/` (the record is written only by the CLI). |
| Assessment does not modify the repository: everything else | Mechanical (detection) | `agentic readonly end` compares a worktree fingerprint and fails, listing each change. The fingerprint covers HEAD, the branch, the content of every tracked or untracked non-ignored path that differs from HEAD (a nested repository by its HEAD and status), and `.git/info/exclude`. Shell writes are detected, not prevented. Writes to gitignored paths are not seen. |
| Staleness is specific | Mechanical | `agentic changes` and `status` map changed paths to the dimensions and snapshots they affect, and re-run the probes to report regressions. |
| Progress is not self-declared | Mechanical | Tasks have no status. A task is addressed only when reassessment resolves its findings, and a milestone completes only when every exit criterion is judged `met` with evidence given in that same judgement. Rewording an exit criterion clears its judgement. |
| Migrated v1 progress is not trusted | Mechanical | v1 verification evidence was agent-reported and unchecked. Migration quotes it on the exit criteria it covered and marks them `unverified`, for the next reassessment to judge. The original record is kept as `record.v1-backup.json`. |
| Reassessment judges every changed area | Advisory | `/agentic:reassess` chooses auditors from `agentic changes`. Whether each auditor judges well is not checkable. |

## Cooperative mistakes versus adversarial agents

The mechanisms above stop **cooperative** mistakes reliably: a citation from memory, a stale probe ignored, an approval written by a patch, a janitor recommended too early, an accidental write during assessment.

They do not stop an agent that sets out to defeat them. With shell access it can:

- **Edit `record.json` directly**, bypassing the CLI. The next CLI write validates the whole record, but a well-formed forgery passes. Only review catches this: commit `.agentic/` and give it a CODEOWNERS entry so changes to the record are reviewed like code.
- **Write with shell commands during an assessment.** `readonly end` detects the change, but the hook cannot prevent it. A write to a gitignored path is not detected at all.
- **Edit git metadata through the shell**, for example a hook or the index. The fingerprint covers `.git/info/exclude`, HEAD and the branch, not the rest of `.git/`.
- **Run `agentic approve --by human:<name>` itself.** Approvals are attribution. Do not treat one as authorization for anything outside the playbook.
- **Delete or edit the lock file** in the staging directory to close the window early. `readonly end` then reports no open window, and that refusal is itself the signal.

## Integration boundary

The playbook produces a plan. It does not gate implementation, CI, merges or janitor runs, and it does not change branch protection, secrets or repository settings. When a plan calls for those, the tasks say so (`requiresApproval: true`), and the team carries them out through its own process. A janitor set up from [templates/janitor-skill.md](../templates/janitor-skill.md) re-checks its preconditions with the repository's own commands. Any enforcement it needs, such as required status checks for auto-merge, lives in the repository and its hosting platform, not in this playbook.
