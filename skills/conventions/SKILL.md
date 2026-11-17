---
name: conventions
description: Compare each app in the repository with the sourced conventions baseline (published practice from Google, Amazon, Microsoft, Meta/React, OWASP and others), record per-app recommendations, and publish them in the tracker.
argument-hint: "[app root]"
disable-model-invocation: true
---
# /agentic:conventions

Recommend engineering conventions for each app in this repository, based on industry practice with cited sources. App root to focus on: `$ARGUMENTS` (empty means all apps).

This also runs as the last step of `/agentic:assess`. **It is read-only for the target repository.** Recommendations are proposals. Nothing is adopted without the user's approval.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md`.

2. Run `agentic where`. If there is no record, run `agentic init` first. Then run `agentic conventions` and show the user the app roots and stacks it detected. If an app root or stack looks wrong, for example a tooling package detected as an app, say so and ask before continuing.

3. Start the `conventions-advisor` subagent. Give it:
   - the absolute repo path
   - the app root, if one was given
   - the existing assessments from `agentic conventions --json`

   For a repository with more than three apps, start one advisor per app **in parallel**, in a single message.

4. Merge the results into a patch in the session scratchpad:
   - Put each item from `conventions` into the patch's `conventions` array without an `id`. The CLI keeps one stable `CV-NNN` per (scope, rule).
   - Keep the existing `decision` values. Never change an `accepted` or `declined` decision unless the user asks.
   - Update `CTX-12` evidence with a one-line summary per app, for example "apps/web: 3 contradicted, 5 absent, no scoped conventions file". Do not change its status unless the context auditor has not judged it in this run.
   - Run `agentic apply <patch> --by agent:conventions-advisor`.

   The CLI rejects any rule ID that is not in the library. If it refuses, fix the item. Do not drop the guard.

5. Follow **Publish the tracker**. The **Conventions** tab shows each app with its rules, status, source links and promotion candidates.

6. Report per app:
   - the detected stack
   - whether it has a scoped conventions file
   - its top recommendations, each with rule ID, one-line rationale and source title
   - contradictions with `path:line`
   - rules worth promoting to a tool

   End with the question: **"Which of these do you want to adopt?"** When the user answers:
   - Record their choice as `decision: "accepted"` or `"declined"` with an apply patch.
   - Offer `/agentic:plan`, which turns accepted recommendations into a "Draft conventions for <app>" task and "Promote <rule> to <tool>" tasks.
