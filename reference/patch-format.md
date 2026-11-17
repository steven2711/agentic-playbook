# `agentic apply` patch format

A patch is a JSON object. Every collection is upserted by `id`: new IDs are added, and existing items are shallow-merged. The full schema is [record.schema.json](../schema/record.schema.json). `agentic apply` validates every patch and rejects invalid ones without writing.

```json
{
  "assessedRevision": "HEAD",
  "criteria": [
    { "id": "VER-03", "status": "partial", "evidence": [".github/workflows/ci.yml:12 runs lint and test; typecheck is not run"] },
    { "id": "VER-06", "status": "unverified", "evidence": [], "reason": "gh is not authenticated; branch protection could not be read" }
  ],
  "findings": [
    {
      "id": "F-VER-001",
      "title": "CI does not run the type checker",
      "kind": "verified",
      "dimension": "VER",
      "priority": "P0",
      "currentState": "ci.yml runs lint and test only",
      "desiredState": "CI runs every canonical check and fails on any failure or skip",
      "evidence": [".github/workflows/ci.yml:10-14", "package.json:8 defines typecheck"],
      "remediation": "Add `pnpm typecheck` to the CI job and to the aggregate gate",
      "criterionIds": ["VER-03"],
      "complexity": "S",
      "risks": "Existing type errors may fail CI immediately; baseline them first if so"
    }
  ],
  "milestones": [
    {
      "id": "M-001",
      "title": "Deterministic gate",
      "objective": "Every canonical check runs in CI behind one required gate",
      "scope": "CI workflow and branch protection",
      "outcomes": ["One required status check", "Skipped checks fail the gate"],
      "dependsOn": [],
      "exitCriteria": [{ "id": "M-001.X1", "text": "A PR with a failing typecheck is blocked by the gate (captured run URL)" }]
    }
  ],
  "tasks": [
    {
      "id": "T-001",
      "milestoneId": "M-001",
      "title": "Run typecheck in CI",
      "description": "Add the typecheck step to .github/workflows/ci.yml using the same script as local runs.",
      "priority": "P0",
      "dependsOn": [],
      "findingIds": ["F-VER-001"],
      "acceptanceCriteria": [
        { "id": "T-001.AC1", "text": "ci.yml invokes `pnpm typecheck`" },
        { "id": "T-001.AC2", "text": "A deliberately introduced type error fails the CI job" }
      ],
      "verification": ["Inspect ci.yml", "Push a branch with a type error to a scratch PR, or run the job locally with act, and capture the result"],
      "requiresApproval": true
    }
  ],
  "conventions": [
    { "scope": "apps/web", "rule": "FE-03", "status": "contradicted", "evidence": ["apps/web/src/hooks/useOrders.ts:14 fetches in useEffect (6 of 8 data hooks)"] },
    { "scope": "apps/web", "rule": "FE-10", "status": "followed", "evidence": ["apps/web/src/components/OrderList.tsx:22 keys by order.id"], "promoteTo": "react/no-array-index-key" },
    { "scope": "apps/api", "rule": "API-05", "status": "absent", "evidence": ["apps/api/src/routes/orders.ts:31 returns every row"], "decision": "accepted" }
  ],
  "remove": { "tasks": ["T-009"] }
}
```

## Rules

- **Criteria:** a criterion ID must exist in the rubric.
  - `passed` and `partial` need evidence.
  - `n_a` and `unverified` need a `reason`.
  - `deferred` needs a `trigger`.
- **Finding kinds:** `kind` is one of `verified`, `inferred`, `recommendation`, `unknown` or `deferred`.
  - A `verified` finding needs evidence.
  - `unknown` and `deferred` findings should give a `reason`.
- **New tasks** start as `pending`, `deferred` or `blocked`. Their status can only change later through `agentic task`.
- **Milestone status** is derived and cannot be set. A milestone completes only when all its tasks are complete and every exit criterion has passing evidence.
- **Read-only fields:** `scoreHistory`, `evidence`, `recordRevision`, `artifact` and the other computed fields cannot be written.
- **Removing items:** criteria and completed tasks cannot be removed.
- **Conventions:**
  - `rule` must be an ID from the [conventions library](conventions/README.md). Leave out `id`: the CLI reuses the existing `CV-NNN` for the same `scope` and `rule`, or allocates a new one.
  - `documented`, `followed` and `contradicted` need evidence. `n_a` needs a `reason`.
  - `decision` defaults to `proposed`. Set it to `accepted` or `declined` only when the user decides.
- **Mode:** `"mode": "existing"` switches the stage. Criteria that only held stage defaults (`n_a` or `deferred` by rubric rule) are recomputed.
