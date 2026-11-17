import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { detectApps } from "./conventions.js";
import { git } from "./git.js";
import type { StoreLocation } from "./paths.js";
import { uncommittedPaths } from "./readonly.js";
import { isTest, scan, SOURCE_EXT, walk, type ScanResult } from "./scan.js";
import type { DimensionId } from "./types.js";

/**
 * What changed since the assessment, in terms of what it invalidates. A
 * commit count says the record is old; this says which judgements are.
 */

export type Snapshot = "conventions" | "strictness" | "testing" | "docs" | "maintenance";

/** One table: a path pattern, the rubric dimensions it can affect, and the snapshots it can make stale. */
const AREAS: { re: RegExp; dims: DimensionId[]; snapshots: Snapshot[]; label: string }[] = [
  { label: "CI configuration", re: /^\.github\/workflows\/|^\.gitlab-ci\.ya?ml$|^\.circleci\/|(^|\/)Jenkinsfile$|^azure-pipelines\.ya?ml$|^bitbucket-pipelines\.ya?ml$|^\.buildkite\//, dims: ["VER", "WF", "SEC"], snapshots: ["maintenance", "strictness"] },
  { label: "agent guidance", re: /(^|\/)(CLAUDE|AGENTS)\.md$|^\.claude\/(rules|skills|agents|commands)\//, dims: ["CTX", "WF"], snapshots: ["docs", "conventions", "maintenance"] },
  { label: "agent settings and hooks", re: /^\.claude\/settings[^/]*\.json$|^\.mcp\.json$/, dims: ["SEC", "WF"], snapshots: ["maintenance"] },
  { label: "documentation", re: /(^|\/)(README|CONTRIBUTING|ARCHITECTURE)[^/]*\.md$|^docs\/|(^|\/)(adr|decisions)\//i, dims: ["CTX"], snapshots: ["docs"] },
  { label: "type-check and lint configuration", re: /(^|\/)(tsconfig[^/]*\.json|\.eslintrc[^/]*|eslint\.config\.[cm]?[jt]s|biome\.jsonc?|ruff\.toml|\.ruff\.toml|mypy\.ini|pyproject\.toml|setup\.cfg|\.golangci\.(ya?ml|toml|json)|clippy\.toml|\.prettierrc[^/]*)$/, dims: ["VER", "ARC"], snapshots: ["strictness"] },
  { label: "suppression baselines", re: /(^|\/)(eslint-suppressions\.json|\.betterer\.results|\.basedpyright\/baseline\.json)$/, dims: ["ARC", "VER"], snapshots: ["strictness"] },
  { label: "architecture boundaries", re: /(^|\/)(\.dependency-cruiser[^/]*|\.importlinter|importlinter\.ini|\.sheriffrc[^/]*|nx\.json)$/, dims: ["ARC"], snapshots: [] },
  { label: "test configuration", re: /(^|\/)((vitest|jest|playwright|cypress)\.config\.[cm]?[jt]s|pytest\.ini|conftest\.py|\.nycrc[^/]*|codecov\.ya?ml)$/, dims: ["VER"], snapshots: ["testing"] },
  { label: "ownership and dependency automation", re: /(^|\/)CODEOWNERS$|^\.github\/dependabot\.ya?ml$|(^|\/)(renovate\.json5?|\.renovaterc[^/]*)$/, dims: ["SEC", "WF"], snapshots: ["maintenance"] },
  { label: "dependencies and toolchain", re: /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock|poetry\.lock|uv\.lock|requirements[^/]*\.txt|Cargo\.(toml|lock)|go\.(mod|sum)|\.nvmrc|\.tool-versions|Dockerfile|devcontainer\.json)$/, dims: ["VER", "SEC"], snapshots: [] },
  { label: "agent evaluations", re: /(^|\/)evals?\//, dims: ["EVAL"], snapshots: [] },
];

export interface ChangedAreas {
  assessedRevision: string | null;
  head: string | null;
  /** False when the assessed revision is not in this repository's history (rebased away, or a different clone). */
  revisionKnown: boolean;
  commits: number;
  committed: string[];
  uncommitted: string[];
  areas: { label: string; dims: DimensionId[]; snapshots: Snapshot[]; paths: string[] }[];
  dimensions: Partial<Record<DimensionId, string[]>>;
  snapshots: Partial<Record<Snapshot, string[]>>;
  /** App roots whose source changed: their conventions and testing judgements are stale. */
  apps: Record<string, string[]>;
}

const lines = (s: string | null) => (s ? s.split("\n").filter(Boolean) : []);

/** `apps: false` skips mapping code to app roots, which walks the repository (kept out of the session-start path). */
export function changedAreas(repoRoot: string, assessedRevision: string | null, opts: { apps?: boolean } = {}): ChangedAreas {
  const head = git(["rev-parse", "HEAD"], repoRoot);
  const revisionKnown = !!assessedRevision && git(["cat-file", "-e", `${assessedRevision}^{commit}`], repoRoot) !== null;
  const committed = revisionKnown && head && head !== assessedRevision ? lines(git(["diff", "--name-only", "--no-renames", `${assessedRevision}`, "HEAD"], repoRoot)) : [];
  const commits = revisionKnown && head ? Number(git(["rev-list", "--count", `${assessedRevision}..HEAD`], repoRoot) ?? 0) : 0;
  const uncommitted = uncommittedPaths(repoRoot).map(([p]) => p);
  const all = [...new Set([...committed, ...uncommitted])].filter((p) => !/^\.agentic(\/|$)/.test(p)).sort();

  const areas: ChangedAreas["areas"] = [];
  const dimensions: ChangedAreas["dimensions"] = {};
  const snapshots: ChangedAreas["snapshots"] = {};
  const add = <K extends string>(m: Partial<Record<K, string[]>>, k: K, p: string) => {
    const xs = (m[k] ??= []);
    if (!xs.includes(p)) xs.push(p);
  };
  for (const a of AREAS) {
    const paths = all.filter((p) => a.re.test(p));
    if (!paths.length) continue;
    areas.push({ label: a.label, dims: a.dims, snapshots: a.snapshots, paths });
    for (const p of paths) {
      for (const d of a.dims) add(dimensions, d, p);
      for (const s of a.snapshots) add(snapshots, s, p);
    }
  }
  const tests = all.filter((p) => SOURCE_EXT.has(extname(p)) && isTest(p));
  if (tests.length) {
    areas.push({ label: "tests", dims: ["VER"], snapshots: ["testing"], paths: tests });
    for (const p of tests) {
      add(dimensions, "VER", p);
      add(snapshots, "testing", p);
    }
  }
  const apps: Record<string, string[]> = {};
  const code = all.filter((p) => SOURCE_EXT.has(extname(p)));
  if (code.length && opts.apps !== false) {
    const { files } = walk(repoRoot);
    const read = (rel: string) => {
      try {
        return readFileSync(join(repoRoot, rel), "utf8");
      } catch {
        return "";
      }
    };
    const roots = detectApps(files, read).map((a) => a.root).sort((a, b) => b.length - a.length);
    for (const p of code) {
      const root = roots.find((r) => r !== "." && p.startsWith(`${r}/`)) ?? (roots.includes(".") ? "." : null);
      if (root) (apps[root] ??= []).push(p);
    }
  }
  {
    const source = code.filter((p) => !isTest(p));
    if (source.length) {
      areas.push({ label: "application code", dims: ["ARC"], snapshots: ["conventions", "testing"], paths: source });
      for (const p of source) {
        add(dimensions, "ARC", p);
        add(snapshots, "conventions", p);
        add(snapshots, "testing", p);
      }
    }
  }
  return { assessedRevision, head, revisionKnown, commits, committed, uncommitted, areas, dimensions, snapshots, apps };
}

const RANK: Record<string, number> = { passed: 2, partial: 1, failed: 0 };

export interface ProbeRegression {
  probe: string;
  was: string;
  now: string;
  evidence: string[];
}

/** Probes whose status is worse now than in the stored scan. Re-runs the read-only scan in memory; writes nothing. */
export function probeRegressions(store: StoreLocation): { scannedAt: string | null; regressions: ProbeRegression[] } {
  if (!existsSync(store.scanPath)) return { scannedAt: null, regressions: [] };
  let stored: ScanResult;
  try {
    stored = JSON.parse(readFileSync(store.scanPath, "utf8")) as ScanResult;
  } catch {
    return { scannedAt: null, regressions: [] };
  }
  const fresh = scan(store.repoRoot);
  const regressions: ProbeRegression[] = [];
  for (const [probe, was] of Object.entries(stored.probes ?? {})) {
    const now = fresh.probes[probe];
    if (!now || RANK[was.status] === undefined || RANK[now.status] === undefined) continue;
    if (RANK[now.status]! < RANK[was.status]!) regressions.push({ probe, was: was.status, now: now.status, evidence: now.evidence });
  }
  return { scannedAt: stored.scannedAt, regressions };
}
