# Strictness profiles

This library says which deterministic checks are worth turning on for each stack. It aims for the strictest checks that are cheap and rarely wrong, and stops short of tooling whose cost outweighs what it catches. The verification auditor recommends checks only from here. `agentic strictness` reports which ones each app already runs.

## Tiers

| Tier | When to recommend it | Examples |
| --- | --- | --- |
| 1 | Always. These are cheap, high-signal checks with few false positives, and they catch what agents get wrong most often. | TypeScript `strict` and `noUncheckedIndexedAccess`, type-aware lint, suppressions that need a reason, lint warnings that fail the build, focused and skipped tests rejected, fast checks run in the agent loop |
| 2 | Only when the check's `when` condition holds in the repository. | Dead-code detection, boundary lint, coverage on changed lines, `exactOptionalPropertyTypes` |
| 3 | Only after a recurring defect that the check would have caught, with that defect cited. | Mutation testing on changed code, duplication detection, complexity caps |

Each profile also has a `not_recommended` list of practices whose cost exceeds their benefit, each with a reason. The auditor never recommends them, and it flags them for simplification when a repository already does them.

## Ratcheting

- **New rules start at zero.** A check that has no violations today is turned on as an error.
- **Legacy violations use the tool's own baseline.** Examples are ESLint bulk suppressions (`eslint-suppressions.json`), Betterer, a basedpyright baseline file and golangci-lint `new-from-merge-base`. These count violations per file and rule, so a new violation in a baselined file still fails. Custom per-violation tracking is not worth building when one of these exists.
- **Inline suppressions are baseline entries.** Each one names the rule and gives a reason, and the total cannot grow without review (rubric `ARC-08`).
- **Security rules are never baselined.**

## File format

```yaml
stack: typescript            # must match the file name
title: TypeScript and JavaScript
reviewed: 2026-11            # lint-playbook warns after 12 months
applies_when: [node]         # stack signals, the same as the conventions library
checks:
  - id: STR-TS-01
    title: TypeScript strict mode is on
    tier: 1
    applies_when: [typescript]   # optional narrowing
    when: ...                    # required for Tier 2 and 3
    slop_prevented: the concrete agent failure it stops
    enable: the minimal configuration
    detect:                      # JavaScript regexes: config file path, then content
      - { files: '(^|/)tsconfig[^/]*\.json$', pattern: '"strict"\s*:\s*true' }
    ratchet: zero, or the tool-native baseline
    cost: what it costs to adopt
    source: { title: ..., url: https://... }
not_recommended:
  - { practice: ..., reason: ..., source: { title: ..., url: https://... } }
```

Detection only checks for configuration; the auditor confirms that CI runs the check. Candidate files are those in the app root, the repository root, shared config packages, CI workflows, and hook configuration.

## Files

| File | Applies to |
| --- | --- |
| [typescript.yaml](typescript.yaml) | Node, TypeScript and JavaScript apps |
| [python.yaml](python.yaml) | Python apps |
| [go.yaml](go.yaml) | Go apps |
| [java.yaml](java.yaml) | JVM apps |
| [rust.yaml](rust.yaml) | Rust apps |
| [general.yaml](general.yaml) | Every app: the agent feedback loop, tests, coverage, boundaries |
