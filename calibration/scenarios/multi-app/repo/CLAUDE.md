# Atlas

Monorepo: `apps/web` (Next.js dashboard), `apps/api` (FastAPI service, Python), `packages/shared`
(TypeScript utilities used by the web app).

## Commands (from the root)

- `pnpm lint`, `pnpm typecheck`, `pnpm test`: run across the TypeScript workspaces via turbo
- `cd apps/api && uv run pytest`: API tests; `uv run ruff check . && uv run mypy app`: API lint and types

## Rules

- The web app talks to the API only through `apps/web/lib/api.ts`; never call the database from web.
- Shared code goes in `packages/shared` only when two apps need it.

Web conventions: `.claude/rules/web.md`.
