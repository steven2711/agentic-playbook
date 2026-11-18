# ledger-service

Double-entry ledger for Northwind payments. Hono HTTP API over Postgres.

## Commands

All commands go through `just` (see `Justfile`); tool versions are pinned in `.tool-versions`.

- `just setup`: install pinned tools and dependencies
- `just check`: Biome lint and format check, `tsc`, Vitest with coverage thresholds. CI runs exactly this.
- `just fmt`: format in place

## Boundaries

- `src/http/` handles requests and validation (valibot) only. It never imports the `postgres` driver;
  Biome enforces this (`biome.json`, `noRestrictedImports`).
- `src/ledger/` holds the domain rules. Every posting balances: debits equal credits.
- `src/store/` is the only database access.

## Decisions and design

- Architecture: `doc/architecture.md`
- Decisions: `doc/adr/` (read before changing posting rules or money types)

## Working rules

- Money is integer minor units (`bigint`), never floats. See ADR 0002.
- A change to posting rules needs an ADR and review by @northwind/ledger.
- Agent evals live in `evals/`; `just evals` runs them weekly (not in CI: it needs a model key).
