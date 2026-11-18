# orders-api

Express + Postgres service that owns orders, invoices and refunds.

## Commands

- `npm run lint`: ESLint, zero warnings allowed
- `npm run typecheck`: TypeScript, no emit
- `npm test`: Vitest unit and HTTP integration tests
- `npm run db:migrate`: apply database migrations before running integration tests

## Layout

- `src/routes/`: HTTP handlers only; validate input with zod, then call a service
- `src/orders/`, `src/billing/`: domain services; no Express imports here
- `src/lib/db.ts`: the only module that talks to Postgres

See [architecture](docs/architecture.md) and [decisions](docs/adr/).
