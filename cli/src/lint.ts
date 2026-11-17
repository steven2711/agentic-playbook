import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { lintLibrary } from "./conventions.js";
import { loadRubric } from "./rubric.js";
import { lintStrictness } from "./strictness.js";
import { lintTesting } from "./testing.js";
import { PROBES } from "./scan.js";

/**
 * Keeps the playbook's own documentation from drifting:
 *  - every rubric criterion's quote still appears in its cited standard
 *  - every standard (and every `##` section in it) is covered by >= 1 criterion
 *  - relative markdown links resolve
 *  - commands/skills only reference playbook files that exist
 *  - the conventions library: sources, enforceability, signals (see lintLibrary)
 *  - the strictness library: tiers, sources, valid detect regexes (see lintStrictness)
 *  - the testing library: layer tiers, sources, regexes, TST references (see lintTesting)
 */
export function lintPlaybook(root: string): string[] {
  const problems: string[] = [];
  const rubric = loadRubric(root);
  const norm = (s: string) => s.replace(/[’‘]/g, "'").replace(/\s+/g, " ");

  const sections = new Map<string, { heading: string; text: string }[]>();
  const sectionsOf = (file: string) => {
    if (!sections.has(file)) {
      const text = readFileSync(join(root, file), "utf8");
      const parts: { heading: string; text: string }[] = [];
      let cur = { heading: "(preamble)", text: "" };
      for (const line of text.split("\n")) {
        if (/^## /.test(line)) {
          parts.push(cur);
          cur = { heading: line.slice(3).trim(), text: "" };
        } else cur.text += line + "\n";
      }
      parts.push(cur);
      sections.set(file, parts.filter((p) => p.text.trim()));
    }
    return sections.get(file)!;
  };

  const covered = new Set<string>();
  const ids = new Set<string>();
  for (const c of rubric.criteria) {
    if (ids.has(c.id)) problems.push(`rubric: duplicate criterion id ${c.id}`);
    ids.add(c.id);
    if (!rubric.dimensions.some((d) => d.id === c.dimension)) problems.push(`rubric: ${c.id} has unknown dimension ${c.dimension}`);
    if (!rubric.priorities[c.priority]) problems.push(`rubric: ${c.id} has unknown priority ${c.priority}`);
    if (c.gate && !rubric.levels.some((l) => l.id === c.gate)) problems.push(`rubric: ${c.id} has unknown gate ${c.gate}`);
    if (c.probe && !(PROBES as readonly string[]).includes(c.probe)) problems.push(`rubric: ${c.id} references unknown probe ${c.probe}`);
    if (!existsSync(join(root, c.source))) {
      problems.push(`rubric: ${c.id} cites missing source ${c.source}`);
      continue;
    }
    const hit = sectionsOf(c.source).find((s) => norm(s.text).includes(norm(c.quote)));
    if (!hit) problems.push(`rubric: ${c.id} quote not found in ${c.source}: "${c.quote}" (standard changed? update the rubric)`);
    else covered.add(`${c.source}#${hit.heading}`);
  }

  const standards = readdirSync(join(root, "standards")).filter((f) => f.endsWith(".md")).map((f) => `standards/${f}`);
  for (const s of standards) {
    for (const sec of sectionsOf(s)) {
      if (sec.heading === "(preamble)" && sectionsOf(s).length > 1 && sec.text.trim().length < 400) continue;
      if (!covered.has(`${s}#${sec.heading}`)) problems.push(`coverage: ${s} section "${sec.heading}" has no rubric criterion`);
    }
  }

  const mdFiles: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (["node_modules", ".git", "dist"].includes(e.name)) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".md")) mdFiles.push(p);
    }
  };
  walk(root);
  for (const file of mdFiles) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\]\(([^)\s#]+)(#[^)]*)?\)/g)) {
      const target = m[1]!;
      if (/^(https?:|mailto:)/.test(target)) continue;
      if (!existsSync(resolve(dirname(file), target))) problems.push(`link: ${relative(root, file)} -> ${target} does not exist`);
    }
    for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./-]+)/g)) {
      const target = m[1]!.replace(/[.,;:)]+$/, "");
      if (!existsSync(join(root, target))) problems.push(`ref: ${relative(root, file)} references missing \${CLAUDE_PLUGIN_ROOT}/${target}`);
    }
  }
  problems.push(...lintLibrary(root).problems, ...lintStrictness(root).problems, ...lintTesting(root).problems);
  return problems;
}
