---
name: docs
description: Assess the repository's documentation architecture (inventory, what loads into agent sessions, navigation, and a target layout of which documents should exist where) against the sourced documentation library, record the gaps, and publish them in the tracker.
argument-hint: "[app root]"
disable-model-invocation: true
---
# /agentic:docs

Assess how this repository's documentation is organised for agents and people, and propose the layout it should have. App root to focus on: `$ARGUMENTS` (empty means the whole repository and every app).

The `context-auditor` also does this inside `/agentic:assess`. **It is read-only for the target repository.** The target layout is a proposal until the user plans it.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md`. Then run `agentic readonly begin`, unless this is running inside `/agentic:assess` or `/agentic:reassess`, which hold their own read-only window.

2. Run `agentic where`. If there is no record, run `agentic init` and `agentic scan` first. Then run `agentic docs` and show the user:
   - the always-loaded line count
   - missing Tier 1 documents
   - the number of broken links and repeated lines

3. Start the `context-auditor` subagent. Give it:
   - the absolute repo path and the mode
   - the `scan.json` path from `agentic where`
   - the app root, if one was given
   - the record's existing CTX criteria and findings, and its `docs` snapshot if there is one, so IDs and judgements stay stable

4. Merge its result into a patch in the session scratchpad:
   - `docs`: the snapshot, with `"assessedRevision"` set to the current HEAD. The CLI replaces the previous snapshot whole. If an app root was given, carry over the previous target entries for other scopes unchanged.
   - `criteria`: every CTX criterion it judged.
   - `findings`: as returned, with IDs kept stable.
   - Run `agentic apply <patch> --by agent:context-auditor`, then `agentic score`.

5. Run `agentic readonly end` (with the same exception) and report any change it lists. Then follow **Publish the tracker**. The **Docs** tab shows the target layout, agent context, navigation and the inventory.

6. Report:
   - the summary of the documentation architecture
   - the target layout's actions, grouped as create, relocate or consolidate, and archive, with Tier 1 first
   - always-loaded lines and the loading issues
   - which navigation goals failed from CLAUDE.md
   - Tier 2 items whose condition holds, each with the evidence

   End with the question **"Which of these changes do you want to plan?"** and offer `/agentic:plan`.
