# Documentation architecture

This library describes the documentation a repository should have, where each document lives, how agents load it, and what authority it carries. The `context-auditor` compares the repository with it and proposes a **target layout**: for each applicable document, keep it, create it, move it, merge it, generate it or archive it. `agentic docs` reports what the repository already has.

The prose standard is [documentation-architecture.md](../../standards/documentation-architecture.md). The rubric criteria CTX-01 to CTX-12 score it. Items here point to those criteria with `see:`. This library adds no criteria of its own, so the score does not change because of it.

## What the assessment covers

| Question | Answered by |
| --- | --- |
| **Inventory.** What documents and agent guidance exist, and what is each one for? | `agentic docs` lists them. The auditor records purpose, audience, authority, owner and a disposition for each. |
| **Loading.** What loads into every agent session, and is all of it universally relevant? | `agentic docs` counts always-loaded lines and repeated lines. The auditor judges relevance. |
| **Target layout.** Which documents should exist, where, and with what authority? | The auditor applies this library's tiers to the repository and each app. |
| **Navigation.** Can an agent get from CLAUDE.md to the requirements, decisions, boundaries and verification commands? | The auditor follows the links. |
| **Gaps.** What should change first? | Findings in the CTX dimension, each naming a DOC item. |

## Tiers

| Tier | When to recommend it | Examples |
| --- | --- | --- |
| 1 | Always. | A concise root CLAUDE.md, a README with setup, scoped conventions and a README per app in a multi-app repository |
| 2 | Only when the item's `when` condition holds in the repository, with evidence. | ADRs and an architecture overview for a multi-app repository, an API contract once there are outside consumers, runbooks once there are alerts |
| 3 | Only after a recurring problem the item would have prevented, with that problem cited. | Diagrams as code, generated API reference, a documentation-gardening job, SLOs |

Each file also has a `not_recommended` list. The auditor never recommends those practices, and flags them for simplification when a repository already relies on them. For a greenfield repository, propose only Tier 1 and the Tier 2 items whose condition already holds.

## Areas

| File | Area |
| --- | --- |
| [entry.yaml](entry.yaml) | Agent entry point and navigation |
| [product.yaml](product.yaml) | Requirements, acceptance criteria and design proposals |
| [architecture.yaml](architecture.yaml) | Architecture and decisions |
| [interfaces.yaml](interfaces.yaml) | Interfaces and integration contracts |
| [operations.yaml](operations.yaml) | Deployment, configuration and operations |
| [per-app.yaml](per-app.yaml) | Per-app documentation in multi-app repositories |

## Load and authority

`load` says how an agent reaches the document:

- `always`: loaded into every session (root CLAUDE.md)
- `path-scoped`: loaded when the agent works under certain paths (rules with `paths:`, nested CLAUDE.md)
- `on-demand`: loaded when a task calls for it (skills)
- `linked`: read when something links to it
- `none`: not read by agents (a CI check or an owners file)

`authority` says how much the document governs, following the standard's distinctions:

| Value | Meaning |
| --- | --- |
| `contract` | Approved intent the code must satisfy |
| `fact` | Describes how things are today |
| `history` | Records why a decision was made |
| `plan` | Proposes work not yet done |
| `operation` | Procedure for running the system |
| `generated` | Produced from the code |
| `enforcement` | A check or ownership rule, not prose |

## File format

```yaml
area: architecture             # must match the file name
title: Architecture and decisions
reviewed: 2026-11              # lint-playbook warns after 12 months
items:
  - id: DOC-ARC-02
    artifact: Architecture decision records
    title: ...
    tier: 2
    applies_when: [multi-app]  # optional: stack signals, multi-app or deployable
    when: ...                  # required for Tier 2 and 3
    scope: repo                # repo, or app (checked for each app)
    purpose: why it exists
    home: docs/adr/NNNN-<slug>.md   # recommended location; an existing equivalent home is kept
    load: linked
    authority: history
    belongs_here: what goes in it
    not_here: what does not
    detect:                    # JavaScript regexes, case-insensitive; repo-relative, or app-relative for scope app
      - { files: '(^|/)adr/.+\.md$', pattern: '...', exclude: '...' }
      - { conventions: true }  # app scope only: the app has a scoped conventions file
    see: [CTX-06]              # rubric criteria this item serves
    source: { title: ..., url: https://... }
not_recommended:
  - { practice: ..., reason: ..., source: { title: ..., url: https://... } }
```

`applies_when` uses the stack signals from the conventions library plus two repository facts:

- `multi-app`: the repository has more than one app root
- `deployable`: the app has a Dockerfile, IaC, or platform deploy config

`lint-playbook` checks each item's ID, tier, `when`, `scope`, `load`, `authority`, source, regexes and `see` references.

Sources are public and cited per item. No item claims knowledge of a company's internal practice.
