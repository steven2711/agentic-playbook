# `agentic apply` patch format

A patch is a JSON object. Every collection is upserted by `id`: new IDs are added, and existing items are shallow-merged. Milestone exit criteria merge by their own `id`. The full schema is [record.schema.json](../schema/record.schema.json). `agentic apply` validates every patch and rejects invalid ones without writing.

The record holds the assessment and the plan, not execution state. Tasks have no status, and there is no evidence collection. Progress is recorded by reassessment: resolving findings and judging exit criteria.

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
    },
    {
      "id": "M-000",
      "exitCriteria": [{ "id": "M-000.X1", "status": "met", "evidence": [".github/workflows/ci.yml:14 runs the gate job; required check per gh api branches/main/protection"] }]
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
  "testing": [
    { "scope": "apps/api", "kinds": ["api-service"], "strategy": { "documented": false },
      "layers": [ { "id": "TL-API-02", "status": "present", "evidence": ["apps/api/test/integration/orders.int.test.ts:12"] } ],
      "criticalPaths": { "total": 14, "covered": 9, "uncovered": ["apps/api/src/billing/refund.ts"] },
      "coverage": "repo-wide, not enforced", "assessedRevision": "<sha>" }
  ],
  "docs": {
    "inventory": [ { "location": "docs/STYLE.md", "purpose": "Global style rules for all apps", "authority": "contract", "disposition": "relocate", "issue": "Loads web rules for API work" } ],
    "target": [
      { "id": "DOC-ARC-02", "scope": "repo", "status": "absent", "action": "create", "home": "docs/adr/", "reason": "3 apps; datastore switch in a1b2c3d", "evidence": ["no adr/ or decisions/ directory"], "findingIds": ["F-CTX-004"] },
      { "id": "DOC-APP-01", "scope": "apps/web", "status": "misplaced", "action": "relocate", "currentPaths": ["docs/STYLE.md"], "home": ".claude/rules/web.md", "evidence": ["docs/STYLE.md:1-80 covers only apps/web"] }
    ],
    "loading": { "alwaysLoadedLines": 412, "issues": ["CLAUDE.md:120-300 holds web-only rules"] },
    "navigation": [ { "goal": "decisions", "reachable": false, "route": ["CLAUDE.md"], "note": "no link to any decision record" } ],
    "assessedRevision": "<sha>"
  },
  "maintenance": {
    "roster": [
      { "id": "JAN-DOC-01", "status": "absent", "recommend": "after-prerequisites", "blockedBy": ["CTX-01"], "trigger": "pull request", "environment": "GitHub Actions (existing ci.yml)", "evidence": ["no doc check in .github/workflows/"], "findingIds": ["F-WF-002"] },
      { "id": "JAN-DEP-01", "status": "present", "recommend": "none", "evidence": [".github/dependabot.yml"] }
    ],
    "summary": "Dependabot runs; the documentation check waits on CTX-01.",
    "assessedRevision": "<sha>"
  },
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
- **Evidence citations:** in any `evidence` string, a precise citation (`path:line` or `path:start-end`) must name a repo-relative file that exists in the worktree, with those lines. Otherwise the patch is refused. Bare paths, sentences and URLs are not checked.
- **Passed against a failing probe:** a criterion set to `passed` whose `scan.json` hint is `failed` needs `notes`, in the same item, explaining why the probe is wrong here.
- **Paths with spaces:** quote the citation in backticks, for example `` `My Docs/setup.md:12` ``. A token counts as a file citation when its first segment exists in the repository or it ends in a file extension, so hosts, addresses and image tags such as `127.0.0.1:3000` are not checked.
- **Tasks** carry no execution state: `status`, `history`, `implementer` and `blockedReason` are refused. Defer a task with `deferredTrigger`. `requiresApproval: true` marks a task that needs a human decision before anyone implements it. A task may depend only on tasks in its own milestone or in milestones its milestone depends on.
- **Exit criteria** are judged by reassessment: `status` is `met` (needs `evidence`), `unmet`, or `unverified` (needs a `reason`). Send only `id` and the judgement: they merge by ID, and the text stays as planned. A changed judgement brings its own evidence or reason in the same item; it never inherits the previous one's. Changing an exit criterion's `text` clears its judgement. Remove one with `"remove": { "exitCriteria": ["M-001.X2"] }`.
- **Milestone status** is derived and cannot be set. It is `completed` when every exit criterion is `met`, `in_progress` when some exit criterion is met or some task is addressed (its findings resolved), and `deferred` when every task is deferred.
- **Approvals** cannot be written or removed with apply. Use `agentic approve <subject> --by human:<name>`. A roadmap approval is bound to the plan's content: changing milestones or tasks shows the roadmap as changed since approval.
- **Read-only fields:** `scoreHistory`, `recordRevision`, `artifact`, `migrations` and the other computed fields cannot be written.
- **Removing items:** criteria and addressed tasks cannot be removed.
- **Conventions:**
  - `rule` must be an ID from the [conventions library](conventions/README.md). Leave out `id`: the CLI reuses the existing `CV-NNN` for the same `scope` and `rule`, or allocates a new one.
  - `documented`, `followed` and `contradicted` need evidence. `n_a` needs a `reason`.
  - `decision` defaults to `proposed`. Set it to `accepted` or `declined` only when the user decides.
- **Testing:** one snapshot per app `scope`, replaced whole on each apply (no `id`). Layer IDs must exist in the [testing profiles](testing/README.md). A `present` layer needs evidence, an `n_a` layer needs a `reason`, and `covered` cannot exceed `total`. Remove one with `"remove": { "testing": ["apps/api"] }`.
- **Docs:** one snapshot for the repository, replaced whole on each apply.
  - Target `id`s must exist in the [documentation library](docs/README.md), and each `scope` and `id` pair appears once.
  - A `present` entry needs evidence, and an `n_a` entry needs a `reason`.
  - An `absent` or `misplaced` entry needs an action, or a `reason` for leaving it.
  - `relocate` and `consolidate` need `currentPaths` and a `home`. `create` needs a `home`.
  - `findingIds` must exist.
  - Remove the snapshot with `"remove": { "docs": true }`.
- **Maintenance:** one roster for the repository, replaced whole on each apply.
  - Each `id` must exist in the [maintenance library](maintenance/README.md) and appear once.
  - A `present` entry needs evidence, and an `n_a` entry needs a `reason`.
  - `blockedBy` must name criteria in the record.
  - An entry recommended `now` whose library prerequisites have not all `passed` is refused (`n_a` does not count). Use `after-prerequisites` with `blockedBy`. A prerequisite that regresses after the roster was written draws a warning, and `agentic status` reports it.
  - `findingIds` must exist.
  - Remove the roster with `"remove": { "maintenance": true }`.
- **Mode:** `"mode": "existing"` switches the stage. Criteria that only held stage defaults (`n_a` or `deferred` by rubric rule) are recomputed.
