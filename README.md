# Agentic Playbook

The Agentic Playbook gives a repository an **agentic readiness score** and a roadmap toward autonomous agentic engineering. It works on greenfield and established repositories alike. It ships as a Claude Code plugin backed by a small CLI.

- **Claude** does the judgment work: discovery, evidence and findings, implementation, and independent verification.
- **The CLI** does the deterministic work: probes, schema validation, scoring, guarded task states, and rendering.

## Install

Inside Claude Code:

```
/plugin marketplace add <owner>/<repo>
/plugin install agentic@agentic-playbook
```

On Claude Code 2.1.275 or later you can install in one step with `/plugin install agentic --marketplace <owner>/<repo>`.

To try it locally without installing, run `claude --plugin-dir /path/to/agentic-playbook`.

## The loop

**Assess → Plan → Adopt → Next → Verify → Status / Reassess**

| Command | What it does | Writes to the target repo? |
| --- | --- | --- |
| `/agentic:assess` | Detects whether the repo is greenfield or existing, runs read-only probes, and starts four auditor subagents in parallel: context, verification/architecture/security, evals, and workflows. Then it scores the repo and publishes the tracker. | No |
| `/agentic:conventions [app]` | Also runs at the end of assess. A `conventions-advisor` subagent compares each app (web, API, worker, and so on) with the sourced conventions baseline and marks each rule documented, followed, contradicted, absent or "promote to lint". It then asks which recommendations to adopt. | No |
| `/agentic:plan` | Turns findings into dependency-ordered milestones and tasks with acceptance criteria someone else can verify. Stops for your approval. | No |
| `/agentic:adopt` | Moves the approved record into `.agentic/record.json`. | Yes, after you confirm |
| `/agentic:next [task]` | Implements the next dependency-ready task. Self-repair is capped at 3 attempts, then the task hands off to verification. | Yes |
| `/agentic:verify <task>` | An independent verifier subagent checks every acceptance criterion and records evidence. The task completes only if all of them pass. Then the repo is rescored. | Evidence only |
| `/agentic:reassess` | Re-audits at the current HEAD. IDs stay stable, regressions and resolved findings are flagged, and the repo is rescored. | No |
| `/agentic:status` | Shows the score, level and work in flight, and republishes the tracker if it is stale. | No |

The tracker is a **Claude Artifact**. Every command that changes the record re-renders it and republishes it to the same URL.

A SessionStart hook runs in any repo that has a record. It warns when HEAD has moved past the assessed revision, or when the Artifact is behind the record. The Artifact cannot read your repository itself, so it is only as fresh as its last publish. The hook is how you notice when it isn't.

## The score

[rubric/rubric.yaml](rubric/rubric.yaml) turns the four standards into 47 criteria across six dimensions:

- Context
- Verification and CI
- Architecture and ratcheting
- Security
- Evals
- Workflows and maintenance

Each criterion quotes the standard it comes from.

**Score (0–100).** Each criterion is weighted by priority: P0 = 3, P1 = 2, P2 = 1. A criterion earns full credit when `passed`, half credit when `partial`, and nothing when `failed` or `unverified`. Criteria that are `n_a` (not applicable) or `deferred` (to a later stage, with a trigger) are left out entirely.

**Confidence.** The share of applicable weight that has actually been checked. It is reported separately, so a high score built on guesses is visible as such.

**Level (L0–L4).** Levels are gated, not averaged. You reach a level only when every applicable criterion gated at or below it has passed.

| Level | Name |
| --- | --- |
| L0 | Assisted |
| L1 | Supervised |
| L2 | Bounded autonomy |
| L3 | Reduced review |
| L4 | Autonomous maintenance |

**Stage awareness.** Greenfield repos defer criteria that need real functionality, such as coverage, janitors and eval metrics. Each deferred criterion has a trigger. Switching the mode to `existing` reactivates them.

The score is computed only by `agentic score`. Claude never writes it.

## Engineering conventions

Deterministic checks are cheap and reliable, but they cannot catch judgment rules. Examples are where business logic belongs, how errors propagate, when to use a fake rather than a mock, and how an API evolves. The playbook expects each app or layer to have a **scoped conventions file**, `.claude/rules/<app>.md` with `paths:` frontmatter or a nested `CLAUDE.md`. That file holds only those judgment rules, each with a rationale and an example. Two criteria score it:

- **`CTX-12`:** the conventions files exist, are scoped, and contain only judgment rules.
- **`VER-09`:** changes are reviewed against the conventions, and recurring violations are promoted into lint rules.

**Recommendations come from a sourced baseline.** [reference/conventions/](reference/conventions/README.md) holds 69 rules across these domains:

- cross-cutting
- languages
- testing
- frontend
- backend/API
- data
- operations
- security

The rules come from practice published by Google, Amazon, Microsoft and Meta, and from OWASP, W3C and IETF standards:

- Google's engineering practices, AIPs, style guides, SRE books and *Software Engineering at Google*
- the Amazon Builders' Library
- Microsoft's architecture guides
- the React docs (Meta)
- OWASP, W3C and IETF standards

Every rule links its public source, and none claims knowledge of a company's internal practice. The CLI rejects any recommendation that does not reference a library rule. Each library file carries a `reviewed` date, and `lint-playbook` warns when one is more than 12 months old.

**Nothing is imposed.** Recommendations stay `proposed` until you accept them. `/agentic:plan` then creates a "Draft conventions for <app>" task (requires approval) and "Promote <rule> to <tool>" tasks. `/agentic:next` reads the conventions before it edits, and the independent verifier reviews the diff against them.

## Guarantees the CLI enforces

- **Assessment is read-only.** The record is staged in `~/.agentic-playbook/<repo>-<hash>/` until `/agentic:adopt`.
- **Every write is validated.** All writes go through `agentic apply`, `agentic task` or `agentic evidence`. An invalid record is never written. That includes dangling links, dependency cycles, a passed criterion without evidence, and a deferral without a trigger.
- **Task state changes are guarded:**
  - Dependencies must be complete before a task starts.
  - Approval-flagged tasks need a recorded `human:` approval.
  - A task can complete only with passing evidence from a verifier other than its implementer, covering every acceptance criterion.
- **Milestone status is derived, never set.** A milestone completes only when all its tasks are complete and every exit criterion has passing evidence.

## CLI

The plugin puts `agentic` on PATH for Claude's Bash tool, through `bin/`. You can also run it yourself with `node cli/dist/agentic.mjs help`.

```
agentic init | scan [--github] | apply <patch> | task <id> <status> | evidence ... | next
agentic score | status [--brief] | render | published --url | validate | adopt | where | show <id>
agentic conventions [--app <root>] [--json]
agentic lint-playbook
```

The patch format is documented in [reference/patch-format.md](reference/patch-format.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `assessments/`, `standards/`, `templates/` | The playbook prose. This is authoritative, and the commands link to it rather than copying it. |
| `rubric/rubric.yaml`, `schema/record.schema.json` | Scoring criteria and the record contract. |
| `skills/` | The `/agentic:*` commands. |
| `agents/` | The auditor and verifier subagents. |
| `hooks/` | The SessionStart staleness check. |
| `reference/` | Operating rules, the patch format, and the conventions baseline library (`reference/conventions/`). |
| `cli/` | The TypeScript source, tests, and the committed `dist/agentic.mjs` bundle. |
| `archive/` | The original prompts. The [migration map](archive/migration.md) records where each one went. |

## Developing

```
cd cli && npm install
npm run check
```

`npm run check` runs typecheck, tests, the build, and `agentic lint-playbook`.

`lint-playbook` keeps the playbook's own documentation from drifting. It fails when:

- a standard no longer contains a rubric quote
- a standard section has no criterion
- a probe name is unknown
- a link is broken
- a conventions library rule has no https source, has no `enforceable` field, or uses an unknown stack signal

CI also fails if `cli/dist` is out of date with the source. Rebuild and commit it after changing anything in `cli/src`.

If you change a standard, update the matching criterion's `quote` in the rubric in the same change.
