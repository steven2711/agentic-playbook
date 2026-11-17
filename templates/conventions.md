---
# Copy to .claude/rules/<app>.md in the target repository so it loads only for this app's files.
# Alternatively, keep the body below in <app>/CLAUDE.md and drop this frontmatter.
paths:
  - "<app root>/**"
---

# <App name> engineering conventions

**Scope:** `<app root>/**`. **Owner:** <team or person>. **Last reviewed:** <YYYY-MM>.

This file holds judgment rules that the linters and type checker cannot enforce. Each rule has a reason and an example. If a rule becomes mechanically checkable, move it into a tool and list it under *Enforced by tooling* instead.

Rules adopted from the playbook's [conventions baseline library](../reference/conventions/README.md) keep their library ID, for example `(FE-03)`. Reviewers can then trace each rule back to its public source.

## Architecture and layering
<!-- Which layers exist, what each may import, where business rules live. -->
- **Rule:** …
  - *Why:* …
  - *Do:* `…`  *Don't:* `…`

## Patterns
<!-- Error handling, data access, state management, API design, background work. Keep only what applies to this app. -->
- **Rule:** …
  - *Why:* …
  - *Do:* `…`  *Don't:* `…`

## Naming and domain language
<!-- Terms that must be used consistently, and terms that are banned or ambiguous. -->
- …

## Testing
<!-- What gets unit, integration and end-to-end tests here; fakes versus mocks; fixtures. -->
- …

## Enforced by tooling (links only; do not restate)
<!-- One line per tool, linking its config. These rules are not repeated above. -->
- Formatting: `<formatter config path>`
- Lint: `<lint config path>`
- Boundaries: `<dependency-cruiser / import-linter / ArchUnit config path>`

## Promotion candidates
<!-- Rules above that a tool could enforce. Each one becomes a "Promote <rule> to <tool>" task. -->
- …

## Deliberate deviations from the baseline
<!-- Library rules this app intentionally does not follow, with the reason, so the advisor stops recommending them. -->
- `<RULE-ID>`: …
