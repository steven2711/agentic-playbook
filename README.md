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
| `/agentic:testing [app]` | Also runs inside assess. A `test-strategy-auditor` subagent assesses each app's testing against the sourced testing profiles: its stated strategy, the test layers it has against those its kind needs, a map of critical paths and the tests that cover them, coverage on changed code, and a sample of test quality. Gaps become findings. | No |
| `/agentic:plan` | Turns findings into dependency-ordered milestones and tasks with acceptance criteria someone else can verify. Stops for your approval. | No |
| `/agentic:adopt` | Moves the approved record into `.agentic/record.json`. | Yes, after you confirm |
| `/agentic:next [task]` | Implements the next dependency-ready task. Self-repair is capped at 3 attempts, then the task hands off to verification. | Yes |
| `/agentic:verify <task>` | An independent verifier subagent checks every acceptance criterion and records evidence. The task completes only if all of them pass. Then the repo is rescored. | Evidence only |
| `/agentic:reassess` | Re-audits at the current HEAD. IDs stay stable, regressions and resolved findings are flagged, and the repo is rescored. | No |
| `/agentic:status` | Shows the score, level and work in flight, and republishes the tracker if it is stale. | No |

The tracker is a **Claude Artifact**. Every command that changes the record re-renders it and republishes it to the same URL.

A SessionStart hook runs in any repo that has a record. It warns when HEAD has moved past the assessed revision, or when the Artifact is behind the record. The Artifact cannot read your repository itself, so it is only as fresh as its last publish. The hook is how you notice when it isn't.

## The score

[rubric/rubric.yaml](rubric/rubric.yaml) turns the four standards into 51 criteria across six dimensions:

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

## Strictness and ratcheting

The checks that stop agent mistakes are mostly strictness settings: strict type checking, type-aware lint, and test runners that reject focused or skipped tests. Whether a lint step exists says little on its own. [reference/strictness/](reference/strictness/README.md) lists these checks per stack in three cost tiers:

- **Tier 1, always:** cheap and rarely wrong. Rubric `VER-10` (P0, gate L2) requires these.
- **Tier 2, when the repository needs it:** for example dead-code detection once there are more than about 50 source files.
- **Tier 3, only after a recurring defect:** for example mutation testing on changed code.

Each profile also lists practices that are **not recommended** because they cost more than they catch. Examples are a 100% coverage mandate, mutation testing on every PR, and custom ratchet scripts where a tool already has a baseline.

The ratchet is kept simple:

- **New rules start at zero.**
- **Legacy violations go into the tool's own baseline** (ESLint bulk suppressions, Betterer, basedpyright, golangci-lint `new-from-merge-base`).
- **Inline suppressions need a reason and cannot grow unreviewed** (rubric `ARC-08`).

`agentic strictness` shows, per app, which checks are on and how many `eslint-disable`, `@ts-ignore`, `noqa`, `nolint` and skipped tests exist.

During execution:

- **Implementer:** `/agentic:next` may not make a check pass by weakening it.
- **Verifier:** the independent verifier inspects each diff for new suppressions, skipped tests and relaxed configuration.

## Testing per app

Whether tests exist and run in CI says little about whether the code that must not break is tested. The playbook assesses each app's testing on its own, against [reference/testing/](reference/testing/README.md). This library holds profiles per app kind (web front end, API service, worker, CLI, data pipeline, library), and each profile lists:

- the test layers that kind needs, in the same three tiers as strictness
- what belongs in each layer
- hints for finding critical code
- practices that are not recommended

Sources include *Software Engineering at Google*, the Google Testing Blog, Martin Fowler, Microsoft Learn, the Amazon Builders' Library, and the Pact, Testing Library and Playwright documentation.

| | Deterministic (`agentic tests`) | Judged (`test-strategy-auditor`) |
| --- | --- | --- |
| **Strategy** | | Is there a stated approach, for example `## Testing` in the app's conventions file? Does the layer mix fit the kind? (`VER-11`) |
| **Scope** | App kind, runners, layers present or absent, test and source counts, directories with code and no tests | Each layer is confirmed by opening real tests |
| **Critical paths** | Candidate files (auth, money, data writes, routes, jobs, migrations) and which tests mention them | The map: each path's covering test and layer, or uncovered or at the wrong layer (`VER-12`, P0) |
| **Coverage** | Coverage config and CI steps | Measured on changed code? Enforced per app? Never a global target |
| **Quality** | | At least 8 tests per layer sampled against TST-01 to TST-06. A finding needs at least 3 occurrences. |

The judged result is stored per app in the record's `testing` snapshot and shown in the tracker's **Testing** tab. `/agentic:plan` turns gaps into tasks:

- "Write test strategy for <app>" (requires approval)
- "Cover <path> with a <layer> test". The verifier proves it fails when that behaviour breaks.
- "Add the <layer> layer for <app>"

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
agentic strictness [--app <root>] [--json]
agentic tests [--app <root>] [--json]
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
| `reference/` | Operating rules, the patch format, and the conventions baseline library (`reference/conventions/`), the strictness profiles (`reference/strictness/`), and the testing profiles (`reference/testing/`). |
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
- a strictness check has no https source, an invalid tier, a Tier 2 or 3 check without a `when`, or a detect pattern that is not a valid regex
- a testing layer has the same problems, or refers to a TST rule that is not in the conventions library

CI also fails if `cli/dist` is out of date with the source. Rebuild and commit it after changing anything in `cli/src`.

If you change a standard, update the matching criterion's `quote` in the rubric in the same change.
