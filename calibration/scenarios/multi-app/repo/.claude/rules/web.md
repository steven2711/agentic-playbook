---
paths:
  - "apps/web/**"
---
# Web conventions

- Server components fetch data through `lib/api.ts`; client components receive props only.
- Components live in `components/`, one component per file, with a co-located `*.test.tsx`.
- Use Tailwind utility classes; no CSS modules.
