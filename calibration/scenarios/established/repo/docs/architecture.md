# Architecture

Requests enter through `src/routes/`, which validate input and delegate to the domain services in
`src/orders/` and `src/billing/`. Services depend on `src/lib/db.ts` for persistence. Routes never
import `src/lib/db.ts` directly.

Refunds are issued through the payments provider in `src/billing/refund.ts`; a refund can never
exceed the captured amount of its invoice.
