# Maintenance agents (janitors)

Once the roadmap has fixed the repository, something has to keep it fixed. This library describes the maintenance agents a repository can run to find and correct drift, when each is worth running, and what each may change on its own. The `workflow-auditor` compares the repository with it and proposes a **roster**: which janitors to set up now, which to set up once their prerequisites pass, and which are not worth it yet. `agentic maintenance` reports which janitors already exist and which prerequisites pass.

The prose standard is [autonomous-workflows.md](../../standards/autonomous-workflows.md). The rubric criteria WF-06 to WF-09 score it, all gated at L4 (autonomous maintenance). This library adds no criteria of its own, so the score does not change because of it.

## A janitor guards a contract

A janitor can only detect drift from something written down. Each item names:

- `guards`: what it protects. These are rubric criteria and documentation items, such as the accepted boundary rules (ARC-01) or the root CLAUDE.md (DOC-ENT-01).
- `prerequisites`: rubric criteria that must pass before it is set up. An architecture janitor without accepted boundary rules would invent intent.

So janitors come last. The plan puts them in a final "Autonomous maintenance" milestone, and each one waits for the milestones that make its prerequisites pass.

A prerequisite counts only when it is `passed`. `n_a` does not count: it means the contract the janitor would guard does not exist in this repository. `agentic apply` refuses a roster that recommends a janitor `now` before its prerequisites pass. A prerequisite that regresses later is reported by `agentic status` and `/agentic:reassess`, because a running janitor's output can no longer be trusted once its contract has weakened.

## Risky autofixes

Three janitors can weaken what they guard, so the library marks them `autofix_risk: high` and lists their safeguards:

- **Flaky test janitor (JAN-QLT-01):** quarantine moves a test out of the gate. Each quarantine names an issue, an owner and an expiry. It never deletes a test or weakens an assertion, and the quarantine count is ratcheted.
- **Dependency updates (JAN-DEP-01):** auto-merge trusts the gate. It applies to patch and minor updates only, and only when branch protection enforces the required checks (VER-06 is a prerequisite).
- **Dead code janitor (JAN-QLT-02):** removal can delete reachable code or tests. The full gate must pass, coverage must not fall, and tests and the public API are never removed.

## Tiers

| Tier | When to recommend it | Examples |
| --- | --- | --- |
| 1 | Always, once the repository is working towards L4 and the prerequisites pass. | Documentation check on every pull request, agent failures becoming durable fixes |
| 2 | Only when the item's `when` condition holds in the repository, with evidence. | Context janitor, architecture janitor, flaky-test janitor, dependency updates, scheduled gardening |
| 3 | Only after a recurring problem the janitor would have prevented, with that problem cited. | Knowledge-gap miner, dead code janitor |

The `not_recommended` list applies everywhere. The auditor never recommends those practices, and flags them when a repository already relies on them. For a greenfield repository, record only the Tier 1 janitors, as `after-prerequisites`.

## What each item says

| Field | Meaning |
| --- | --- |
| `trigger` | `pr`, `schedule` or `event` (such as a blocked task or a revert). Pull-request triggers come before schedules. |
| `detector` | The deterministic checks it runs first, such as `agentic docs --json` or the boundary check. The agent reasons only about what they find. |
| `agent_step` | What needs judgment. |
| `autofix` | What it may change without a human. Everything else is a proposal. |
| `autofix_risk` | `low`, or `high` when the autofix can remove tests or code, or merge changes, and so could weaken what the janitor guards. |
| `safeguards` | Required when `autofix_risk` is `high`: the conditions the janitor's setup must enforce before its autofix acts. `/agentic:plan` turns each one into an acceptance criterion. |
| `needs_human` | What always goes to a person. |
| `noise_controls` | Caps, deduplication, thresholds and ratchets that keep it from flooding reviewers. |
| `success` | How to tell it is worth its cost. |

Where the janitor runs (GitHub Actions, another CI, Claude Code scheduled tasks, hooks) is decided per repository. The auditor compares what already exists there and never assumes one.

## File format

```yaml
area: janitors                 # must match the file name
title: Maintenance agents (janitors)
reviewed: 2026-11              # lint-playbook warns after 12 months
items:
  - id: JAN-ARC-01
    title: Architecture janitor
    tier: 2
    when: ...                  # required for Tier 2 and 3
    trigger: [pr, schedule]    # pr, schedule, event
    guards: [ARC-01, DOC-ARC-02]       # rubric criteria or documentation items
    prerequisites: [ARC-01, ARC-04]    # rubric criteria that must pass first
    purpose: ...
    detector: [ ... ]
    agent_step: ...            # optional when no reasoning is needed
    autofix: ...
    needs_human: ...
    noise_controls: ...
    success: ...
    detect:                    # JavaScript regexes, case-insensitive, repo-relative: is it already set up?
      - { files: '^\.github/workflows/.+\.ya?ml$', pattern: '...' }
    autofix_risk: low          # or high, with safeguards: [ ... ]
    see: [WF-08]
    source: { title: ..., url: https://... }
not_recommended:
  - { practice: ..., reason: ..., source: { title: ..., url: https://... } }
```

`lint-playbook` checks each item's ID, tier, `when`, triggers, required fields, `autofix_risk` (and `safeguards` when it is high), source, regexes, and that `guards`, `prerequisites` and `see` name real criteria or documentation items.

Sources are public and cited per item. No item claims knowledge of a company's internal practice.
