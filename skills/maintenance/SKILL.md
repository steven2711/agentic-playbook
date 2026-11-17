---
name: maintenance
description: Propose the maintenance agents (janitors) that keep the repository from drifting once it is fixed, such as a pull-request documentation check, a context janitor or an architecture janitor. Each janitor guards an accepted contract and waits for its prerequisites. Records the roster and publishes it in the tracker.
disable-model-invocation: true
---
# /agentic:maintenance

Propose which janitors this repository should run to find and correct drift, when each should start, and what each may change on its own.

The `workflow-auditor` also does this inside `/agentic:assess`. **It is read-only for the target repository.** The roster is a proposal until the user plans it. Janitors are L4 work: they guard contracts that earlier milestones produce, so they are set up last.

## Steps

1. Read `${CLAUDE_PLUGIN_ROOT}/reference/operating-rules.md`.

2. Run `agentic where`. If there is no record, run `agentic init` and `agentic scan` first, and tell the user that prerequisites will be unknown until `/agentic:assess` has judged the criteria. Then run `agentic maintenance` and show the user:
   - the janitors that already exist
   - the places a janitor could run here
   - which janitors' prerequisites pass, and what the others wait on

3. Start the `workflow-auditor` subagent. Give it:
   - the absolute repo path and the mode
   - the `scan.json` path from `agentic where`
   - the record's existing WF criteria and findings, and its `maintenance` roster if there is one, so IDs and judgements stay stable

4. Merge its result into a patch in the session scratchpad:
   - `maintenance`: the roster, with `"assessedRevision"` set to the current HEAD. The CLI replaces the previous roster whole.
   - `criteria`: every WF criterion it judged.
   - `findings`: as returned, with IDs kept stable.
   - Check each `now` entry against the record's criteria. One whose prerequisites have not passed becomes `after-prerequisites`, with those criteria in `blockedBy`.
   - Run `agentic apply <patch> --by agent:workflow-auditor`, then `agentic score`. Fix any maintenance warnings it prints.

5. Follow **Publish the tracker**. The **Maintenance** tab groups janitors as running, ready to set up, waiting on prerequisites, and not yet.

6. Report:
   - the summary
   - janitors ready to set up now, each with its trigger, where it would run, what it may fix alone and its noise limits
   - janitors waiting, each with the criteria it waits on
   - Tier 2 janitors whose condition holds, each with the evidence
   - anything the repository does that is in the library's `not_recommended` list

   End with the question **"Which of these janitors do you want to plan?"** and offer `/agentic:plan`.
