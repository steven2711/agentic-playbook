import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, posix } from "node:path";
import { parse } from "yaml";
import { frontmatterPaths, monthsSince, SIGNALS, type AppInfo } from "./conventions.js";
import { playbookRoot } from "./paths.js";
import { loadRubric } from "./rubric.js";
import type { Tier } from "./strictness.js";

/**
 * The documentation architecture library (reference/docs/*.yaml): which
 * documents a repository and each app should have, where they live, how
 * agents load them and what authority they carry, in cost tiers. Plus
 * read-only detection of what exists, what loads into every session, broken
 * links and repeated instructions. Detection is a hint; the context-auditor
 * confirms it and proposes the target layout.
 */

export const DOC_CONDITIONS = [...SIGNALS, "multi-app", "deployable"] as const;
export const DOC_LOADS = ["always", "path-scoped", "on-demand", "linked", "none"] as const;
export const DOC_AUTHORITIES = ["contract", "fact", "history", "plan", "operation", "generated", "enforcement"] as const;

export interface DocDetector {
  files?: string;
  pattern?: string;
  exclude?: string;
  conventions?: boolean;
}

export interface DocItem {
  id: string;
  artifact: string;
  title: string;
  tier: Tier;
  applies_when?: string[];
  when?: string;
  scope: "repo" | "app";
  purpose: string;
  home: string;
  load: (typeof DOC_LOADS)[number];
  authority: (typeof DOC_AUTHORITIES)[number];
  belongs_here: string;
  not_here?: string;
  detect: DocDetector[];
  see?: string[];
  source: { title: string; url: string };
  area: string;
}

export interface DocArea {
  area: string;
  title: string;
  reviewed: string;
  items: DocItem[];
  not_recommended: { practice: string; reason: string; source?: { title: string; url: string } }[];
  file: string;
  parseError?: string;
}

export interface DocsLibrary {
  areas: DocArea[];
  items: Map<string, DocItem>;
}

const cache = new Map<string, DocsLibrary>();

export function loadDocs(root = playbookRoot()): DocsLibrary {
  const hit = cache.get(root);
  if (hit) return hit;
  const dir = join(root, "reference", "docs");
  const areas: DocArea[] = [];
  const items = new Map<string, DocItem>();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".yaml")).sort()) {
      let raw: Partial<DocArea> = {};
      let parseError: string | undefined;
      try {
        raw = (parse(readFileSync(join(dir, f), "utf8")) ?? {}) as Partial<DocArea>;
      } catch (e) {
        parseError = (e as Error).message.split("\n")[0];
      }
      const a: DocArea = {
        area: String(raw.area ?? ""),
        title: String(raw.title ?? ""),
        reviewed: String(raw.reviewed ?? ""),
        items: [],
        not_recommended: raw.not_recommended ?? [],
        file: `reference/docs/${f}`,
        ...(parseError ? { parseError } : {}),
      };
      for (const i of raw.items ?? []) {
        const item = { ...i, detect: i.detect ?? [], area: a.area } as DocItem;
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

export function lintDocs(root: string, today = new Date()): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  cache.delete(root);
  const lib = loadDocs(root);
  if (!lib.areas.length) return { problems: ["docs: reference/docs has no library files"], warnings };
  const known = new Set<string>(DOC_CONDITIONS);
  const criteria = new Set(loadRubric(root).criteria.map((c) => c.id));
  const seen = new Set<string>();
  for (const a of lib.areas) {
    const where = a.file;
    if (a.parseError) {
      problems.push(`docs: ${where} is not valid YAML: ${a.parseError}`);
      continue;
    }
    if (a.area !== basename(a.file, ".yaml")) problems.push(`docs: ${where} area "${a.area}" does not match its file name`);
    if (!a.title) problems.push(`docs: ${where} has no title`);
    const months = monthsSince(a.reviewed, today);
    if (months === null) problems.push(`docs: ${where} reviewed must be YYYY-MM (got "${a.reviewed}")`);
    else if (months > 12) warnings.push(`docs: ${where} was last reviewed ${a.reviewed} (${months} months ago); re-check its items and sources`);
    if (!a.items.length) problems.push(`docs: ${where} has no items`);
    for (const i of a.items) {
      const at = `${where} ${i.id ?? "(item without id)"}`;
      if (!/^DOC-[A-Z]{3}-\d{2}$/.test(String(i.id ?? ""))) problems.push(`docs: ${at} id must look like DOC-AAA-NN`);
      if (seen.has(i.id)) problems.push(`docs: duplicate item id ${i.id}`);
      seen.add(i.id);
      for (const k of ["artifact", "title", "purpose", "home", "belongs_here"] as const)
        if (!i[k] || typeof i[k] !== "string") problems.push(`docs: ${at} is missing "${k}"`);
      if (![1, 2, 3].includes(i.tier)) problems.push(`docs: ${at} tier must be 1, 2 or 3`);
      if (i.tier > 1 && !i.when) problems.push(`docs: ${at} is Tier ${i.tier} and must say when it is worth it ("when")`);
      if (i.scope !== "repo" && i.scope !== "app") problems.push(`docs: ${at} scope must be repo or app`);
      if (!(DOC_LOADS as readonly string[]).includes(i.load)) problems.push(`docs: ${at} load must be one of ${DOC_LOADS.join(", ")}`);
      if (!(DOC_AUTHORITIES as readonly string[]).includes(i.authority)) problems.push(`docs: ${at} authority must be one of ${DOC_AUTHORITIES.join(", ")}`);
      if (!isHttps(i.source)) problems.push(`docs: ${at} needs a source with a title and an https url`);
      for (const s of i.applies_when ?? []) if (!known.has(s)) problems.push(`docs: ${at} uses unknown condition "${s}"`);
      for (const c of i.see ?? []) if (!criteria.has(c)) problems.push(`docs: ${at} refers to ${c}, which is not a rubric criterion`);
      if (!i.detect.length) problems.push(`docs: ${at} has no detect patterns`);
      for (const d of i.detect) {
        if (d.conventions) {
          if (i.scope !== "app") problems.push(`docs: ${at} detect "conventions" is only valid for scope app`);
          continue;
        }
        if (!d.files) problems.push(`docs: ${at} detect entry is missing "files"`);
        for (const k of ["files", "pattern", "exclude"] as const) {
          if (d[k] === undefined) continue;
          const err = regexProblem(d[k]);
          if (err) problems.push(`docs: ${at} detect ${k} is not a valid JavaScript regex: ${err}`);
        }
      }
    }
    for (const n of a.not_recommended) {
      if (!n.practice || !n.reason) problems.push(`docs: ${where} not_recommended entries need "practice" and "reason"`);
      if (n.source && !isHttps(n.source)) problems.push(`docs: ${where} not_recommended source needs a title and an https url`);
    }
  }
  return { problems, warnings };
}

const applies = (item: DocItem, conds: Set<string>) => !item.applies_when?.length || item.applies_when.some((s) => s === "any" || conds.has(s));

// ------------------------------------------------------------------ detection

export interface DocItemStatus {
  id: string;
  area: string;
  artifact: string;
  tier: Tier;
  /** "repo", or the app root the item was checked for. */
  scope: string;
  status: "present" | "absent";
  count: number;
  paths: string[];
}

export interface DocsScan {
  repoConditions: string[];
  apps: { root: string; conditions: string[] }[];
  items: DocItemStatus[];
  docFiles: string[];
  docFileCount: number;
  alwaysLoaded: { file: string; lines: number }[];
  alwaysLoadedLines: number;
  brokenLinks: string[];
  duplicates: { line: string; files: string[] }[];
}

const DEPLOY = /(^|\/)(Dockerfile[^/]*|docker-compose[^/]*\.ya?ml|compose\.ya?ml|Chart\.yaml|[^/]+\.tf|vercel\.json|fly\.toml|netlify\.toml|Procfile|serverless\.ya?ml|app\.yaml|render\.yaml|railway\.json|cdk\.json|Pulumi\.yaml|skaffold\.yaml)$|(^|\/)(k8s|kubernetes|helm|deploy|infra|terraform)\//;
const DOC_FILE = /\.(md|mdx|rst|adoc)$|(^|\/)(openapi|swagger|asyncapi)[^/]*\.(ya?ml|json)$/i;
const NOT_DOC = /(^|\/)(node_modules|vendor|third_party|fixtures?|__snapshots__|\.changeset)\/|(^|\/)(CHANGELOG|LICENSE|LICENCE|CODE_OF_CONDUCT)(\.md)?$/i;

/** Per-repo and per-app document presence, agent loading, broken links and repeated instructions. Read-only. */
export function assessDocs(
  lib: DocsLibrary,
  apps: AppInfo[],
  files: string[],
  read: (rel: string) => string,
  exists: (rel: string) => boolean = (rel) => files.includes(rel) || files.some((f) => f.startsWith(`${rel.replace(/\/$/, "")}/`)),
): DocsScan {
  const text = new Map<string, string>();
  const get = (f: string) => {
    if (!text.has(f)) text.set(f, read(f));
    return text.get(f)!;
  };
  const multi = apps.length > 1;
  const roots = apps.map((a) => a.root).sort((a, b) => b.length - a.length);
  const ownerOf = (f: string) => roots.find((r) => r !== "." && f.startsWith(`${r}/`)) ?? (roots.includes(".") ? "." : null);
  const ownFiles = (root: string) => files.filter((f) => ownerOf(f) === root);
  const appConds = new Map<string, Set<string>>();
  for (const a of apps) {
    const c = new Set(a.signals);
    if (multi) c.add("multi-app");
    const deployFiles = multi ? ownFiles(a.root) : files;
    if (deployFiles.some((f) => DEPLOY.test(f))) c.add("deployable");
    appConds.set(a.root, c);
  }
  const repoConds = new Set<string>(["any"]);
  for (const c of appConds.values()) for (const s of c) repoConds.add(s);
  if (files.some((f) => DEPLOY.test(f))) repoConds.add("deployable");
  if (multi) repoConds.add("multi-app");

  const match = (item: DocItem, candidates: string[], prefix: string, app?: AppInfo): string[] => {
    const hits = new Set<string>();
    for (const d of item.detect) {
      if (d.conventions) {
        for (const f of app?.conventions ?? []) if (!/^(\.claude\/)?CLAUDE\.md$/.test(f)) hits.add(f);
        continue;
      }
      const fileRe = new RegExp(d.files ?? "$^", "i");
      const ex = d.exclude ? new RegExp(d.exclude, "i") : null;
      const re = d.pattern ? new RegExp(d.pattern, "im") : null;
      for (const f of candidates) {
        const rel = f.slice(prefix.length);
        if (hits.has(f) || !fileRe.test(rel) || (ex && ex.test(rel))) continue;
        if (re && !re.test(get(f))) continue;
        hits.add(f);
      }
    }
    return [...hits].sort();
  };
  const status = (item: DocItem, scope: string, found: string[]): DocItemStatus => ({
    id: item.id,
    area: item.area,
    artifact: item.artifact,
    tier: item.tier,
    scope,
    status: found.length ? "present" : "absent",
    count: found.length,
    paths: found.slice(0, 3),
  });

  const items: DocItemStatus[] = [];
  for (const area of lib.areas) {
    for (const item of area.items) {
      if (item.scope === "repo") {
        if (applies(item, repoConds)) items.push(status(item, "repo", match(item, files, "")));
        continue;
      }
      for (const app of apps) {
        if (!applies(item, appConds.get(app.root)!)) continue;
        const prefix = app.root === "." ? "" : `${app.root}/`;
        items.push(status(item, app.root, match(item, ownFiles(app.root), prefix, app)));
      }
    }
  }

  // What loads into every session: the root CLAUDE.md, its @imports, and rules without paths frontmatter.
  const rootClaude = ["CLAUDE.md", ".claude/CLAUDE.md", "CLAUDE.local.md"].filter((f) => files.includes(f));
  const always = new Set<string>(rootClaude);
  for (const f of rootClaude) {
    for (const m of get(f).matchAll(/(?:^|\s)@([\w./-]+\.\w+)/gm)) {
      const target = posix.normalize(posix.join(dirname(f), m[1]!));
      if (files.includes(target)) always.add(target);
    }
  }
  for (const f of files.filter((x) => /^\.claude\/rules\/.+\.md$/.test(x))) if (!frontmatterPaths(get(f))) always.add(f);
  const alwaysLoaded = [...always].map((file) => ({ file, lines: get(file).split("\n").length }));

  const docFiles = files.filter((f) => DOC_FILE.test(f) && !NOT_DOC.test(f));

  // Relative links in Markdown that do not resolve.
  const brokenLinks: string[] = [];
  for (const md of docFiles.filter((f) => /\.mdx?$/i.test(f)).slice(0, 400)) {
    for (const m of get(md).matchAll(/\]\(([^)\s#]+)(#[^)]*)?\)/g)) {
      const target = m[1]!;
      if (/^([a-z][a-z0-9+.-]*:|\/\/|<)/i.test(target)) continue;
      let decoded = target;
      try {
        decoded = decodeURI(target);
      } catch {
        /* keep raw */
      }
      const rel = decoded.startsWith("/") ? decoded.slice(1) : posix.normalize(posix.join(dirname(md), decoded));
      if (!rel.startsWith("..") && !exists(rel)) brokenLinks.push(`${md} -> ${target}`);
    }
  }

  // Non-trivial instruction lines repeated across agent guidance files.
  const guidance = files.filter((f) => /(^|\/)(CLAUDE|AGENTS)(\.local)?\.md$/.test(f) || /^\.claude\/rules\/.+\.md$/.test(f) || /(^|\/)\.claude\/rules\/.+\.md$/.test(f));
  const lineFiles = new Map<string, Set<string>>();
  for (const f of guidance) {
    for (const raw of get(f).split("\n")) {
      const line = raw.trim().replace(/^([-*+]|\d+\.)\s+/, "").replace(/\s+/g, " ");
      if (line.length < 40 || /^(#|```|\||<!--|---)/.test(line)) continue;
      const set = lineFiles.get(line) ?? new Set<string>();
      set.add(f);
      lineFiles.set(line, set);
    }
  }
  const duplicates = [...lineFiles.entries()]
    .filter(([, s]) => s.size > 1)
    .map(([line, s]) => ({ line: line.length > 120 ? `${line.slice(0, 117)}...` : line, files: [...s].sort() }))
    .slice(0, 20);

  return {
    repoConditions: [...repoConds].sort(),
    apps: apps.map((a) => ({ root: a.root, conditions: [...appConds.get(a.root)!].sort() })),
    items,
    docFiles: docFiles.slice(0, 300),
    docFileCount: docFiles.length,
    alwaysLoaded,
    alwaysLoadedLines: alwaysLoaded.reduce((n, a) => n + a.lines, 0),
    brokenLinks: brokenLinks.slice(0, 50),
    duplicates,
  };
}

/** The docs probe: failed when a Tier 1 item is missing, partial otherwise. The auditor judges the rest. */
export function docsProbe(d: DocsScan): { status: "failed" | "partial"; evidence: string[]; note: string } {
  const t1 = d.items.filter((i) => i.tier === 1);
  const missing = t1.filter((i) => i.status === "absent");
  const present2 = d.items.filter((i) => i.tier > 1 && i.status === "present");
  const absent2 = d.items.filter((i) => i.tier === 2 && i.status === "absent");
  const label = (i: DocItemStatus) => (i.scope === "repo" ? i.artifact : `${i.artifact} (${i.scope})`);
  return {
    status: missing.length ? "failed" : "partial",
    evidence: [
      `Tier 1 documents present ${t1.length - missing.length}/${t1.length}${missing.length ? ` (missing: ${missing.map(label).join(", ")})` : ""}`,
      `Tier 2 and 3 present: ${present2.map(label).join(", ") || "none"}; Tier 2 absent, if its condition holds: ${absent2.map(label).join(", ") || "none"}`,
      `always loaded: ${d.alwaysLoadedLines} lines across ${d.alwaysLoaded.map((a) => `${a.file} (${a.lines})`).join(", ") || "nothing"}`,
      `${d.docFileCount} documentation files; ${d.brokenLinks.length} broken relative links; ${d.duplicates.length} instruction lines repeated across guidance files`,
    ],
    note: "Presence is detected by path and content. The context-auditor confirms it, judges each Tier 2 condition and proposes the target layout. Run `agentic docs` for the full list.",
  };
}
