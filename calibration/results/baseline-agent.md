# Agent baseline (before Phase 2 changes)

**Date:** 2026-11-17
**Plugin:** HEAD `dfd5988`, run from a frozen copy.
**Harness:** `calibration/run-agent.sh` (`claude -p`, Claude Code 2.1.326, Opus 5.5)

There is **one run per scenario**. The 5-hour usage window allowed no repeats, so run-to-run consistency was **not measured**. Read every figure as a single observation, not a rate.

## Detection and recognition (record grader)

| Scenario | Seeded gaps detected | Safeguards recognised | Forbidden hits | Open tasks (bound) | Findings with `path:line` |
| --- | --- | --- | --- | --- | --- |
| greenfield | 3/3 | 1/1 | 0 | **22** (10) | 28/43 |
| established | 5/5 | 6/8* | 0* | **29** (12) | 34/39 |
| mature | — (none seeded) | 11/11 | 0* | **30** (5) | 45/45 |
| multi-app (assess only) | 2/2 | 2/2 | 1† | — | 41/49 |
| established + eval-hollow | 5/5, plus 3/3 eval checks | 6/6 | 1 (T-016, threshold replacement) | **33** (12) | 40/45 |

\* After the ground-truth corrections below.
† See "Ground truth vs. the standard" below.

The multi-app run was stopped after assessment to save usage, so it has no plan. Eval-hollow ran both steps.

- **Multi-app.** The deterministic layer misses the untested `session.py`, because a test that only overrides the dependency counts as a reference. The agent caught it (VER-12 partial, cited). The web app got no API-layer testing, and the Python app got Python strictness (STR-PY-03).
- **Eval-hollow.** EVAL-01 and EVAL-04 failed even though an `evals/` directory exists. The agent called the "100%" claim unsupported: there is no model, run record or evaluator, and the prompts have no acceptance criteria. So the hollow case is told apart from the no-strategy case by the reasons given, not by the status alone. H7 is **not confirmed** for this case, and `eval-designer` is unchanged.
  - The `eval-cases-no-runs` and `eval-observed` variants are checked only at the deterministic layer. No agent run covered them.
- The eval-hollow plan repeated the baseline's bloat patterns:
  - T-012 "Add the integration layer" and T-015 "Cover … with integration tests" address the same findings.
  - T-016 replaces the working coverage threshold.

## Ground truth vs. the standard (multi-app)

The agent asked for a conventions file for `packages/shared`, a two-file library, in F-CTX-001 and F-VER-014. My `expect.yaml` forbids this. The playbook's own CTX-12 source, however, says to give "each deployable app or layer, such as web, API, worker, or shared packages" a scoped conventions file, and the agent applied it faithfully.

One assess-only run does not show that this is wrong in practice, so the standard is **left unchanged**. The forbidden pattern stays, flagged as a disagreement for a maintainer to settle.

- **The judgement layer was strong.** Every seeded gap was found, and each was cited at its path. Every practice in the mature repository was recognised despite the unfamiliar tooling, so the agents corrected the detectors' false positives. They also found real defects I had not seeded:
  - an `http`→`store` import that breaks the mature repo's own stated boundary
  - non-idempotent journal posting
  - malformed amounts returning 500
  - a refund cap that races without a lock
  - an integration test that silently skips in CI
- **The plans were not proportionate.** Each repository, including the mature one and an L0 scaffold, got 22-30 tasks across 4-6 milestones, reaching L4 automation.

## Plan failures and their sources

| Observed in the runs | Source |
| --- | --- |
| L0 repositories planned through L4: janitors (all 3 runs), eval harnesses and 7 cases, enforcement negative cases, docs-check CI, an independent reviewer agent | `skills/plan/SKILL.md` has no horizon. Step 12 says to fix every "unlinked actionable finding" warning, which turns every finding into a task. |
| "Adopt documentation layout" plus "Create CLAUDE.md" for a repository whose only docs work is creating CLAUDE.md (greenfield T-008+T-009) | Plan step 8 adds the layout task for any action other than retain. |
| "Require reasons for inline suppressions" as its own task in a repository with zero suppressions (greenfield T-005), beside "Enable Tier 1 strictness" in the same lint config | Plan step 6 |
| "Draft conventions" and "Write test strategy" as separate tasks that write the same file (all 3 runs) | Plan steps 5 and 7 |
| "Add the integration layer" plus two "Cover X" tasks for one finding (mature T-020/021/022) | Plan step 7 |
| A working 80% coverage floor replaced by changed-line coverage (established T-015, mature T-010) | `reference/strictness/general.yaml` `not_recommended` treats any repository-wide percentage as the anti-pattern, and the auditors must flag it for simplification. |
| A new conventions file next to a root AGENTS.md or CLAUDE.md that already holds the rules (all 3 single-app runs) | `detectApps` never counts a root guide as a conventions source, even in a single-app repository, where it loads exactly like an unscoped rules file. |
| Nine findings for one strictness gap (greenfield F-VER-006..014) | `agents/verification-auditor.md`: "give each missing Tier 1 check its own finding" |
| The agent was confused by "1 uncommitted path" on a clean tree (greenfield report) | `readonly begin` counted `.git/info/exclude`. |

## Hypotheses not confirmed

| Hypothesis | Result |
| --- | --- |
| H2: CTX-05/06 would be failed as P0 debt on a scaffold | No. The greenfield auditor deferred both itself. |
| H3: the advisor's "3 to 7" minimum would force recommendations | No. The mature repo's top recommendations were real defects. |
| H9: VER-07/08 evidence is discarded | No effect was visible. |

These were left unchanged.

## Ground-truth corrections (errors in the scenarios, not in the playbook)

- **Lockfiles.** The fixtures' lockfiles were empty stubs. The agents correctly reported that `npm ci` would fail (established VER-02). They are now plausible, but they still list direct dependencies only.
- **Established, `E-G6`.** It expected VER-11 to be judged as a safeguard. VER-11 judges a *stated* strategy, which the repository lacks, so this was moved to the deterministic probe.
- **Mature, `T-G11`.** It expected Biome to satisfy all of Tier 1 strictness. Biome 1.9 has no type-aware promise rules, so it now credits only the checks Biome and `tsc` actually enforce.
- **Grader patterns.** The `rewrite` and `AGENTS.md` patterns matched harmless text ("rewrite the test", "does not duplicate an AGENTS.md bullet") and were tightened.
- **New forbidden patterns.** "replace the coverage threshold" and "add a unit-test runner" were added after the baseline, from observed cases, and are marked as such.
