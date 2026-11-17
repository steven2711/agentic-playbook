import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parse } from "yaml";
import { monthsSince, SIGNALS, type AppInfo } from "./conventions.js";
import { playbookRoot } from "./paths.js";

/**
 * The strictness profile library (reference/strictness/*.yaml): which
 * deterministic checks are worth turning on for each stack, in cost tiers, and
 * which are deliberately not recommended. Plus read-only detection of which
 * checks a repository already runs and how many inline suppressions it has.
 */

export type Tier = 1 | 2 | 3;

export interface Detector {
  files: string;
  pattern: string;
}

export interface StrictnessCheck {
  id: string;
  title: string;
  tier: Tier;
  applies_when?: string[];
  when?: string;
  slop_prevented: string;
  enable: string;
  detect: Detector[];
  ratchet: string;
  cost: string;
  source: { title: string; url: string };
  stack: string;
}

export interface NotRecommended {
  practice: string;
  reason: string;
  source?: { title: string; url: string };
}

export interface StrictnessProfile {
  stack: string;
  title: string;
  reviewed: string;
  applies_when: string[];
  checks: StrictnessCheck[];
  not_recommended: NotRecommended[];
  file: string;
  parseError?: string;
}

export interface StrictnessLibrary {
  profiles: StrictnessProfile[];
  checks: Map<string, StrictnessCheck>;
}

const cache = new Map<string, StrictnessLibrary>();

export function loadStrictness(root = playbookRoot()): StrictnessLibrary {
  const hit = cache.get(root);
  if (hit) return hit;
  const dir = join(root, "reference", "strictness");
  const profiles: StrictnessProfile[] = [];
  const checks = new Map<string, StrictnessCheck>();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".yaml")).sort()) {
      let raw: Partial<StrictnessProfile> = {};
      let parseError: string | undefined;
      try {
        raw = (parse(readFileSync(join(dir, f), "utf8")) ?? {}) as Partial<StrictnessProfile>;
      } catch (e) {
        parseError = (e as Error).message.split("\n")[0];
      }
      const p: StrictnessProfile = {
        stack: String(raw.stack ?? ""),
        title: String(raw.title ?? ""),
        reviewed: String(raw.reviewed ?? ""),
        applies_when: raw.applies_when ?? [],
        checks: [],
        not_recommended: raw.not_recommended ?? [],
        file: `reference/strictness/${f}`,
        ...(parseError ? { parseError } : {}),
      };
      for (const c of raw.checks ?? []) {
        const check = { ...c, detect: c.detect ?? [], stack: p.stack } as StrictnessCheck;
        p.checks.push(check);
        if (!checks.has(check.id)) checks.set(check.id, check);
      }
      profiles.push(p);
    }
  }
  const lib = { profiles, checks };
  cache.set(root, lib);
  return lib;
}

const isHttps = (s?: { title?: string; url?: string }) => !!s && !!s.title && typeof s.url === "string" && /^https:\/\//.test(s.url);

export function lintStrictness(root: string, today = new Date()): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  cache.delete(root);
  const lib = loadStrictness(root);
  if (!lib.profiles.length) return { problems: ["strictness: reference/strictness has no profile files"], warnings };
  const known = new Set<string>(SIGNALS);
  const seen = new Set<string>();
  for (const p of lib.profiles) {
    const where = p.file;
    if (p.parseError) {
      problems.push(`strictness: ${where} is not valid YAML: ${p.parseError}`);
      continue;
    }
    if (p.stack !== basename(p.file, ".yaml")) problems.push(`strictness: ${where} stack "${p.stack}" does not match its file name`);
    if (!p.title) problems.push(`strictness: ${where} has no title`);
    const months = monthsSince(p.reviewed, today);
    if (months === null) problems.push(`strictness: ${where} reviewed must be YYYY-MM (got "${p.reviewed}")`);
    else if (months > 12) warnings.push(`strictness: ${where} was last reviewed ${p.reviewed} (${months} months ago); re-check its checks and sources`);
    if (!p.applies_when.length) problems.push(`strictness: ${where} has no applies_when`);
    for (const s of p.applies_when) if (!known.has(s)) problems.push(`strictness: ${where} uses unknown signal "${s}"`);
    if (!p.checks.length) problems.push(`strictness: ${where} has no checks`);
    for (const c of p.checks) {
      const at = `${where} ${c.id ?? "(check without id)"}`;
      if (!/^STR-[A-Z]+-\d{2}$/.test(String(c.id ?? ""))) problems.push(`strictness: ${at} id must look like STR-STACK-NN`);
      if (seen.has(c.id)) problems.push(`strictness: duplicate check id ${c.id}`);
      seen.add(c.id);
      for (const k of ["title", "slop_prevented", "enable", "ratchet", "cost"] as const)
        if (!c[k] || typeof c[k] !== "string") problems.push(`strictness: ${at} is missing "${k}"`);
      if (![1, 2, 3].includes(c.tier)) problems.push(`strictness: ${at} tier must be 1, 2 or 3`);
      if (c.tier > 1 && !c.when) problems.push(`strictness: ${at} is Tier ${c.tier} and must say when it is worth it ("when")`);
      if (!isHttps(c.source)) problems.push(`strictness: ${at} needs a source with a title and an https url`);
      for (const s of c.applies_when ?? []) if (!known.has(s)) problems.push(`strictness: ${at} uses unknown signal "${s}"`);
      if (!c.detect.length) problems.push(`strictness: ${at} has no detect patterns`);
      for (const d of c.detect) {
        for (const k of ["files", "pattern"] as const) {
          try {
            new RegExp(String(d[k] ?? ""));
            if (!d[k]) problems.push(`strictness: ${at} detect entry is missing "${k}"`);
          } catch (e) {
            problems.push(`strictness: ${at} detect ${k} is not a valid JavaScript regex: ${(e as Error).message}`);
          }
        }
      }
    }
    for (const n of p.not_recommended) {
      if (!n.practice || !n.reason) problems.push(`strictness: ${where} not_recommended entries need "practice" and "reason"`);
      if (n.source && !isHttps(n.source)) problems.push(`strictness: ${where} not_recommended source needs a title and an https url`);
    }
  }
  return { problems, warnings };
}

const matches = (need: readonly string[] | undefined, signals: Set<string>) => !need?.length || need.some((s) => s === "any" || signals.has(s));

export function applicableChecks(lib: StrictnessLibrary, signals: Set<string>): StrictnessCheck[] {
  return lib.profiles.filter((p) => matches(p.applies_when, signals)).flatMap((p) => p.checks.filter((c) => matches(c.applies_when, signals)));
}

// ------------------------------------------------------------------ detection

export interface CheckStatus {
  id: string;
  title: string;
  tier: Tier;
  status: "on" | "off";
  evidence?: string;
}

export interface AppStrictness {
  root: string;
  checks: CheckStatus[];
}

const SHARED_CONFIG_DIR = /(^|\/)packages\/[^/]*(config|tsconfig|eslint|lint)[^/]*\//;
const ALWAYS_CANDIDATE = /^(\.github\/workflows\/[^/]+|\.gitlab-ci\.yml|\.claude\/settings[^/]*\.json|\.husky\/[^/]+|\.pre-commit-config\.yaml|lefthook\.ya?ml|\.lefthook\.ya?ml|Makefile|justfile)$/;

/** Config files that can configure a given app: its own directory, the repository root, shared config packages, CI and hooks. */
function candidates(files: string[], root: string): string[] {
  return files.filter((f) => {
    const d = dirname(f);
    return d === root || d === "." || ALWAYS_CANDIDATE.test(f) || SHARED_CONFIG_DIR.test(f) || (root !== "." && d.startsWith(`${root}/`) && d.split("/").length - root.split("/").length <= 1 && /config|\.husky|\.claude/.test(d));
  });
}

export function assessStrictness(lib: StrictnessLibrary, apps: AppInfo[], files: string[], read: (rel: string) => string): AppStrictness[] {
  const text = new Map<string, string>();
  const get = (f: string) => {
    if (!text.has(f)) text.set(f, read(f));
    return text.get(f)!;
  };
  return apps.map((app) => {
    const pool = candidates(files, app.root);
    const checks = applicableChecks(lib, new Set(app.signals)).map((c): CheckStatus => {
      for (const d of c.detect) {
        const fileRe = new RegExp(d.files);
        const re = new RegExp(d.pattern, "m");
        const hit = pool.find((f) => fileRe.test(f) && re.test(get(f)));
        if (hit) return { id: c.id, title: c.title, tier: c.tier, status: "on", evidence: hit };
      }
      return { id: c.id, title: c.title, tier: c.tier, status: "off" };
    });
    return { root: app.root, checks };
  });
}

// ------------------------------------------------------------------ inline suppressions

export interface SuppressionCount {
  total: number;
  undescribed: number;
}

export interface SuppressionReport {
  byApp: Record<string, Record<string, SuppressionCount>>;
  total: number;
  undescribed: number;
  descriptionRules: string[];
  baselines: string[];
  filesScanned: number;
  truncated: boolean;
}

/** Each kind: a global regex and a test for whether one match carries a reason or a specific rule. */
const KINDS: { kind: string; re: RegExp; described: (m: RegExpExecArray) => boolean }[] = [
  { kind: "eslint-disable", re: /(?:\/\/|\/\*)\s*eslint-disable(?:-next-line|-line)?\b([^\n]*)/g, described: (m) => /\s--\s*\S/.test(m[1] ?? "") },
  { kind: "ts-directive", re: /@ts-(ignore|expect-error|nocheck)\b([^\n]*)/g, described: (m) => m[1] === "expect-error" && /\S{3,}/.test((m[2] ?? "").replace(/\*\/.*/, "")) },
  { kind: "type-ignore", re: /#\s*(?:type|pyright):\s*ignore(\[[^\]]+\])?/g, described: (m) => !!m[1] },
  { kind: "noqa", re: /#\s*noqa\b(:\s*[A-Z]+\d+)?/gi, described: (m) => !!m[1] },
  { kind: "nolint", re: /\/\/\s*nolint\b(:[\w,-]+)?([^\n]*)/g, described: (m) => !!m[1] && /\/\/\s*\S/.test(m[2] ?? "") },
  { kind: "rust-allow", re: /#!?\[(?:allow|expect)\(([^\]]*)\]/g, described: (m) => /reason\s*=/.test(m[1] ?? "") },
  { kind: "java-suppress", re: /@SuppressWarnings\(/g, described: () => false },
  { kind: "skipped-test", re: /\b(?:it|test|describe)\.skip\s*\(|\bx(?:it|describe|test)\s*\(|@pytest\.mark\.skip\b|\bt\.Skip(?:Now|f)?\(|@Disabled\b|#\[ignore\]/g, described: () => false },
  { kind: "focused-test", re: /\b(?:it|test|describe)\.only\s*\(|\bf(?:it|describe)\s*\(/g, described: () => false },
];

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".py", ".go", ".rs", ".java", ".kt", ".vue", ".svelte"]);
const MAX_SUPPRESSION_FILES = 15000;

export function countSuppressions(apps: AppInfo[], files: string[], read: (rel: string) => string): SuppressionReport {
  const roots = apps.map((a) => a.root).sort((a, b) => b.length - a.length);
  const ownerOf = (f: string) => roots.find((r) => r !== "." && f.startsWith(`${r}/`)) ?? (roots.includes(".") ? "." : null);
  const byApp: Record<string, Record<string, SuppressionCount>> = {};
  const code = files.filter((f) => CODE_EXT.has(extname(f)) && !/\.d\.ts$/.test(f) && !/(^|\/)(vendor|third_party|generated|__generated__)\//.test(f));
  const scanned = code.slice(0, MAX_SUPPRESSION_FILES);
  let total = 0;
  let undescribed = 0;
  for (const f of scanned) {
    const owner = ownerOf(f);
    if (owner === null) continue;
    const src = read(f);
    if (!src || src.length > 1_000_000) continue;
    for (const k of KINDS) {
      k.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = k.re.exec(src))) {
        const bucket = ((byApp[owner] ??= {})[k.kind] ??= { total: 0, undescribed: 0 });
        bucket.total++;
        total++;
        if (!k.described(m)) {
          bucket.undescribed++;
          undescribed++;
        }
      }
    }
  }
  const configs = files.filter((f) => /(^|\/)(\.eslintrc[^/]*|eslint\.config\.[cm]?[jt]s|pyproject\.toml|ruff\.toml|mypy\.ini|setup\.cfg|\.golangci\.(ya?ml|toml|json)|Cargo\.toml|clippy\.toml)$/.test(f));
  const descriptionRules = new Set<string>();
  for (const f of configs) {
    const t = read(f);
    if (/eslint-comments\/require-description/.test(t)) descriptionRules.add(`${f}: eslint-comments/require-description`);
    if (/ban-ts-comment|tseslint\.configs\.|plugin:@typescript-eslint\//.test(t)) descriptionRules.add(`${f}: @typescript-eslint/ban-ts-comment`);
    if (/"PGH|"ALL"/.test(t)) descriptionRules.add(`${f}: ruff PGH`);
    if (/ignore-without-code/.test(t)) descriptionRules.add(`${f}: mypy ignore-without-code`);
    if (/nolintlint/.test(t)) descriptionRules.add(`${f}: nolintlint`);
    if (/allow_attributes_without_reason/.test(t)) descriptionRules.add(`${f}: clippy::allow_attributes_without_reason`);
  }
  const baselines = files.filter((f) => /(^|\/)(eslint-suppressions\.json|\.betterer\.results|\.basedpyright\/baseline\.json)$/.test(f));
  for (const f of files.filter((x) => /(^|\/)\.golangci\.(ya?ml|toml|json)$/.test(x))) if (/new-from-(merge-base|rev|patch)/.test(read(f))) baselines.push(`${f} (new-from)`);
  return { byApp, total, undescribed, descriptionRules: [...descriptionRules].sort(), baselines, filesScanned: scanned.length, truncated: code.length > scanned.length };
}
