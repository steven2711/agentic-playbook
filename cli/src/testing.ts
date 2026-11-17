import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import { parse } from "yaml";
import { loadLibrary, monthsSince, SIGNALS, type AppInfo } from "./conventions.js";
import { playbookRoot } from "./paths.js";
import type { Tier } from "./strictness.js";

/**
 * The testing profile library (reference/testing/*.yaml): which test layers
 * each kind of app should have, in cost tiers, and which code is likely
 * critical. Plus read-only detection of the layers, test volume, critical-path
 * candidates and coverage tooling each app already has. Detection is a hint;
 * the test-strategy-auditor confirms it.
 */

export interface LayerDetector {
  files: string;
  pattern?: string;
  exclude?: string;
}

export interface TestLayer {
  id: string;
  layer: string;
  title: string;
  tier: Tier;
  applies_when?: string[];
  when?: string;
  purpose: string;
  belongs_here: string;
  detect: LayerDetector[];
  see?: string[];
  source: { title: string; url: string };
  kind: string;
}

export interface CriticalHint {
  name: string;
  files: string;
  consequence: string;
}

export interface TestingProfile {
  kind: string;
  title: string;
  reviewed: string;
  applies_when: string[];
  layers: TestLayer[];
  critical_path_hints: CriticalHint[];
  not_recommended: { practice: string; reason: string; source?: { title: string; url: string } }[];
  file: string;
  parseError?: string;
}

export interface TestingLibrary {
  profiles: TestingProfile[];
  layers: Map<string, TestLayer>;
}

const cache = new Map<string, TestingLibrary>();

export function loadTesting(root = playbookRoot()): TestingLibrary {
  const hit = cache.get(root);
  if (hit) return hit;
  const dir = join(root, "reference", "testing");
  const profiles: TestingProfile[] = [];
  const layers = new Map<string, TestLayer>();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".yaml")).sort()) {
      let raw: Partial<TestingProfile> = {};
      let parseError: string | undefined;
      try {
        raw = (parse(readFileSync(join(dir, f), "utf8")) ?? {}) as Partial<TestingProfile>;
      } catch (e) {
        parseError = (e as Error).message.split("\n")[0];
      }
      const p: TestingProfile = {
        kind: String(raw.kind ?? ""),
        title: String(raw.title ?? ""),
        reviewed: String(raw.reviewed ?? ""),
        applies_when: raw.applies_when ?? [],
        layers: [],
        critical_path_hints: raw.critical_path_hints ?? [],
        not_recommended: raw.not_recommended ?? [],
        file: `reference/testing/${f}`,
        ...(parseError ? { parseError } : {}),
      };
      for (const l of raw.layers ?? []) {
        const layer = { ...l, detect: l.detect ?? [], kind: p.kind } as TestLayer;
        p.layers.push(layer);
        if (!layers.has(layer.id)) layers.set(layer.id, layer);
      }
      profiles.push(p);
    }
  }
  const lib = { profiles, layers };
  cache.set(root, lib);
  return lib;
}

const isHttps = (s?: { title?: string; url?: string }) => !!s && !!s.title && typeof s.url === "string" && /^https:\/\//.test(s.url);

function regexProblem(value: unknown): string | null {
  try {
    new RegExp(String(value));
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}

export function lintTesting(root: string, today = new Date()): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  cache.delete(root);
  const lib = loadTesting(root);
  if (!lib.profiles.length) return { problems: ["testing: reference/testing has no profile files"], warnings };
  const known = new Set<string>(SIGNALS);
  const conventionRules = loadLibrary(root).rules;
  const seen = new Set<string>();
  for (const p of lib.profiles) {
    const where = p.file;
    if (p.parseError) {
      problems.push(`testing: ${where} is not valid YAML: ${p.parseError}`);
      continue;
    }
    if (p.kind !== basename(p.file, ".yaml")) problems.push(`testing: ${where} kind "${p.kind}" does not match its file name`);
    if (!p.title) problems.push(`testing: ${where} has no title`);
    const months = monthsSince(p.reviewed, today);
    if (months === null) problems.push(`testing: ${where} reviewed must be YYYY-MM (got "${p.reviewed}")`);
    else if (months > 12) warnings.push(`testing: ${where} was last reviewed ${p.reviewed} (${months} months ago); re-check its layers and sources`);
    if (!p.applies_when.length) problems.push(`testing: ${where} has no applies_when`);
    for (const s of p.applies_when) if (!known.has(s)) problems.push(`testing: ${where} uses unknown signal "${s}"`);
    if (!p.layers.some((l) => l.tier === 1)) problems.push(`testing: ${where} has no Tier 1 layer`);
    for (const l of p.layers) {
      const at = `${where} ${l.id ?? "(layer without id)"}`;
      if (!/^TL-[A-Z]+-\d{2}$/.test(String(l.id ?? ""))) problems.push(`testing: ${at} id must look like TL-KIND-NN`);
      if (seen.has(l.id)) problems.push(`testing: duplicate layer id ${l.id}`);
      seen.add(l.id);
      for (const k of ["layer", "title", "purpose", "belongs_here"] as const)
        if (!l[k] || typeof l[k] !== "string") problems.push(`testing: ${at} is missing "${k}"`);
      if (![1, 2, 3].includes(l.tier)) problems.push(`testing: ${at} tier must be 1, 2 or 3`);
      if (l.tier > 1 && !l.when) problems.push(`testing: ${at} is Tier ${l.tier} and must say when it is worth it ("when")`);
      if (!isHttps(l.source)) problems.push(`testing: ${at} needs a source with a title and an https url`);
      for (const s of l.applies_when ?? []) if (!known.has(s)) problems.push(`testing: ${at} uses unknown signal "${s}"`);
      for (const r of l.see ?? []) if (!conventionRules.has(r)) problems.push(`testing: ${at} refers to ${r}, which is not in the conventions library`);
      if (!l.detect.length) problems.push(`testing: ${at} has no detect patterns`);
      for (const d of l.detect) {
        if (!d.files) problems.push(`testing: ${at} detect entry is missing "files"`);
        for (const k of ["files", "pattern", "exclude"] as const) {
          if (d[k] === undefined) continue;
          const err = regexProblem(d[k]);
          if (err) problems.push(`testing: ${at} detect ${k} is not a valid JavaScript regex: ${err}`);
        }
      }
    }
    for (const h of p.critical_path_hints) {
      if (!h.name || !h.files || !h.consequence) problems.push(`testing: ${where} critical_path_hints entries need "name", "files" and "consequence"`);
      const err = regexProblem(h.files);
      if (err) problems.push(`testing: ${where} critical path "${h.name}" files is not a valid JavaScript regex: ${err}`);
    }
    for (const n of p.not_recommended) {
      if (!n.practice || !n.reason) problems.push(`testing: ${where} not_recommended entries need "practice" and "reason"`);
      if (n.source && !isHttps(n.source)) problems.push(`testing: ${where} not_recommended source needs a title and an https url`);
    }
  }
  return { problems, warnings };
}

const matches = (need: readonly string[] | undefined, signals: Set<string>) => !need?.length || need.some((s) => s === "any" || signals.has(s));

/** The profiles that apply to an app, by its stack signals. */
export function profilesFor(lib: TestingLibrary, signals: Set<string>): TestingProfile[] {
  return lib.profiles.filter((p) => matches(p.applies_when, signals));
}

// ------------------------------------------------------------------ detection

export const isTestFile = (f: string) =>
  /(^|\/)(__tests__|tests?|spec|e2e|integration|cypress)\//.test(f) || /\.(test|spec|e2e)\.[a-z]+$/.test(f) || /(^|\/)test_[^/]+\.py$/.test(f) || /_test\.(go|py)$/.test(f) || /Tests?\.(java|kt)$/.test(f);

const CODE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts", ".py", ".go", ".rs", ".java", ".kt", ".vue", ".svelte", ".sql"]);
const NOT_SOURCE = /(^|\/)(vendor|third_party|generated|__generated__|node_modules|dist|build|fixtures?|__mocks__|__snapshots__|migrations?|alembic)\/|\.d\.ts$|\.config\.[cm]?[jt]s$|\.stories\.[jt]sx?$/;

export interface LayerStatus {
  id: string;
  layer: string;
  title: string;
  tier: Tier;
  kind: string;
  status: "present" | "absent";
  count: number;
  examples: string[];
}

export interface CriticalCandidate {
  file: string;
  name: string;
  consequence: string;
  referencedBy: string[];
}

export interface AppTesting {
  root: string;
  kinds: string[];
  runners: string[];
  sourceFiles: number;
  testFiles: number;
  untestedDirs: string[];
  layers: LayerStatus[];
  criticalCandidates: CriticalCandidate[];
  coverage: string[];
}

const RUNNERS: [string, RegExp][] = [
  ["vitest", /"vitest"/],
  ["jest", /"jest"/],
  ["mocha", /"mocha"/],
  ["node:test", /node --test|"test":\s*"[^"]*node:test/],
  ["playwright", /"@playwright\/test"/],
  ["cypress", /"cypress"/],
  ["pytest", /\bpytest\b/],
  ["unittest", /python -m unittest/],
  ["junit", /junit/i],
  ["go test", /^module /m],
  ["cargo test", /^\[package\]/m],
];

const COVERAGE = /(coverageThreshold|thresholds\s*:|coverage\s*:\s*\{|--coverage|\bc8\b|\bnyc\b|pytest-cov|--cov\b|\[tool\.coverage|fail_under|diff-cover|diff_cover|codecov|coveralls|jacoco|-coverprofile|tarpaulin|llvm-cov)/;

/** Per-app layers, volume, critical-path candidates and coverage tooling. Read-only. */
export function assessTesting(lib: TestingLibrary, apps: AppInfo[], files: string[], read: (rel: string) => string): AppTesting[] {
  const text = new Map<string, string>();
  const get = (f: string) => {
    if (!text.has(f)) text.set(f, read(f));
    return text.get(f)!;
  };
  const roots = apps.map((a) => a.root).sort((a, b) => b.length - a.length);
  const ownerOf = (f: string) => roots.find((r) => r !== "." && f.startsWith(`${r}/`)) ?? (roots.includes(".") ? "." : null);
  const ci = files.filter((f) => /^(\.github\/workflows\/[^/]+|\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.yml|Jenkinsfile)$/.test(f));
  const rootCoverage = files.filter((f) => /^(codecov\.ya?ml|\.codecov\.ya?ml|\.coveralls\.ya?ml|\.coveragerc)$/.test(f));

  return apps.map((app) => {
    const prefix = app.root === "." ? "" : `${app.root}/`;
    const own = files.filter((f) => ownerOf(f) === app.root);
    const rel = (f: string) => f.slice(prefix.length);
    const signals = new Set(app.signals);
    const profiles = profilesFor(lib, signals);
    const tests = own.filter((f) => CODE_EXT.has(extname(f)) && isTestFile(rel(f)));
    const sources = own.filter((f) => CODE_EXT.has(extname(f)) && !isTestFile(rel(f)) && !NOT_SOURCE.test(rel(f)) && extname(f) !== ".sql");

    const layers = profiles.flatMap((p) =>
      p.layers.filter((l) => matches(l.applies_when, signals)).map((l): LayerStatus => {
        const hits = new Set<string>();
        for (const d of l.detect) {
          const fileRe = new RegExp(d.files);
          const ex = d.exclude ? new RegExp(d.exclude) : null;
          const re = d.pattern ? new RegExp(d.pattern, "m") : null;
          for (const f of own) {
            if (hits.has(f) || !fileRe.test(rel(f)) || (ex && ex.test(rel(f)))) continue;
            if (re && !re.test(get(f))) continue;
            hits.add(f);
          }
        }
        const found = [...hits].sort();
        return { id: l.id, layer: l.layer, title: l.title, tier: l.tier, kind: l.kind, status: found.length ? "present" : "absent", count: found.length, examples: found.slice(0, 3) };
      }),
    );

    // Top-level source directories (one or two levels in) with code but no tests anywhere beneath them.
    const groupOf = (f: string) => {
      const parts = rel(f).split("/");
      if (parts.length < 2) return null;
      return ["src", "app", "lib", "pkg", "internal", "packages"].includes(parts[0]!) && parts.length > 2 ? `${prefix}${parts[0]}/${parts[1]}` : `${prefix}${parts[0]}`;
    };
    const srcGroups = new Map<string, number>();
    for (const f of sources) {
      const g = groupOf(f);
      if (g) srcGroups.set(g, (srcGroups.get(g) ?? 0) + 1);
    }
    const testStems = new Set(tests.map(stem));
    const testedGroup = (g: string) => tests.some((t) => t.startsWith(`${g}/`)) || sources.some((s) => s.startsWith(`${g}/`) && testStems.has(stem(s)));
    const untestedDirs = [...srcGroups.entries()].filter(([g, n]) => n >= 2 && !testedGroup(g)).map(([g]) => g).sort();

    const testText = tests.slice(0, 3000).map((t) => [t, get(t).slice(0, 200_000)] as const);
    const seenCritical = new Set<string>();
    const criticalCandidates: CriticalCandidate[] = [];
    for (const p of profiles) {
      for (const h of p.critical_path_hints) {
        const re = new RegExp(h.files);
        for (const f of own) {
          const migration = /(^|\/)(migrations?|alembic)\//.test(rel(f));
          if (seenCritical.has(f) || isTestFile(rel(f)) || (NOT_SOURCE.test(rel(f)) && !migration) || !re.test(rel(f))) continue;
          seenCritical.add(f);
          const s = stem(f);
          const generic = ["index", "route", "page", "mod", "main", "__init__", "handler", "lib"].includes(s);
          const name = generic ? basename(dirname(f)).toLowerCase() : s;
          const nameRe = new RegExp(`(^|[^A-Za-z0-9])${escapeRe(name)}([^A-Za-z0-9]|$)`, "i");
          const referencedBy = testText.filter(([t, body]) => stem(t) === name || nameRe.test(body)).map(([t]) => t).slice(0, 3);
          criticalCandidates.push({ file: f, name: h.name, consequence: h.consequence, referencedBy });
        }
      }
    }

    const manifestText = own.filter((f) => /(^|\/)(package\.json|pyproject\.toml|setup\.cfg|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|requirements[^/]*\.txt)$/.test(f) && dirname(f) === (app.root === "." ? "." : app.root)).map(get).join("\n");
    const runners = RUNNERS.filter(([, re]) => re.test(manifestText)).map(([n]) => n);
    if (tests.some((t) => t.endsWith("_test.go")) && !runners.includes("go test")) runners.push("go test");
    const configs = own.filter((f) => /(^|\/)(vitest|jest|playwright)\.config\.[cm]?[jt]s$|(^|\/)(pyproject\.toml|setup\.cfg|\.coveragerc|tox\.ini|package\.json)$/.test(f) && !isTestFile(rel(f)));
    const coverage = [
      ...configs.filter((f) => COVERAGE.test(get(f))).map((f) => `${f}: coverage configured`),
      ...rootCoverage.map((f) => `${f}: coverage service`),
      ...ci.filter((f) => COVERAGE.test(get(f))).map((f) => `${f}: coverage step in CI`),
    ];

    return {
      root: app.root,
      kinds: profiles.map((p) => p.kind),
      runners,
      sourceFiles: sources.length,
      testFiles: tests.length,
      untestedDirs,
      layers,
      criticalCandidates: criticalCandidates.slice(0, 40),
      coverage,
    };
  });
}

function stem(f: string): string {
  return basename(f).replace(/\.[^.]+$/, "").replace(/(\.(test|spec|e2e|int|integration))+$/, "").replace(/^test_|_test$|Tests?$/, "").toLowerCase();
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
