# Agentic Playbook

The Agentic Playbook gives a repository an **agentic readiness score** and a roadmap toward autonomous agentic engineering. It works on greenfield and established repositories alike. It ships as a Claude Code plugin backed by a small CLI.

- **Claude** does the judgment work: discovery, evidence and findings, and the remediation plan.
- **The CLI** does the deterministic work: probes, schema and citation validation, scoring, staleness, and rendering.

**It analyses and plans. It does not implement.** Every team has its own cadence, review process and flow, so the roadmap is a handoff: tasks with acceptance criteria someone else can check, in dependency order. You implement them however you work, then `/agentic:reassess` records the progress it can observe in the repository.

## Install

The playbook isn't published yet. You install it from a local clone.

Inside Claude Code, add the clone as a local marketplace and install the plugin from it:

```
/plugin marketplace add /path/to/agentic-playbook
/plugin install agentic@agentic-playbook
```

To try it for one session without installing, run `claude --plugin-dir /path/to/agentic-playbook`.

The plugin runs the committed `cli/dist/agentic.mjs` bundle, so you need Node.js but no build step. If you change the CLI source, rebuild it with `npm run check` (see [Developing](#developing)), then run `/plugin marketplace update agentic-playbook` to pick up the change.

## The loop

**Assess → Plan → Approve → Adopt → (implement in your own workflow) → Reassess / Status**

| Command | What it does | Writes to the target repo? |
| --- | --- | --- |
| `/agentic:assess` | Detects whether the repo is greenfield or existing, runs read-only probes, and starts four auditor subagents in parallel: context, verification/architecture/security, evals, and workflows. Then it scores the repo and publishes the tracker. | No |
| `/agentic:conventions [app]` | Also runs at the end of assess. A `conventions-advisor` subagent compares each app (web, API, worker, and so on) with the sourced conventions baseline and marks each rule documented, followed, contradicted, absent or "promote to lint". It then asks which recommendations to adopt. | No |
| `/agentic:testing [app]` | Also runs inside assess. A `test-strategy-auditor` subagent assesses each app's testing against the sourced testing profiles: its stated strategy, the test layers it has against those its kind needs, a map of critical paths and the tests that cover them, coverage on changed code, and a sample of test quality. Gaps become findings. | No |
| `/agentic:docs [app]` | Also runs inside assess, as part of the `context-auditor`. Inventories the documentation and agent guidance, measures what loads into every session, follows links from CLAUDE.md, and proposes a target layout against the sourced documentation library: which documents should exist, where, and with what authority. Gaps become findings. | No |
| `/agentic:maintenance` | Also runs inside assess, as part of the `workflow-auditor`. Proposes the janitors that keep the repository from drifting once it is fixed (a pull-request documentation check, context, architecture and flaky-test janitors, dependency updates, scheduled gardening), each guarding an accepted contract and waiting for its prerequisites. | No |
| `/agentic:plan` | Turns findings into dependency-ordered milestones and tasks with acceptance criteria someone else can check. Stops for your approval, which is bound to that exact plan. | No |
| `/agentic:adopt` | Moves the approved record into `.agentic/record.json`. | Yes, after you confirm |
| `/agentic:reassess` | Re-audits what changed since the assessment (chosen from `agentic changes`). IDs stay stable. It flags regressions, resolves fixed findings (which marks their tasks addressed), judges milestone exit criteria, and rescores. | No |
| `/agentic:status` | Shows the score, level, roadmap progress and what has gone stale, and republishes the tracker if it is behind. | No |

The tracker is a **Claude Artifact**. Every command that changes the record re-renders it and republishes it to the same URL.

Two hooks ship with the plugin:

- **SessionStart**, in any repo that has a record. It warns when the repository moved past the assessment (naming the areas that changed), when the roadmap changed since it was approved, when a janitor's prerequisites regressed, or when the Artifact is behind the record. The Artifact cannot read your repository itself, so it is only as fresh as its last publish. The hook is how you notice when it isn't.
- **PreToolUse**, on `Edit`, `Write` and `NotebookEdit`. While an assessment holds an `agentic readonly` window on a repository, it refuses Claude's file writes inside it. Elsewhere, and with no window open, it exits immediately.

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

**Nothing is imposed.** Recommendations stay `proposed` until you accept them. `/agentic:plan` then creates a "Draft conventions for <app>" task (needs a human decision) and "Promote <rule> to <tool>" tasks, and gives every code-changing task in that app an acceptance criterion that the diff conforms to the conventions.

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

`/agentic:reassess` compares suppression counts with the last assessment and reports growth per app and kind as a regression.

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

- "Write test strategy for <app>" (needs a human decision)
- "Cover <path> with a <layer> test". Its acceptance criteria require proof that the test fails when that behaviour breaks.
- "Add the <layer> layer for <app>"

## Documentation architecture

The `context-auditor` already judges the CTX criteria. It also proposes a **target layout**: which documents the repository and each app should have, where each lives, how agents load it, and what authority it carries. It compares the repository with [reference/docs/](reference/docs/README.md), a sourced library in six areas:

- the agent entry point
- product requirements
- architecture and decisions
- interfaces
- operations
- per-app docs

The library uses the same three tiers as strictness and testing:

- **Tier 1, always:** a concise root CLAUDE.md and a README with setup. In a multi-app repository, also scoped conventions and a README for each app.
- **Tier 2, when the repository needs it:** for example ADRs and an architecture overview once there are several apps, an API contract once there are outside consumers, or runbooks once there are alerts.
- **Tier 3, only after a recurring problem:** for example diagrams as code, generated API reference, or a documentation-gardening job.

Sources include the Claude Code docs, Google's documentation guide and *Software Engineering at Google*, Nygard's ADRs, the C4 model, the Google SRE books, OpenAPI, AsyncAPI and Write the Docs. Each file lists practices that are **not recommended**, such as a monolithic CLAUDE.md, lint rules restated in docs, or an unrequested AGENTS.md mirror.

| | Deterministic (`agentic docs`) | Judged (`context-auditor`) |
| --- | --- | --- |
| **Inventory** | Documentation files | Purpose, audience, authority, owner and a disposition for each |
| **Loading** | Lines loaded into every session, and instruction lines repeated across guidance files | Whether everything loaded globally applies everywhere |
| **Navigation** | Broken relative links | Routes from CLAUDE.md to requirements, decisions, boundaries and commands |
| **Target layout** | Library items present or absent, per repository and per app | Status (present, absent, misplaced) and action (create, relocate, consolidate, archive) for each item |

The result is stored in the record's `docs` snapshot and shown in the tracker's **Docs** tab. It adds no rubric criteria; CTX-01 to CTX-12 score it. `/agentic:plan` starts with "Adopt documentation layout" (requires approval), then groups the moves and creations into tasks whose acceptance criteria check links, presence, navigation and the always-loaded line count.

## Maintenance agents (janitors)

The rubric's top level, L4 (autonomous maintenance), means the repository detects and corrects its own drift. The `workflow-auditor` judges WF-06 to WF-09 and also proposes a **roster**: which janitors to run, when each should start, and what each may change on its own. It compares the repository with [reference/maintenance/](reference/maintenance/README.md).

**A janitor guards a contract, so it comes last.** It can only detect drift from something written down: the documentation layout, the accepted conventions, the boundary rules. Each janitor names what it guards and the criteria that must pass before it is set up. An architecture janitor waits for enforced boundary rules (ARC-01, ARC-04); a scheduled gardener waits for the pull-request check.

- **Tier 1, at L4:** a documentation check on every pull request, and agent failures (blocked work, failed CI, reverts) becoming a document, test or rule.
- **Tier 2, when the repository needs it:** a context janitor, an architecture janitor, a flaky-test janitor, dependency updates (Renovate or Dependabot, no agent needed), and scheduled documentation gardening.
- **Tier 3, only after a recurring problem:** a knowledge-gap miner and a dead code janitor.

A prerequisite counts only when it has `passed`; `n_a` does not, because the contract does not exist. Three janitors have autofixes that could weaken what they guard: flaky-test quarantine, dependency auto-merge and dead-code removal. The library marks these `autofix_risk: high` and lists their safeguards, and the plan turns each safeguard into an acceptance criterion.

Each janitor runs deterministic detectors first (`agentic docs`, the boundary check, CI history) and reasons only about what they find. Each states what it may fix alone, what always needs a human, its noise limits and its success measure. **Not recommended:** refactoring for style, auto-merge without a deterministic gate, scheduling before a pull-request check, privileged credentials on untrusted pull requests, a custom orchestration framework, and rewriting documents because they are old. Sources include the Claude Code docs (GitHub Actions, headless mode, scheduled tasks), *Software Engineering at Google*, the Google SRE book, Google's testing blog, Renovate and GitHub Security Lab.

`agentic maintenance` lists the janitors already set up, their prerequisites' status in the record, and where a janitor could run here (GitHub Actions, another CI, Claude Code skills or hooks). The roster is stored in the record's `maintenance` snapshot and shown in the tracker's **Maintenance** tab, grouped as running, ready to set up, waiting on prerequisites, and not yet. `/agentic:plan` puts one "Set up <janitor>" task per janitor (needs a human decision) in a final "Autonomous maintenance" milestone that depends on the work closing its prerequisites, seeded from [templates/janitor-skill.md](templates/janitor-skill.md). `/agentic:reassess` flags a janitor that disappeared, or one still running whose prerequisites no longer pass. It adds no rubric criteria.

## What the CLI enforces

The full picture, including what it cannot prevent, is in [reference/trust-model.md](reference/trust-model.md).

- **Assessment is read-only, enforced.** `agentic readonly begin` fingerprints the worktree. The hook refuses Claude's file-tool writes while the window is open, and `agentic readonly end` fails, listing each change, if any tracked or non-ignored file, HEAD or the branch moved, including through shell writes. Gitignored paths are not covered. The record is staged in `~/.agentic-playbook/<repo>-<hash>/` until `/agentic:adopt`.
- **Every write is validated.** All content goes through `agentic apply`, and an invalid record is never written. That covers dangling links, dependency cycles, a passed criterion without evidence, a deferral without a trigger, and a task depending on a milestone its milestone does not depend on.
- **Evidence is checked.** A cited `path:line` must exist in the worktree. A criterion marked passed while its deterministic probe failed must say why.
- **Approvals are attributed, not injected.** Only `agentic approve --by human:<name>` writes one, never a patch. A roadmap approval is bound to the plan it approved, and a later change to the plan is flagged until it is re-approved. The CLI cannot authenticate who ran it, so treat it as a record of a decision, not as authorization.
- **Progress is observed, not declared.** Tasks carry no status. A task is addressed when reassessment resolves its findings. A milestone is complete when reassessment judges every exit criterion met, with evidence. Older records migrate automatically: execution state is dropped, the original is backed up, and earlier verification evidence is quoted for reassessment rather than trusted.
- **Staleness is specific.** `agentic changes` and `agentic status` say which dimensions and snapshots the changes since the assessment affect, and which probes regressed.
- **Janitors wait for their contract.** A roster that recommends a janitor `now` before its prerequisites have passed is refused.

## CLI

The plugin puts `agentic` on PATH for Claude's Bash tool, through `bin/`. You can also run it yourself with `node cli/dist/agentic.mjs help`.

```
agentic init | scan [--github] | apply <patch> | approve <subject> --by human:<name>
agentic readonly begin | end | check --path <file>
agentic roadmap | changes | score | status [--brief] | render | published --url | validate | adopt | where | show <id>
agentic conventions [--app <root>] [--json]
agentic strictness [--app <root>] [--json]
agentic tests [--app <root>] [--json]
agentic docs [--app <root>] [--json]
agentic maintenance [--json]
agentic lint-playbook
```

The patch format is documented in [reference/patch-format.md](reference/patch-format.md).

## Repository layout

| Path | Contents |
| --- | --- |
| `assessments/`, `standards/`, `templates/` | The playbook prose. This is authoritative, and the commands link to it rather than copying it. |
| `rubric/rubric.yaml`, `schema/record.schema.json` | Scoring criteria and the record contract. |
| `skills/` | The `/agentic:*` commands. |
| `agents/` | The auditor subagents. |
| `hooks/` | The SessionStart staleness check and the PreToolUse read-only guard. |
| `reference/` | Operating rules, the [trust model](reference/trust-model.md), the patch format, and the conventions baseline library (`reference/conventions/`), the strictness profiles (`reference/strictness/`), the testing profiles (`reference/testing/`), the documentation library (`reference/docs/`), and the maintenance library (`reference/maintenance/`). |
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
- a documentation item has the same problems, an invalid `scope`, `load` or `authority`, or refers to a criterion that is not in the rubric
- a janitor has the same problems, has no `autofix_risk`, or has a high-risk autofix without `safeguards`

CI also fails if `cli/dist` is out of date with the source. Rebuild and commit it after changing anything in `cli/src`.

If you change a standard, update the matching criterion's `quote` in the rubric in the same change.
