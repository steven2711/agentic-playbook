# Architecture

```
http (hono, valibot)  ->  ledger (pure domain)  ->  store (postgres)
```

- `src/http` validates and maps requests; it may import `src/ledger` only.
- `src/ledger` is pure: no I/O, fully unit-tested, owns the balancing invariant.
- `src/store` persists journals inside one transaction per posting.
