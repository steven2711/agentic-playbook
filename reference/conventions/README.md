# Conventions baseline library

This folder holds a curated set of engineering conventions. Each one comes from guidance that large engineering organizations publish. Examples:
- Google's engineering practices, style guides, API Improvement Proposals (AIPs) and SRE books
- the Amazon Builders' Library
- Microsoft's architecture guides
- Meta's React documentation
- OWASP, W3C and IETF standards

After an assessment, the `conventions-advisor` subagent compares each app in a repository against these rules. It reports which rules are documented, followed, contradicted or absent, and which would be better as a deterministic check. See [the standard](../../standards/documentation-architecture.md#engineering-conventions).

## Ground rules

- **Every rule cites a public source.** The library never claims to know a company's internal practice. Some rules are not about a particular company, such as a framework rule or an OWASP rule. Those cite the organization that maintains the standard.
- **Recommendations, not mandates.** A repository adopts a rule only when a human approves it, through a "Draft conventions" task.
- **Judgment first.** Each rule records `enforceable`, which says whether a tool can check it. If one can, the recommendation is to promote it to that tool, not to write it as prose.
- **Freshness.** Each file has a `reviewed: YYYY-MM` date. `agentic lint-playbook` warns when a file has not been reviewed for 12 months. It fails when a rule has no source URL or no `enforceable` field, or uses an unknown signal.

## File format

```yaml
domain: frontend-web            # matches the file name
title: Frontend web applications
reviewed: 2026-11
applies_when: [web]             # stack signals; a rule may narrow this with its own applies_when
rules:
  - id: FE-01                   # PREFIX-NN, unique across the library
    title: Keep minimal state and derive the rest
    rule: What to do, stated so a reviewer can check a diff against it.
    why: The failure it prevents.
    do: A short example of the right pattern.
    dont: A short example of the anti-pattern.
    applies_when: [react]       # optional
    enforceable: "partial: eslint-plugin-react-hooks"   # or false
    source: { title: "React docs: You Might Not Need an Effect", url: "https://react.dev/learn/you-might-not-need-an-effect" }
```

## Stack signals

`agentic conventions` detects app roots and their signals from manifests:

| Signal | Detected from |
| --- | --- |
| `any` | Every app |
| `web` | react, next, vue, svelte, angular or solid dependencies |
| `react`, `next`, `vue`, `svelte`, `angular` | The matching dependency |
| `server` | A server framework, or a Go, Java or Python service |
| `http-api` | express, fastify, nest, koa, hono, hapi, next, django, fastapi, flask, spring-boot, gin, echo, chi or similar |
| `db` | An ORM or database driver, or a `migrations/` directory |
| `node`, `typescript`, `python`, `go`, `java`, `rust` | The manifest or toolchain |

## Files

| File | Covers |
| --- | --- |
| [cross-cutting.yaml](cross-cutting.yaml) | Change size, review, naming, comments, module boundaries, dependencies, configuration, error handling |
| [languages.yaml](languages.yaml) | Language style guides and type-system strictness |
| [testing.yaml](testing.yaml) | Test sizes, determinism, test doubles, behavior-focused tests, coverage |
| [frontend-web.yaml](frontend-web.yaml) | State, purity, data fetching, UI states, accessibility, performance, server/client boundary |
| [backend-api.yaml](backend-api.yaml) | Resource design, contracts, compatibility, pagination, errors, idempotency, timeouts, layering |
| [data-persistence.yaml](data-persistence.yaml) | Migrations, expand/contract, N+1 queries, transactions, outbox, query safety |
| [observability-ops.yaml](observability-ops.yaml) | Structured logs, golden signals, tracing, SLOs, flags, progressive delivery, health checks |
| [security.yaml](security.yaml) | Authorization, secrets, input handling, credentials, least privilege, dependencies, headers |
