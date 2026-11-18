# Eval results

| Date | Model | refund-cap | route-boundary | ambiguous-refund-policy | Interventions |
| --- | --- | --- | --- | --- | --- |
| 2026-09-02 | claude-sonnet-5-5 | 1/2 | 0/1 | 1/1 | 1 |
| 2026-10-28 | claude-opus-5-5 | 2/2 | 1/2 | 1/1 | 1 |

route-boundary failures both import `src/lib/db.ts` from a route; tracked in #212 (add a lint rule).
