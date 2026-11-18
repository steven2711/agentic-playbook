# Agent runs after the Phase 2 fixes

**Date:** 2026-11-17
**Plugin:** working tree with the Phase 2 changes (uncommitted, on top of `dfd5988`)
**Harness:** `calibration/run-agent.sh`, as for the baseline

There is one post-fix run each for `greenfield` and `established`. The mature and multi-app scenarios were not re-run, because the usage window did not allow it.

## Before and after

| Scenario | Seeded gaps | Safeguards | Forbidden hits | Open tasks (bound) | Milestones | Janitor tasks | Same-findings task pairs | Findings with `path:line` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| greenfield, baseline | 3/3 | 1/1 | 0 | 22 (10) | 4 | yes | — | 28/43 |
| greenfield, post-fix | 3/3 | 1/1 | 0 | **12** (10) | 2 | none | none | 21/27 |
| established, baseline | 5/5 | 6/8* | 1 (threshold replaced) | 29 (12) | 6 | yes | — | 34/39 |
| established + eval-hollow, baseline | 5/5 | 6/6 | 1 (threshold replaced) | 33 (12) | 6 | yes | T-012+T-015 | 40/45 |
| established, post-fix | 5/5 | 7/7 | **0** | **13** (12) | 5 | none | none | 35/40 |

\* The baseline judged VER-02 failed because of the stub lockfile, a fixture error since corrected (see `baseline-agent.md`).

**Detection did not regress.** Every seeded gap was found, with a finding that cites the seeded path, in both post-fix runs.

**Plans shrank by roughly half,** and the specific bloat patterns traced in the baseline are gone:
- no janitor tasks below L2
- no separate layout, suppression-reason or test-strategy tasks
- no coverage-threshold replacement
- no duplicate integration-layer task

Both plans still exceed their bounds slightly (12/10 and 13/12). The bounds are sanity limits written before the baseline, not targets.

**The horizon worked as intended.** Greenfield's plan reached L2 and listed what lies beyond it, with triggers, instead of making tasks for it: the eval suite, dependency scanning, janitors, the docs check and the failure-to-fix loop. It also raised the one beyond-horizon item it judged urgent, a likely vulnerable framework version, as a decision for a human instead of silently adding it.

## Still open

- **CTX-06 on greenfield is inconsistent.** It was deferred in the baseline run and failed after the fixes, which produced "Create ADR 0001 recording the framework". Neither run was affected by a change: the rubric has no stage default for CTX-06, and the auditor decides each time. This is one flip in two runs, and the resulting task is cheap, so nothing was changed.
- **Established T-009, "Create approved refund and invoice requirements".** It ties to a real gap: the refund cap has no stated source. The task wording asks for approval rather than inventing intent, but whether a requirements task belongs at this stage needs a reviewer's judgement.
- **Criterion agreement** between the baseline and post-fix established runs is 82%. The runs differ on CTX-04, CTX-08, CTX-12, VER-02, VER-11, ARC-04, ARC-08, EVAL-05 and WF-03. The two runs used different plugin versions, so this is an upper bound on inconsistency, not a measurement of it. VER-02 differs because of the lockfile fixture correction.

## Rubric review (by reading the plans)

| Quality | greenfield | established |
| --- | --- | --- |
| Actionable acceptance criteria | Pass. The criteria name commands, files and CI results. | Pass |
| Priority matches consequence | Pass. Reproducible setup, commands and CI come first; ADR and workflow come last. | Pass. Docs drift and strictness come first, then the `.env` (T-004) and the refund test (T-007). The `.env` arguably belongs first, which is borderline. |
