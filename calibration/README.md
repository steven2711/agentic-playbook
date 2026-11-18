# Calibration

These scenarios test whether the playbook's assessments and roadmaps are **accurate, proportionate and actionable** across different kinds of repository. They cover two layers, checked separately:

| Layer | What it checks | How |
| --- | --- | --- |
| Deterministic | What the CLI alone detects: probes, app scopes, profiles, stage defaults | `cli/test/calibration.test.ts`. Runs in `npm run check`. |
| Agent judgement | What a real `/agentic:assess` + `/agentic:plan` run concludes and plans | `calibration/run-agent.sh`, then `cli/test/calibration-record.test.ts`. Run on demand. |

Passing CLI tests prove detector behaviour only. They do not show that the auditors judge well. Only the agent layer gives evidence about judgement, and only as far as the number of runs allows.

## Scenarios

Each scenario lives in `scenarios/<name>/`:
- `repo/`: a small, realistic repository
- `overlays/<variant>/`: optional extra files layered on top
- `expect.yaml`: the ground truth, **written before the baseline was measured**

| Scenario | What it represents | What it checks |
| --- | --- | --- |
| `greenfield` | A `create-next-app` scaffold, 3 commits | Foundational gaps are flagged. Product requirements and architecture are not invented. Stage-dependent work stays deferred. No janitors, no enterprise infrastructure. |
| `established` | An Express/Postgres API with tests, CI, docs and CODEOWNERS, 45 commits | 5 seeded gaps are detected (a missing documented script, no typecheck in CI, an untested refund path, a committed `.env`, no evals). The working safeguards are recognised, and nothing recommends recreating them. |
| `established` + `eval-*` | The same API at four levels of eval maturity | `eval-none`, `eval-cases-no-runs`, `eval-observed` (repeated runs, model, outcome, interventions) and `eval-hollow` (vague prompts and an unsupported "100% passing" claim) get distinguishable EVAL judgements. |
| `multi-app` | A pnpm/turbo workspace: a Next.js UI, a FastAPI service and a shared TS package | Scopes and app kinds are right, with no API-layer testing for the UI. The Python stack gets Python guidance. Guidance is not duplicated across apps. |
| `mature` | A strong service using unfamiliar but valid tooling: Biome, Justfile, Buildkite, `AGENTS.md`, `doc/`, renovate, gitleaks pre-commit, `* @team` CODEOWNERS, evals | Its practices are recognised. The plan is small. "No significant remediation" is an acceptable outcome. |

### `expect.yaml`

```yaml
commits: 45               # history depth; drives greenfield/existing detection
mode: existing
apps: [{ root: ".", kinds: [api-service], notKinds: [web-frontend] }]
seeded:                   # deficiencies that must be found
  - id: E-S1
    what: ...
    detect: { probe: claude_md_commands, status: [partial, failed] }   # deterministic layer
    judge:  { criteria: [CTX-02], status: [partial, failed], path: CLAUDE.md }  # agent layer: status and a finding citing the path
safeguards:               # existing practices that must not be reported missing
  - { id: E-G1, probe: canonical_commands, notStatus: [failed], judge: { criteria: [VER-01] } }
stage: { deferred: [...], notFailedJudge: [CTX-05] }
forbidden:                # recommendations that would be bloat here, with the reason
  - { pattern: "storybook|playwright", reason: "No UI" }
plan: { maxTasks: 12, noJanitorTasks: true }   # an upper sanity bound, never a target
variants: { eval-hollow: { judge: [...] } }
```

## How quality is measured

There is no composite score. Each quality is reported on its own.

| Quality | Deterministic layer | Agent layer (record grader) |
| --- | --- | --- |
| Detection accuracy | Each `seeded.detect` probe or critical-path check | Each `seeded.judge`: the criterion status, plus a finding that cites the seeded path |
| Recommendation precision | — | `forbidden` hits in task text and open findings; tasks not tied to a finding |
| Evidence quality | — | Share of open findings with `path:line` evidence. `agentic apply` already rejects citations that don't exist. |
| Stage appropriateness | Stage defaults after `init` | Deferred criteria stay deferred; `notFailedJudge`; no janitor tasks where `noJanitorTasks` |
| Proportionality | — | Task count against `maxTasks`; two tasks addressing exactly the same findings |
| Consistency | Deterministic by construction | Criterion-status agreement across repeated runs of one scenario |

Two qualities need human or model judgement. They are reviewed by reading the run's final report and record against these anchors:

| Quality | Pass | Borderline | Fail |
| --- | --- | --- | --- |
| Actionable acceptance criteria | Each criterion names an observable result that someone else can check (a command, a file, a failing fixture) | Checkable but vague ("tests are improved") | Restates the task, or cannot be checked |
| Priority matches consequence | The highest-consequence gaps (secrets, money movement, missing CI gate) come first | Right gaps, wrong order inside a milestone | A low-consequence item (docs layout, janitors) comes before a high-consequence gap |

## Running it

```bash
# Deterministic layer (also part of npm run check)
cd cli && npx vitest run calibration

# Agent layer: one end-to-end run (stock Claude Code, headless), then grade the record
calibration/run-agent.sh established /tmp/cal/established-1
calibration/run-agent.sh established eval-hollow /tmp/cal/hollow-1
cd cli && CALIBRATION_SCENARIO=established CALIBRATION_RECORD=/tmp/cal/established-1/record.json npx vitest run calibration-record
# Pass several comma-separated records to see agreement across runs; CALIBRATION_VARIANT=eval-hollow grades a variant.
```

`run-agent.sh` runs `/agentic:assess` and then `/agentic:plan` with `claude -p`, loading this checkout through `--plugin-dir`. Bash is limited to read-only commands and the `agentic` CLI, and the staging home is kept inside the work directory. It also records `git status` of the scenario repo afterwards: the assessment must leave it unchanged.

I used `claude -p` instead of `claude plugin eval` because:
- The playbook's skills are user-invoked only (`disable-model-invocation`).
- Assess and plan are two separate turns.

A single-prompt eval case fits neither.

## Design basis

These are the ideas from the published guidance that the method relies on. Nothing else was imported.

- **Small suites, built from real failures, with negative controls.**
  - Start with a small set of cases drawn from real failures ("20-50 simple tasks drawn from real failures is a great start"), and test both should and should-not cases, because "one-sided evals create one-sided optimization". Source: Anthropic, [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
  - OpenAI suggests "a small set of 10–20 prompts" and negative controls. Source: [Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills/).
  - Here, `safeguards` and `forbidden` are the negative controls.
- **Grade the outcome, deterministically where possible.**
  - "It's often better to grade what the agent produced, not the path it took." Code-based graders are reproducible, and model-based graders need calibration against human judgement. Source: Anthropic, *Demystifying evals*.
  - OpenAI keeps checks "small and focused on must-pass checks". Source: OpenAI, *Testing Agent Skills*.
  - Here, the record grader grades the produced record, and the review rubric covers only what can't be graded mechanically.
- **Repeated trials, because a single run is not a measurement.**
  - Anthropic contrasts pass@k with pass^k, and says to use pass^k where consistency matters. Source: Anthropic, *Demystifying evals*.
  - Here, consistency is criterion agreement across repeated runs, and the report states how few runs it rests on.
- **Clean, isolated starting state for every trial.** Source: Anthropic, *Demystifying evals*. Here, `scaffold.sh` builds a fresh repository for every run.
- **Add complexity only when it demonstrably improves outcomes.**
  - "adding complexity *only* when it demonstrably improves outcomes". Source: Anthropic, [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents).
  - Here, every playbook change in Phase 2 must trace to a calibration failure.
- **The smallest set of high-signal context.**
  - Context is "a finite resource with diminishing marginal returns", and bloated tool sets are "one of the most common failure modes". Source: Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
  - This is why the playbook should not demand documents a repository doesn't need.
- **A short entry file as a map, with mechanical checks.**
  - OpenAI's harness-engineering post reportedly found that one large AGENTS.md failed. A short map pointing into structured docs worked, with linters and CI keeping it current.
  - Secondary summaries also note that the heavier machinery (doc-gardening agents, background quality grading) pays off at scale, not in small single-domain repositories.
  - The primary page ([openai.com/index/harness-engineering](https://openai.com/index/harness-engineering/)) refused automated fetches. These two points come from secondary summaries and are not verified against the source.

## Results

See [results/](results/). Each file records what a run actually showed:
- [baseline-deterministic.txt](results/baseline-deterministic.txt): CLI detection before the fixes
- [baseline-agent.md](results/baseline-agent.md): agent runs before the fixes, and the plan failures traced to their source
- [post-fix-agent.md](results/post-fix-agent.md): agent runs after the fixes

## Known fixture limits

- The lockfiles list direct dependencies only. They are plausible enough that an agent doesn't report `npm ci` as broken, but they would not install.
- Commit history is empty commits. It sets greenfield or existing mode and nothing else, so there is no real history for an agent to sample (EVAL-02).
