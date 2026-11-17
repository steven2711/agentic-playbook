import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";
import { monthsSince } from "./conventions.js";
import { loadDocs } from "./docs.js";
import { playbookRoot } from "./paths.js";
import { loadRubric } from "./rubric.js";
import type { Tier } from "./strictness.js";
import type { CriterionState } from "./types.js";

/**
 * The maintenance library (reference/maintenance/*.yaml): the janitors a
 * repository can run to find and correct drift, each guarding a contract and
 * waiting on prerequisite criteria, in cost tiers. Plus read-only detection
 * of janitors already set up and of where they could run. Detection is a
 * hint; the workflow-auditor confirms it and proposes the roster.
 */

export const JAN_TRIGGERS = ["pr", "schedule", "event"] as const;

export interface JanitorDetector {
  files: string;
  pattern?: string;
  exclude?: string;
}

export interface Janitor {
  id: string;
  title: string;
  tier: Tier;
  when?: string;
  trigger: (typeof JAN_TRIGGERS)[number][];
  guards: string[];
  prerequisites: string[];
  purpose: string;
  detector: string[];
  agent_step?: string;
  autofix: string;
  /** high: the autofix can remove tests, code or merge changes, so it can weaken what it guards. */
  autofix_risk: "low" | "high";
  /** Conditions the janitor's own setup must enforce before its autofix may act. Required for high risk. */
  safeguards?: string[];
  needs_human: string;
  noise_controls: string;
  success: string;
  detect: JanitorDetector[];
  see?: string[];
  source: { title: string; url: string };
  area: string;
}

export interface JanitorArea {
  area: string;
  title: string;
  reviewed: string;
  items: Janitor[];
  not_recommended: { practice: string; reason: string; source?: { title: string; url: string } }[];
  file: string;
  parseError?: string;
}

export interface MaintenanceLibrary {
  areas: JanitorArea[];
  items: Map<string, Janitor>;
}

const cache = new Map<string, MaintenanceLibrary>();

export function loadMaintenance(root = playbookRoot()): MaintenanceLibrary {
  const hit = cache.get(root);
  if (hit) return hit;
  const dir = join(root, "reference", "maintenance");
  const areas: JanitorArea[] = [];
  const items = new Map<string, Janitor>();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".yaml")).sort()) {
      let raw: Partial<JanitorArea> = {};
      let parseError: string | undefined;
      try {
        raw = (parse(readFileSync(join(dir, f), "utf8")) ?? {}) as Partial<JanitorArea>;
      } catch (e) {
        parseError = (e as Error).message.split("\n")[0];
      }
      const a: JanitorArea = {
        area: String(raw.area ?? ""),
        title: String(raw.title ?? ""),
        reviewed: String(raw.reviewed ?? ""),
        items: [],
        not_recommended: raw.not_recommended ?? [],
        file: `reference/maintenance/${f}`,
        ...(parseError ? { parseError } : {}),
      };
      for (const i of raw.items ?? []) {
        const item = { ...i, trigger: i.trigger ?? [], guards: i.guards ?? [], prerequisites: i.prerequisites ?? [], detector: i.detector ?? [], detect: i.detect ?? [], area: a.area } as Janitor;
        a.items.push(item);
        if (!items.has(item.id)) items.set(item.id, item);
      }
      areas.push(a);
    }
  }
  const lib = { areas, items };
  cache.set(root, lib);
  return lib;
}

const isHttps = (s?: { title?: string; url?: string }) => !!s && !!s.title && typeof s.url === "string" && /^https:\/\//.test(s.url);

function regexProblem(value: unknown): string | null {
  try {
    new RegExp(String(value), "i");
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function lintMaintenance(root: string, today = new Date()): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  cache.delete(root);
  const lib = loadMaintenance(root);
  if (!lib.areas.length) return { problems: ["maintenance: reference/maintenance has no library files"], warnings };
  const criteria = new Set(loadRubric(root).criteria.map((c) => c.id));
  const docItems = new Set(loadDocs(root).items.keys());
  const seen = new Set<string>();
  for (const a of lib.areas) {
    const where = a.file;
    if (a.parseError) {
      problems.push(`maintenance: ${where} is not valid YAML: ${a.parseError}`);
      continue;
    }
    if (a.area !== basename(a.file, ".yaml")) problems.push(`maintenance: ${where} area "${a.area}" does not match its file name`);
    if (!a.title) problems.push(`maintenance: ${where} has no title`);
    const months = monthsSince(a.reviewed, today);
    if (months === null) problems.push(`maintenance: ${where} reviewed must be YYYY-MM (got "${a.reviewed}")`);
    else if (months > 12) warnings.push(`maintenance: ${where} was last reviewed ${a.reviewed} (${months} months ago); re-check its items and sources`);
    if (!a.items.length) problems.push(`maintenance: ${where} has no items`);
    for (const i of a.items) {
      const at = `${where} ${i.id ?? "(item without id)"}`;
      if (!/^JAN-[A-Z]{3}-\d{2}$/.test(String(i.id ?? ""))) problems.push(`maintenance: ${at} id must look like JAN-AAA-NN`);
      if (seen.has(i.id)) problems.push(`maintenance: duplicate item id ${i.id}`);
      seen.add(i.id);
      for (const k of ["title", "purpose", "autofix", "needs_human", "noise_controls", "success"] as const)
        if (!i[k] || typeof i[k] !== "string") problems.push(`maintenance: ${at} is missing "${k}"`);
      if (![1, 2, 3].includes(i.tier)) problems.push(`maintenance: ${at} tier must be 1, 2 or 3`);
      if (i.autofix_risk !== "low" && i.autofix_risk !== "high") problems.push(`maintenance: ${at} autofix_risk must be low or high`);
      if (i.safeguards !== undefined && (!Array.isArray(i.safeguards) || i.safeguards.some((g) => typeof g !== "string" || !g.trim())))
        problems.push(`maintenance: ${at} safeguards must be a list of non-empty strings`);
      if (i.autofix_risk === "high" && !i.safeguards?.length)
        problems.push(`maintenance: ${at} has a high-risk autofix and must list the safeguards that keep it from weakening what it guards`);
      if (i.tier > 1 && !i.when) problems.push(`maintenance: ${at} is Tier ${i.tier} and must say when it is worth it ("when")`);
      if (!Array.isArray(i.trigger) || !i.trigger.length) problems.push(`maintenance: ${at} needs at least one trigger`);
      for (const t of i.trigger ?? []) if (!(JAN_TRIGGERS as readonly string[]).includes(t)) problems.push(`maintenance: ${at} trigger must be one of ${JAN_TRIGGERS.join(", ")} (got "${t}")`);
      if (!i.detector.length) problems.push(`maintenance: ${at} needs at least one deterministic detector`);
      if (!i.guards.length) problems.push(`maintenance: ${at} must say what it guards`);
      for (const g of i.guards) if (!criteria.has(g) && !docItems.has(g)) problems.push(`maintenance: ${at} guards ${g}, which is not a rubric criterion or documentation item`);
      for (const p of i.prerequisites) if (!criteria.has(p)) problems.push(`maintenance: ${at} prerequisite ${p} is not a rubric criterion`);
      for (const c of i.see ?? []) if (!criteria.has(c)) problems.push(`maintenance: ${at} refers to ${c}, which is not a rubric criterion`);
      if (!isHttps(i.source)) problems.push(`maintenance: ${at} needs a source with a title and an https url`);
      if (!i.detect.length) problems.push(`maintenance: ${at} has no detect patterns`);
      for (const d of i.detect) {
        if (!d.files) problems.push(`maintenance: ${at} detect entry is missing "files"`);
        for (const k of ["files", "pattern", "exclude"] as const) {
          if (d[k] === undefined) continue;
          const err = regexProblem(d[k]);
          if (err) problems.push(`maintenance: ${at} detect ${k} is not a valid JavaScript regex: ${err}`);
        }
      }
    }
    for (const n of a.not_recommended) {
      if (!n.practice || !n.reason) problems.push(`maintenance: ${where} not_recommended entries need "practice" and "reason"`);
      if (n.source && !isHttps(n.source)) problems.push(`maintenance: ${where} not_recommended source needs a title and an https url`);
    }
  }
  return { problems, warnings };
}

// ------------------------------------------------------------------ detection

export interface JanitorStatus {
  id: string;
  title: string;
  tier: Tier;
  trigger: string[];
  status: "present" | "absent";
  paths: string[];
  /** Each prerequisite with its status in the record, or "unknown" without one. */
  prerequisites: { id: string; status: string }[];
  /** True when every prerequisite has passed; null when there is no record to tell. */
  prerequisitesMet: boolean | null;
}

export interface MaintenanceScan {
  /** Places a janitor could run, found in the repository. The auditor never assumes one. */
  runners: string[];
  items: JanitorStatus[];
}

const RUNNERS: [string, RegExp][] = [
  ["GitHub Actions", /^\.github\/workflows\/.+\.ya?ml$/],
  ["GitLab CI", /^\.gitlab-ci\.ya?ml$/],
  ["CircleCI", /^\.circleci\/config\.ya?ml$/],
  ["Jenkins", /(^|\/)Jenkinsfile$/],
  ["Azure Pipelines", /^azure-pipelines\.ya?ml$/],
  ["Bitbucket Pipelines", /^bitbucket-pipelines\.ya?ml$/],
  ["Buildkite", /^\.buildkite\//],
  ["Claude Code subagents", /^\.claude\/agents\/.+\.md$/],
  ["Claude Code skills", /^\.claude\/skills\/.+\/SKILL\.md$/],
];

/** Which janitors already exist, whether their prerequisites pass, and where they could run. Read-only. */
export function assessMaintenance(lib: MaintenanceLibrary, files: string[], read: (rel: string) => string, criteria?: CriterionState[]): MaintenanceScan {
  const text = new Map<string, string>();
  const get = (f: string) => {
    if (!text.has(f)) text.set(f, read(f));
    return text.get(f)!;
  };
  const runners = RUNNERS.filter(([, re]) => files.some((f) => re.test(f))).map(([n]) => n);
  if (files.includes(".claude/settings.json") && /"hooks"\s*:/.test(get(".claude/settings.json"))) runners.push("Claude Code hooks");
  const state = new Map((criteria ?? []).map((c) => [c.id, c.status]));
  const items: JanitorStatus[] = [];
  for (const area of lib.areas) {
    for (const j of area.items) {
      const hits = new Set<string>();
      for (const d of j.detect) {
        const fileRe = new RegExp(d.files, "i");
        const ex = d.exclude ? new RegExp(d.exclude, "i") : null;
        const re = d.pattern ? new RegExp(d.pattern, "im") : null;
        for (const f of files) {
          if (hits.has(f) || !fileRe.test(f) || (ex && ex.test(f))) continue;
          if (re && !re.test(get(f))) continue;
          hits.add(f);
        }
      }
      const prerequisites = j.prerequisites.map((id) => ({ id, status: criteria ? (state.get(id) ?? "unverified") : "unknown" }));
      items.push({
        id: j.id,
        title: j.title,
        tier: j.tier,
        trigger: j.trigger,
        status: hits.size ? "present" : "absent",
        paths: [...hits].sort().slice(0, 3),
        prerequisites,
        // Only passed counts: n_a means the contract the janitor guards does not exist here.
        prerequisitesMet: criteria ? prerequisites.every((p) => p.status === "passed") : null,
      });
    }
  }
  return { runners, items };
}

/** The maintenance probe: always partial. Janitors are L4 work; the workflow-auditor judges the roster. */
export function maintenanceProbe(m: MaintenanceScan): { status: "partial"; evidence: string[]; note: string } {
  const present = m.items.filter((i) => i.status === "present");
  return {
    status: "partial",
    evidence: [
      `janitors detected: ${present.map((i) => `${i.id} ${i.title} (${i.paths.join(", ")})`).join("; ") || "none"}`,
      `places a janitor could run: ${m.runners.join(", ") || "none found"}`,
    ],
    note: "Detection is by file name and workflow content. The workflow-auditor confirms it and proposes which janitors to set up, after which prerequisites. Run `agentic maintenance` for the full list.",
  };
}
