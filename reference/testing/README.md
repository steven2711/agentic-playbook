# Testing profiles

This library says which test layers each kind of app should have, what belongs in each, and which code is most likely to be critical. It is the baseline the `test-strategy-auditor` compares each app with. `agentic tests` reports what each app already has.

The judgment rules for writing good tests (behaviour through public interfaces, mostly small tests, hermetic, fakes over mocks, a regression test per fix, DAMP, user-centric UI queries, changed-code coverage) live in the conventions library as [TST-01 to TST-08](../conventions/testing.yaml). Layers here point to them with `see:` instead of repeating them.

## What a per-app assessment covers

| Question | Answered by |
| --- | --- |
| **Strategy.** Is there a stated testing approach for this app, and does it fit the app's kind? | The auditor reads the app's scoped conventions file (`## Testing`) and compares the layer mix with the profile. |
| **Scope.** Which layers exist? Which of the app's critical paths have a test at a layer that can catch their failures? | `agentic tests` finds layers and critical-path candidates. The auditor confirms them and builds the critical-path map. |
| **Coverage.** Is coverage measured on changed code, and does CI act on it? | Coverage config from the scan, then the auditor reads CI. A global percentage is never the goal. |
| **Quality.** Do the tests assert behaviour? | The auditor samples tests per layer against TST-01 to TST-06. |
| **Gaps.** What should be added first? | Findings, ordered: uncovered critical paths, missing Tier 1 layers, recurring quality defects, missing strategy. |

## Tiers

| Tier | When to recommend it | Examples |
| --- | --- | --- |
| 1 | Always, for an app of this kind. | Unit and integration tests for a service, component tests and a few journey end-to-end tests for a web UI |
| 2 | Only when the layer's `when` condition holds in the repository. | Contract tests once a separately deployed consumer exists, accessibility checks for public UI, migration tests once there are migrations |
| 3 | Only after a recurring defect the layer would have caught, with that defect cited. | Property-based tests, visual regression, load tests |

Each profile also has a `not_recommended` list. The auditor never recommends those practices, and flags them for simplification when a repository already relies on them. Across all profiles, a mandated coverage percentage is not recommended (see TST-08).

## Kinds

An app can match several kinds: a Next.js app is both a web front end and an API service. An app that matches none of the others is a library.

| File | Kind | Signal |
| --- | --- | --- |
| [web-frontend.yaml](web-frontend.yaml) | Web front end | `web` |
| [api-service.yaml](api-service.yaml) | HTTP or RPC service | `http-api` |
| [worker.yaml](worker.yaml) | Background worker or queue consumer | `worker` |
| [cli.yaml](cli.yaml) | Command-line tool | `cli` |
| [data-pipeline.yaml](data-pipeline.yaml) | Data pipeline or analytics transforms | `pipeline` |
| [library.yaml](library.yaml) | Shared library or package | `library` |

## File format

```yaml
kind: api-service              # must match the file name
title: HTTP or RPC service
reviewed: 2026-11              # lint-playbook warns after 12 months
applies_when: [http-api]       # stack signals
layers:
  - id: TL-API-02
    layer: integration
    title: ...
    tier: 1
    applies_when: [db]         # optional narrowing
    when: ...                  # required for Tier 2 and 3
    purpose: what this layer proves
    belongs_here: what to test at this layer
    detect:                    # JavaScript regexes on the path inside the app, and optionally on content
      - { files: '(^|/)integration/', pattern: 'supertest', exclude: '...' }
    see: [TST-02]              # related conventions rules
    source: { title: ..., url: https://... }
critical_path_hints:           # candidates only; the auditor confirms them
  - { name: payments, files: '(^|/)payment[^/]*\.ts$', consequence: Financial loss }
not_recommended:
  - { practice: ..., reason: ..., source: { title: ..., url: https://... } }
```

Detection looks only at files inside the app root. A critical-path candidate counts as referenced when a test file in the app mentions its file name. That is a hint, not proof of coverage.
