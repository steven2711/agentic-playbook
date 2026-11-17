import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { applicableRules, detectApps, lintLibrary, loadLibrary } from "./conventions.js";
import { commitsSince, headRevision } from "./git.js";
import { lintPlaybook } from "./lint.js";
import { locateStore, playbookRoot, type StoreLocation } from "./paths.js";
import { changedAreas, probeRegressions } from "./drift.js";
import { beginWindow, endWindow, liveLock, writeRefusal } from "./readonly.js";
import { createRecord, loadRecord, nextId, now, pendingMigration, planHash, roadmapApproval, saveRecord, taskAddressed, V1_BACKUP } from "./record.js";
import { renderHtml } from "./render.js";
import { loadRubric } from "./rubric.js";
import { scan, walk, type ScanResult } from "./scan.js";
import { applicableChecks, assessStrictness, countSuppressions, lintStrictness, loadStrictness } from "./strictness.js";
import { computeScore } from "./score.js";
import { assessTesting, lintTesting, loadTesting, profilesFor } from "./testing.js";
import { assessDocs, lintDocs, loadDocs } from "./docs.js";
import { assessMaintenance, lintMaintenance, loadMaintenance } from "./maintenance.js";
import { UsageError, type AssessmentRecord, type Mode } from "./types.js";
import { validateRecord } from "./validate.js";
import { applyPatch, roadmapOrder, type Patch, type ScanHints } from "./workflow.js";

const HELP = `agentic — deterministic core of the Agentic Playbook

Usage: agentic <command> [options]   (run inside the target repository, or pass --repo <path>)

Setup
  init [--mode greenfield|existing] [--force]   Create the record (staged outside the repo until adopted)
  scan [--github] [--json]                      Read-only probes -> scan.json (+ branch protection via gh with --github)
  adopt                                         Move the staged record into <repo>/.agentic/
  where                                         Print the record location

Read-only assessment
  readonly begin [--restart]                    Fingerprint the worktree and refuse Claude file-tool writes to it (6h window)
  readonly end                                  Fail, listing every change, if the worktree moved since begin
  readonly check --path <file> | --hook         Exit 2 if a write to <file> falls in an open window (used by the plugin hook)

Assessment content (the only write path for findings/milestones/tasks/criteria)
  apply <patch.json|-> [--by <who>]             Upsert criteria, findings, milestones, tasks; cited path:line must exist
  approve <subject> --by human:<name> [--note]  Attribute a human decision (roadmap approvals bind to the plan)

Roadmap (a plan handed to your own workflow; progress comes from reassessment)
  roadmap [--json]                              Open tasks in milestone and dependency order
  changes [--json]                              What changed since the assessment, and which judgements it makes stale
  show <id>                                     Print one criterion/finding/milestone/task/approval as JSON

Conventions
  conventions [--app <root>] [--json]          App roots, detected stack, conventions files, applicable baseline rules

Strictness
  strictness [--app <root>] [--json]           Per app: which tiered strictness checks are on, and inline suppression counts

Testing
  tests [--app <root>] [--json]                Per app: kind, test layers present, critical-path candidates, coverage tooling

Documentation
  docs [--app <root>] [--json]                 Documents present per repo and app, always-loaded context, broken links, repeated lines

Maintenance
  maintenance [--json]                         Janitors already set up, their prerequisites in the record, and where they could run

Reporting
  score [--json]                                Compute score, confidence, level; append to history
  status [--brief] [--json]                     Summary plus staleness of the assessment and Artifact
  render [--out <file>]                         Write the Artifact HTML (prints the path)
  published --url <artifact url>                Record that the current revision was published
  validate                                      Schema + referential integrity
  rubric [--json]                               Print the rubric

Playbook maintenance
  lint-playbook [--root <dir>]                  Rubric quotes, standard coverage, links, conventions, strictness, testing, docs and maintenance libraries
`;

type Args = { _: string[]; flags: Record<string, string | boolean> };

function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith("--")) {
      const [k, v] = a.slice(2).split("=", 2) as [string, string | undefined];
      if (v !== undefined) out.flags[k] = v;
      else if (argv[i + 1] !== undefined && !argv[i + 1]!.startsWith("--")) out.flags[k] = argv[++i]!;
      else out.flags[k] = true;
    } else out._.push(a);
  }
  return out;
}

const str = (a: Args, k: string): string | undefined => (typeof a.flags[k] === "string" ? (a.flags[k] as string) : undefined);
const need = (a: Args, k: string): string => {
  const v = str(a, k);
  if (!v) throw new UsageError(`--${k} is required`);
  return v;
};

function readJsonInput(src: string): unknown {
  const text = src === "-" ? readFileSync(0, "utf8") : readFileSync(resolve(src), "utf8");
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new UsageError(`Patch is not valid JSON: ${(e as Error).message}`);
  }
}

/** Attach probe results to the rubric criteria they inform, for the auditors. */
function withHints(result: ReturnType<typeof scan>) {
  const criteriaHints: Record<string, { probe: string; status: string; evidence: string[]; note?: string }> = {};
  for (const c of loadRubric().criteria) {
    const p = c.probe ? result.probes[c.probe] : undefined;
    if (c.probe && p) criteriaHints[c.id] = { probe: c.probe, ...p };
  }
  return { ...result, criteriaHints };
}

/** The strictness facts from the last scan, for the tracker. Null if no scan has run. */
function strictnessSnapshot(store: StoreLocation) {
  if (!existsSync(store.scanPath)) return null;
  try {
    const s = JSON.parse(readFileSync(store.scanPath, "utf8")) as ScanResult;
    const apps = s.facts.strictness as never;
    const suppressions = s.facts.suppressions as never;
    const testing = (s.facts.testing ?? []) as never;
    const docs = (s.facts.docs ?? null) as never;
    const maintenance = (s.facts.maintenance ?? null) as never;
    return apps && suppressions ? { scannedAt: s.scannedAt, revision: s.revision, apps, suppressions, testing, docs, maintenance } : null;
  } catch {
    return null;
  }
}

function staleness(store: StoreLocation, record: AssessmentRecord) {
  const head = headRevision(store.repoRoot);
  const behind = record.assessedRevision && head && head !== record.assessedRevision ? commitsSince(store.repoRoot, record.assessedRevision) : 0;
  const unpublished = record.artifact ? record.recordRevision - record.artifact.publishedRecordRevision : null;
  return { head, commitsBehind: behind, unpublished };
}

function recordScore(store: StoreLocation, record: AssessmentRecord) {
  const s = computeScore(record);
  const last = record.scoreHistory.at(-1);
  const byDimension = Object.fromEntries(s.dimensions.map((d) => [d.id, d.score ?? -1]));
  if (!last || last.score !== s.score || last.level !== s.level || last.confidence !== s.confidence || last.revision !== record.assessedRevision) {
    record.scoreHistory.push({ at: now(), revision: record.assessedRevision, recordRevision: record.recordRevision, score: s.score, confidence: s.confidence, level: s.level, byDimension });
    saveRecord(store, record, { bump: false });
  }
  return s;
}

function printScore(s: ReturnType<typeof computeScore>) {
  console.log(`Readiness score ${s.score}/100   level ${s.level} ${s.levelName}   confidence ${s.confidence}%`);
  for (const d of s.dimensions) console.log(`  ${d.id.padEnd(5)} ${String(d.score ?? "n/a").padStart(5)}  ${d.name} (${d.passed}/${d.applicable} passed)`);
  const c = s.counts;
  console.log(`  criteria: ${c.passed} passed, ${c.partial} partial, ${c.failed} failed, ${c.unverified} unverified, ${c.n_a} n/a, ${c.deferred} deferred`);
  if (s.nextLevel) {
    console.log(`To reach ${s.nextLevel.level} ${s.nextLevel.name}:`);
    for (const b of s.nextLevel.blocking) console.log(`  - ${b.id} [${b.status}] ${b.title}`);
  }
}

const REMOVED: Record<string, string> = {
  task: "The playbook plans; it does not run or track implementation. Implement tasks in your own workflow, then run /agentic:reassess, which resolves findings and judges exit criteria from the repository.",
  evidence: "Verification evidence belongs to your own review and CI. Reassessment cites what it observes in the record's criteria, findings and exit criteria.",
  next: "Use `agentic roadmap` for the open tasks in plan order.",
};

function scanHints(store: StoreLocation): ScanHints | null {
  if (!existsSync(store.scanPath)) return null;
  try {
    return ((JSON.parse(readFileSync(store.scanPath, "utf8")) as { criteriaHints?: ScanHints }).criteriaHints ?? {}) as ScanHints;
  } catch {
    return null;
  }
}

/** Signals that a judgement in the record can no longer be relied on as-is. */
function trustStatus(store: StoreLocation, record: AssessmentRecord, full: boolean) {
  const changes = changedAreas(store.repoRoot, record.assessedRevision, { apps: full });
  const from = pendingMigration(record);
  const { approval, current } = roadmapApproval(record);
  const roadmap = !record.milestones.length
    ? null
    : !approval
      ? "ROADMAP: not approved yet. Approval is recorded with `agentic approve roadmap --by human:<name>` once the user approves it."
      : !current
        ? `ROADMAP: changed since approval ${approval.id} by ${approval.approvedBy}. Ask the user to re-approve it.`
        : null;
  const crit = new Map(record.criteria.map((c) => [c.id, c.status]));
  const lib = loadMaintenance();
  const janitors = (record.maintenance?.roster ?? [])
    .filter((r) => r.status === "present" || r.recommend === "now")
    .flatMap((r) => {
      const missing = (lib.items.get(r.id)?.prerequisites ?? []).filter((p) => crit.get(p) !== "passed");
      return missing.length
        ? [`${r.id} is ${r.status === "present" ? "running" : "recommended now"} but ${missing.map((p) => `${p} is ${crit.get(p) ?? "missing"}`).join(", ")}: the contract it guards is not established, so its output cannot be trusted. Reassess, then fix or pause it.`]
        : [];
    });
  return {
    changes,
    probeRegressions: full ? probeRegressions(store).regressions : [],
    roadmap,
    roadmapApproval: approval ? { id: approval.id, current } : null,
    janitors,
    migration: from ? `the record uses schema v${from}. The next write migrates it to v2 (execution state dropped; the original is kept as ${V1_BACKUP}).` : null,
    readonlyWindow: liveLock(store.repoRoot)?.expiresAt ?? null,
  };
}

function printChanges(c: ReturnType<typeof changedAreas>, regressions: ReturnType<typeof probeRegressions>["regressions"]) {
  if (!c.revisionKnown) console.log(`The assessed revision ${c.assessedRevision ?? "(none)"} is not in this repository's history: treat every judgement as stale.`);
  console.log(`${c.commits} commit(s) since the assessment, ${c.committed.length} path(s) changed, ${c.uncommitted.length} uncommitted.`);
  if (!c.areas.length) console.log("No changes that affect an assessed area.");
  for (const a of c.areas) console.log(`  ${a.label}: ${a.dims.join(", ")}${a.snapshots.length ? `; snapshots: ${a.snapshots.join(", ")}` : ""}  (${a.paths.slice(0, 5).join(", ")}${a.paths.length > 5 ? `, +${a.paths.length - 5}` : ""})`);
  const apps = Object.keys(c.apps);
  if (apps.length) console.log(`  app roots with changed code: ${apps.join(", ")}`);
  for (const r of regressions) console.log(`  regressed probe ${r.probe}: ${r.was} -> ${r.now} (${r.evidence[0] ?? ""})`);
}

export function main(argv: string[]): number {
  const args = parseArgs(argv);
  const cmd = args._[0];
  if (!cmd || cmd === "help" || args.flags.help) {
    console.log(HELP);
    return 0;
  }
  const cwd = resolve(str(args, "repo") ?? process.cwd());
  const by = str(args, "by") ?? "agent:claude";

  switch (cmd) {
    case "lint-playbook": {
      const root = resolve(str(args, "root") ?? playbookRoot());
      const problems = lintPlaybook(root);
      for (const w of [...lintLibrary(root).warnings, ...lintStrictness(root).warnings, ...lintTesting(root).warnings, ...lintDocs(root).warnings, ...lintMaintenance(root).warnings]) console.log(`! ${w}`);
      if (problems.length) {
        console.error(problems.map((p) => `✗ ${p}`).join("\n"));
        console.error(`\n${problems.length} problem(s).`);
        return 1;
      }
      console.log(`✓ playbook is consistent (${loadRubric(root).criteria.length} criteria, ${loadLibrary(root).rules.size} convention rules, ${loadStrictness(root).checks.size} strictness checks, ${loadTesting(root).layers.size} testing layers, ${loadDocs(root).items.size} documentation items, ${loadMaintenance(root).items.size} janitors).`);
      return 0;
    }
    case "rubric": {
      const r = loadRubric();
      if (args.flags.json) console.log(JSON.stringify(r, null, 2));
      else for (const c of r.criteria) console.log(`${c.id.padEnd(8)} ${c.priority} ${(c.gate ?? "--").padEnd(3)} ${c.title}`);
      return 0;
    }
    case "where": {
      const s = locateStore(cwd);
      console.log(JSON.stringify({ repoRoot: s.repoRoot, record: s.recordPath, scan: s.scanPath, adopted: s.adopted, exists: existsSync(s.recordPath) }, null, 2));
      return 0;
    }
    case "init": {
      const store = locateStore(cwd);
      if (existsSync(store.recordPath) && !args.flags.force) throw new UsageError(`A record already exists at ${store.recordPath}. Use /agentic:reassess, or --force to start over.`);
      const scanResult = withHints(scan(store.repoRoot));
      const modeFlag = str(args, "mode");
      if (modeFlag && modeFlag !== "greenfield" && modeFlag !== "existing") throw new UsageError("--mode must be greenfield or existing");
      const mode = (modeFlag as Mode | undefined) ?? scanResult.suggestedMode;
      mkdirSync(store.dir, { recursive: true });
      const record = createRecord(store, mode);
      saveRecord(store, record, { bump: false });
      writeFileSync(store.scanPath, JSON.stringify(scanResult, null, 2) + "\n");
      console.log(`Created ${mode} assessment record at ${store.recordPath}`);
      console.log(`Mode ${modeFlag ? "set explicitly" : `suggested: ${scanResult.modeReason}`}`);
      if (!store.adopted) console.log("The record is staged outside the repository. Run `agentic adopt` after the roadmap is approved.");
      return 0;
    }
    case "scan": {
      const store = locateStore(cwd);
      const result = withHints(scan(store.repoRoot, { github: !!args.flags.github }));
      mkdirSync(store.dir, { recursive: true });
      writeFileSync(store.scanPath, JSON.stringify(result, null, 2) + "\n");
      if (args.flags.json) console.log(JSON.stringify(result, null, 2));
      else {
        console.log(`Scanned ${result.stats.files} files at ${result.revision?.slice(0, 7) ?? "(no commits)"} -> ${store.scanPath}`);
        console.log(`Suggested mode: ${result.suggestedMode} (${result.modeReason})`);
        for (const [k, p] of Object.entries(result.probes)) console.log(`  ${p.status.padEnd(10)} ${k}: ${p.evidence[0] ?? ""}`);
      }
      return 0;
    }
    case "conventions": {
      const store = locateStore(cwd);
      const { files } = walk(store.repoRoot);
      const read = (rel: string) => {
        try {
          return readFileSync(join(store.repoRoot, rel), "utf8");
        } catch {
          return "";
        }
      };
      const lib = loadLibrary();
      const only = str(args, "app");
      const apps = detectApps(files, read).filter((a) => !only || a.root === only);
      if (only && !apps.length) throw new UsageError(`No app root "${only}". Run \`agentic conventions\` to list them.`);
      const assessed = existsSync(store.recordPath) ? loadRecord(store).conventions : [];
      const out = apps.map((a) => {
        const rules = applicableRules(lib, new Set(a.signals));
        return {
          ...a,
          rules: rules.map((r) => ({ id: r.id, domain: r.domain, title: r.title, enforceable: r.enforceable, source: r.source })),
          assessed: assessed.filter((c) => c.scope === a.root),
        };
      });
      if (args.flags.json) {
        console.log(JSON.stringify({ library: lib.domains.map((d) => ({ domain: d.domain, file: d.file, reviewed: d.reviewed, rules: d.rules.length })), apps: out }, null, 2));
        return 0;
      }
      for (const a of out) {
        const counts: Record<string, number> = {};
        for (const c of a.assessed) counts[c.status] = (counts[c.status] ?? 0) + 1;
        console.log(`${a.root}  [${a.signals.filter((x) => x !== "any").join(", ") || "no stack signals"}]`);
        console.log(`  conventions: ${a.conventions.join(", ") || "none scoped to this app"}`);
        console.log(`  baseline rules that apply: ${a.rules.length} (${[...new Set(a.rules.map((r) => r.domain))].join(", ")})`);
        console.log(`  assessed: ${a.assessed.length ? Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") : "not yet (run /agentic:conventions)"}`);
      }
      return 0;
    }
    case "strictness": {
      const store = locateStore(cwd);
      const { files } = walk(store.repoRoot);
      const read = (rel: string) => {
        try {
          return readFileSync(join(store.repoRoot, rel), "utf8");
        } catch {
          return "";
        }
      };
      const lib = loadStrictness();
      const only = str(args, "app");
      const all = detectApps(files, read);
      const apps = all.filter((a) => !only || a.root === only);
      if (only && !apps.length) throw new UsageError(`No app root "${only}". Run \`agentic strictness\` to list them.`);
      const status = assessStrictness(lib, apps, files, read);
      const sup = countSuppressions(all, files, read);
      const out = apps.map((a, i) => ({
        root: a.root,
        signals: a.signals,
        checks: status[i]!.checks.map((c) => {
          const full = lib.checks.get(c.id)!;
          return { ...c, when: full.when, slop_prevented: full.slop_prevented, enable: full.enable, ratchet: full.ratchet, cost: full.cost, source: full.source };
        }),
        suppressions: sup.byApp[a.root] ?? {},
      }));
      const notRecommended = lib.profiles
        .filter((p) => apps.some((a) => applicableChecks({ profiles: [p], checks: new Map() }, new Set(a.signals)).length))
        .flatMap((p) => p.not_recommended);
      if (args.flags.json) {
        console.log(JSON.stringify({ apps: out, suppressions: { total: sup.total, undescribed: sup.undescribed, descriptionRules: sup.descriptionRules, baselines: sup.baselines }, notRecommended }, null, 2));
        return 0;
      }
      for (const a of out) {
        const t1 = a.checks.filter((c) => c.tier === 1);
        const off1 = t1.filter((c) => c.status === "off");
        console.log(`${a.root}  [${a.signals.filter((x) => x !== "any").join(", ") || "no stack signals"}]`);
        console.log(`  Tier 1 (always): ${t1.length - off1.length}/${t1.length} on`);
        for (const c of off1) console.log(`    ✗ ${c.id} ${c.title}: ${c.enable}`);
        const t2 = a.checks.filter((c) => c.tier === 2);
        for (const c of t2) console.log(`  Tier 2 ${c.status === "on" ? "✓" : "·"} ${c.id} ${c.title}${c.status === "on" ? "" : ` (when: ${c.when})`}`);
        for (const c of a.checks.filter((x) => x.tier === 3 && x.status === "on")) console.log(`  Tier 3 ✓ ${c.id} ${c.title}`);
        const kinds = Object.entries(a.suppressions);
        console.log(`  inline suppressions: ${kinds.length ? kinds.map(([k, v]) => `${v.total} ${k}${v.undescribed ? ` (${v.undescribed} without reason)` : ""}`).join(", ") : "none found"}`);
      }
      console.log(`rules requiring a reason: ${sup.descriptionRules.join(", ") || "none"}`);
      console.log(`suppression baselines: ${sup.baselines.join(", ") || "none"}`);
      return 0;
    }
    case "tests": {
      const store = locateStore(cwd);
      const { files } = walk(store.repoRoot);
      const read = (rel: string) => {
        try {
          return readFileSync(join(store.repoRoot, rel), "utf8");
        } catch {
          return "";
        }
      };
      const lib = loadTesting();
      const only = str(args, "app");
      const all = detectApps(files, read);
      if (only && !all.some((a) => a.root === only)) throw new UsageError(`No app root "${only}". Run \`agentic tests\` to list them.`);
      const result = assessTesting(lib, all, files, read).filter((a) => !only || a.root === only);
      const out = result.map((a) => {
        const app = all.find((x) => x.root === a.root)!;
        const profiles = profilesFor(lib, new Set(app.signals));
        return {
          ...a,
          signals: app.signals,
          layers: a.layers.map((l) => {
            const full = lib.layers.get(l.id)!;
            return { ...l, when: full.when, purpose: full.purpose, belongs_here: full.belongs_here, see: full.see ?? [], source: full.source };
          }),
          notRecommended: profiles.flatMap((p) => p.not_recommended),
        };
      });
      if (args.flags.json) {
        console.log(JSON.stringify({ apps: out }, null, 2));
        return 0;
      }
      for (const a of out) {
        console.log(`${a.root}  [${a.kinds.join(", ") || "no kind"}]  runners: ${a.runners.join(", ") || "none found"}`);
        console.log(`  ${a.testFiles} test files, ${a.sourceFiles} source files`);
        for (const l of a.layers.filter((x) => x.tier === 1 || x.status === "present"))
          console.log(`  ${l.status === "present" ? "✓" : l.tier === 1 ? "✗" : "·"} T${l.tier} ${l.id} ${l.layer}${l.status === "present" ? ` (${l.count})` : ""}: ${l.title}`);
        for (const l of a.layers.filter((x) => x.tier === 2 && x.status === "absent")) console.log(`  · T2 ${l.id} ${l.layer} (when: ${l.when})`);
        const crit = a.criticalCandidates;
        if (crit.length) {
          console.log(`  critical-path candidates referenced by a test: ${crit.filter((c) => c.referencedBy.length).length}/${crit.length}`);
          for (const c of crit.filter((x) => !x.referencedBy.length).slice(0, 10)) console.log(`    ✗ ${c.file} (${c.name}: ${c.consequence})`);
        }
        if (a.untestedDirs.length) console.log(`  directories with code and no tests: ${a.untestedDirs.join(", ")}`);
        console.log(`  coverage: ${a.coverage.join("; ") || "none found"}`);
      }
      return 0;
    }
    case "docs": {
      const store = locateStore(cwd);
      const { files } = walk(store.repoRoot);
      const read = (rel: string) => {
        try {
          return readFileSync(join(store.repoRoot, rel), "utf8");
        } catch {
          return "";
        }
      };
      const lib = loadDocs();
      const only = str(args, "app");
      const apps = detectApps(files, read);
      if (only && !apps.some((a) => a.root === only)) throw new UsageError(`No app root "${only}". Run \`agentic docs\` to list them.`);
      const d = assessDocs(lib, apps, files, read, (rel) => existsSync(join(store.repoRoot, rel)));
      const items = d.items
        .filter((i) => !only || i.scope === only)
        .map((i) => {
          const full = lib.items.get(i.id)!;
          return { ...i, title: full.title, when: full.when, purpose: full.purpose, home: full.home, load: full.load, authority: full.authority, belongs_here: full.belongs_here, not_here: full.not_here, see: full.see ?? [], source: full.source };
        });
      const notRecommended = lib.areas.flatMap((a) => a.not_recommended.map((n) => ({ area: a.area, ...n })));
      if (args.flags.json) {
        console.log(JSON.stringify({ ...d, items, notRecommended }, null, 2));
        return 0;
      }
      console.log(`conditions: ${d.repoConditions.filter((c) => c !== "any").join(", ") || "none"}`);
      console.log(`always loaded: ${d.alwaysLoadedLines} lines (${d.alwaysLoaded.map((a) => `${a.file} ${a.lines}`).join(", ") || "nothing"})`);
      const scopes = [...new Set(items.map((i) => i.scope))];
      for (const sc of scopes) {
        console.log(sc === "repo" ? "repository" : sc);
        for (const i of items.filter((x) => x.scope === sc && (x.tier < 3 || x.status === "present")).sort((x, y) => x.tier - y.tier || x.id.localeCompare(y.id))) {
          const mark = i.status === "present" ? "✓" : i.tier === 1 ? "✗" : "·";
          const detail = i.status === "present" ? i.paths.join(", ") : i.tier === 1 ? `expected at ${i.home}` : `when: ${i.when}`;
          console.log(`  ${mark} T${i.tier} ${i.id} ${i.artifact}: ${detail}`);
        }
      }
      console.log(`${d.docFileCount} documentation files`);
      if (d.brokenLinks.length) {
        console.log(`broken relative links (${d.brokenLinks.length}):`);
        for (const b of d.brokenLinks.slice(0, 15)) console.log(`  ✗ ${b}`);
      }
      if (d.duplicates.length) {
        console.log(`lines repeated across agent guidance files (${d.duplicates.length}):`);
        for (const x of d.duplicates.slice(0, 10)) console.log(`  ${x.files.join(" + ")}: ${x.line}`);
      }
      return 0;
    }
    case "maintenance": {
      const store = locateStore(cwd);
      const { files } = walk(store.repoRoot);
      const read = (rel: string) => {
        try {
          return readFileSync(join(store.repoRoot, rel), "utf8");
        } catch {
          return "";
        }
      };
      const lib = loadMaintenance();
      const record = existsSync(store.recordPath) ? loadRecord(store) : null;
      const m = assessMaintenance(lib, files, read, record?.criteria);
      const items = m.items.map((i) => {
        const j = lib.items.get(i.id)!;
        return { ...i, when: j.when, guards: j.guards, purpose: j.purpose, detector: j.detector, agent_step: j.agent_step, autofix: j.autofix, needs_human: j.needs_human, noise_controls: j.noise_controls, success: j.success, see: j.see ?? [], source: j.source };
      });
      const notRecommended = lib.areas.flatMap((a) => a.not_recommended);
      if (args.flags.json) {
        console.log(JSON.stringify({ hasRecord: !!record, runners: m.runners, items, notRecommended }, null, 2));
        return 0;
      }
      console.log(`places a janitor could run: ${m.runners.join(", ") || "none found"}`);
      if (!record) console.log("no record yet: prerequisites are unknown (run /agentic:assess)");
      const hidden = items.filter((i) => i.tier === 3 && i.status === "absent").length;
      for (const i of items.filter((x) => x.tier < 3 || x.status === "present").sort((x, y) => x.tier - y.tier || x.id.localeCompare(y.id))) {
        const mark = i.status === "present" ? "✓" : i.prerequisitesMet ? "→" : "·";
        console.log(`  ${mark} T${i.tier} ${i.id} ${i.title} [${i.trigger.join(", ")}]${i.status === "present" ? `: ${i.paths.join(", ")}` : ""}`);
        if (i.status === "absent") {
          const waiting = i.prerequisites.filter((p) => p.status !== "passed");
          if (record) console.log(`      ${waiting.length ? `waiting on ${waiting.map((p) => `${p.id} (${p.status})`).join(", ")}` : "prerequisites pass"}`);
          if (i.tier > 1) console.log(`      when: ${i.when}`);
        }
      }
      if (hidden) console.log(`  (${hidden} Tier 3 janitors not shown: only worth it after a cited recurring problem; see --json)`);
      console.log("✓ set up   → prerequisites pass, not set up   · waiting, or prerequisites unknown");
      return 0;
    }
    case "readonly": {
      const sub = args._[1];
      if (sub === "check") {
        let path = str(args, "path");
        if (args.flags.hook) {
          try {
            const input = JSON.parse(readFileSync(0, "utf8")) as { tool_input?: { file_path?: string; notebook_path?: string } };
            path = input.tool_input?.file_path ?? input.tool_input?.notebook_path;
          } catch {
            return 0; // Not hook JSON: nothing to judge.
          }
        }
        if (!path) return args.flags.hook ? 0 : (() => { throw new UsageError("readonly check needs --path <file> or --hook"); })();
        const refusal = writeRefusal(resolve(cwd, path));
        if (!refusal) return 0;
        console.error(refusal);
        return 2;
      }
      const store = locateStore(cwd);
      if (sub === "begin") {
        const { lock, dirty, replaced } = beginWindow(store.repoRoot, { restart: !!args.flags.restart });
        console.log(`Read-only window open for ${store.repoRoot} until ${lock.expiresAt}${replaced ? " (replaced an open window)" : ""}.`);
        console.log("Claude file-tool writes inside the repository are refused until `agentic readonly end`.");
        if (dirty) console.log(`Note: the worktree already has ${dirty} uncommitted path(s). The assessment judges them as they are; say so in the report.`);
        return 0;
      }
      if (sub === "end") {
        const { lock, changes } = endWindow(store.repoRoot);
        if (!lock) throw new UsageError("No read-only window is open for this repository. Start one with `agentic readonly begin`.");
        if (!changes.length) {
          console.log(`✓ The worktree is unchanged since ${lock.startedAt}. The assessment was read-only.`);
          return 0;
        }
        console.error(`✗ The worktree changed during the read-only assessment (since ${lock.startedAt}):`);
        for (const c of changes) console.error(`  - ${c}`);
        console.error("Report these changes to the user. Do not revert them without asking: some may be the user's own work.");
        return 1;
      }
      if (sub === "status") {
        const l = liveLock(store.repoRoot);
        console.log(l ? `open since ${l.startedAt}, until ${l.expiresAt}` : "no read-only window open");
        return 0;
      }
      throw new UsageError("usage: agentic readonly begin | end | status | check --path <file> | check --hook");
    }
    case "adopt": {
      const store = locateStore(cwd);
      if (store.adopted) {
        console.log(`Already adopted at ${store.recordPath}`);
        return 0;
      }
      if (!existsSync(store.recordPath)) throw new UsageError("Nothing to adopt. Run `agentic init` first.");
      const dest = join(store.repoRoot, ".agentic");
      mkdirSync(dest, { recursive: true });
      const staged = loadRecord(store);
      const { approval, current } = roadmapApproval(staged);
      if (!approval) console.log("warning: no roadmap approval is recorded. Approve the plan first (agentic approve roadmap --by human:<name>).");
      else if (!current) console.log(`warning: the roadmap changed since approval ${approval.id}. Re-approve it before relying on the plan.`);
      cpSync(store.recordPath, join(dest, "record.json"));
      if (existsSync(join(store.dir, V1_BACKUP))) cpSync(join(store.dir, V1_BACKUP), join(dest, V1_BACKUP));
      writeFileSync(join(dest, ".gitignore"), "scan.json\n*.html\n*.tmp\nreadonly.json\n");
      writeFileSync(
        join(dest, "README.md"),
        "# Agentic readiness record\n\n`record.json` is the assessment and remediation plan produced by the Agentic Playbook plugin. It holds no execution state: implement the plan in your own workflow, and `/agentic:reassess` records the progress.\nEdit it only through the `agentic` CLI or `/agentic:*` commands; they validate every change. Review changes to it like code (a CODEOWNERS entry helps): nothing stops a direct edit except review.\n",
      );
      rmSync(store.dir, { recursive: true, force: true });
      console.log(`Adopted record into ${join(dest, "record.json")}. Commit .agentic/ to make it durable.`);
      return 0;
    }
  }

  if (REMOVED[cmd]) throw new UsageError(`\`agentic ${cmd}\` was removed. ${REMOVED[cmd]}`);

  const store = locateStore(cwd);
  const record = loadRecord(store);
  const migratedFrom = pendingMigration(record);
  if (migratedFrom && !["validate", "show", "roadmap", "changes", "status"].includes(cmd)) {
    console.log(`Migrating the record from schema v${migratedFrom}: execution state is dropped, and the original is kept as ${V1_BACKUP} next to the record.`);
  }

  switch (cmd) {
    case "validate": {
      const { errors, warnings } = validateRecord(record);
      for (const w of warnings) console.log(`warning: ${w}`);
      for (const e of errors) console.error(`error: ${e}`);
      console.log(errors.length ? `✗ ${errors.length} error(s)` : `✓ record valid (rev ${record.recordRevision})`);
      return errors.length ? 1 : 0;
    }
    case "apply": {
      const src = args._[1];
      if (!src) throw new UsageError("apply needs a patch file or - for stdin");
      const hints = scanHints(store);
      const log = applyPatch(record, readJsonInput(src) as Patch, { by, repoRoot: store.repoRoot, hints });
      saveRecord(store, record);
      if (!hints) console.log("warning: no scan.json, so criteria were not checked against the deterministic probes. Run `agentic scan`.");
      const { warnings } = validateRecord(record);
      console.log(`Applied (${log.length} change${log.length === 1 ? "" : "s"}) -> record rev ${record.recordRevision}`);
      for (const l of log) console.log(`  ${l}`);
      for (const w of warnings) console.log(`warning: ${w}`);
      return 0;
    }
    case "approve": {
      const subject = args._[1];
      if (!subject) throw new UsageError("approve needs a subject (task, milestone id or a short description)");
      const approver = need(args, "by");
      if (!/^human:.+/.test(approver)) throw new UsageError("Refused: approvals attribute a human decision. Use --by human:<name>, with the name the user gave in this session.");
      const roadmap = subject === "roadmap";
      if (roadmap && !record.milestones.length) throw new UsageError("Refused: there is no roadmap to approve yet. Run /agentic:plan first.");
      const id = nextId("A", record.approvals.map((a) => a.id));
      record.approvals.push({
        id,
        subject,
        approvedBy: approver,
        at: now(),
        source: "local",
        scope: roadmap ? "roadmap" : "decision",
        ...(roadmap ? { planHash: planHash(record) } : {}),
        ...(str(args, "note") ? { note: str(args, "note")! } : {}),
      });
      saveRecord(store, record);
      console.log(`Recorded approval ${id} for ${subject}${roadmap ? ` (plan ${planHash(record).slice(0, 12)})` : ""}.`);
      console.log("This is local attribution: the CLI cannot verify who ran it. Authorization for the work itself belongs to your team's review process.");
      return 0;
    }
    case "show": {
      const id = args._[1];
      const all = [...record.criteria, ...record.findings, ...record.milestones, ...record.tasks, ...record.approvals, ...record.conventions] as { id: string }[];
      const item = all.find((x) => x.id === id);
      if (!item) throw new UsageError(`No item ${id}`);
      const rc = loadRubric().criteria.find((c) => c.id === id);
      const conv = record.conventions.find((c) => c.id === id);
      const lr = conv ? loadLibrary().rules.get(conv.rule) : undefined;
      console.log(JSON.stringify(rc ? { rubric: rc, state: item } : lr ? { rule: lr, state: item } : item, null, 2));
      return 0;
    }
    case "roadmap": {
      const order = roadmapOrder(record);
      if (args.flags.json) {
        console.log(JSON.stringify({ open: order.map((e) => ({ ...e.task, ready: e.ready, waitingOn: e.waitingOn })), approval: roadmapApproval(record) }, null, 2));
        return 0;
      }
      if (!record.tasks.length) {
        console.log("No roadmap yet. Run /agentic:plan.");
        return 0;
      }
      const addressed = record.tasks.filter((t) => taskAddressed(record, t)).length;
      console.log(`${order.length} open task(s), ${addressed} addressed (findings resolved by reassessment), ${record.tasks.filter((t) => t.deferredTrigger).length} deferred.`);
      for (const e of order) console.log(`${e.ready ? "ready  " : "waits  "} ${e.task.id}  ${e.task.priority}  [${e.task.milestoneId}] ${e.task.title}${e.waitingOn.length ? `  (after ${e.waitingOn.join(", ")})` : ""}${e.task.requiresApproval ? "  [needs a human decision]" : ""}`);
      console.log("Implement these in your own workflow. /agentic:reassess records progress from the repository.");
      return 0;
    }
    case "changes": {
      const c = changedAreas(store.repoRoot, record.assessedRevision);
      const probes = probeRegressions(store);
      if (args.flags.json) {
        console.log(JSON.stringify({ ...c, probeRegressions: probes.regressions, scannedAt: probes.scannedAt }, null, 2));
        return 0;
      }
      printChanges(c, probes.regressions);
      return 0;
    }
    case "score": {
      const s = recordScore(store, record);
      if (args.flags.json) console.log(JSON.stringify(s, null, 2));
      else printScore(s);
      return 0;
    }
    case "status": {
      const s = computeScore(record);
      const st = staleness(store, record);
      const trust = trustStatus(store, record, !args.flags.brief);
      if (args.flags.json) {
        console.log(JSON.stringify({ score: s, staleness: st, trust, record: store.recordPath, adopted: store.adopted, artifact: record.artifact }, null, 2));
        return 0;
      }
      const addressed = record.tasks.filter((t) => taskAddressed(record, t)).length;
      const lines = [
        `Agentic readiness for ${record.repo.name}: ${s.score}/100, ${s.level} ${s.levelName}, confidence ${s.confidence}% (record rev ${record.recordRevision}, ${store.adopted ? "adopted" : "staged"} at ${store.recordPath})`,
        `Roadmap: ${record.milestones.length} milestone(s), ${record.tasks.length} task(s), ${addressed} addressed, ${record.milestones.filter((m) => m.status === "completed").length} milestone(s) with every exit criterion met`,
      ];
      if (trust.migration) lines.push(`MIGRATION: ${trust.migration}`);
      if (trust.readonlyWindow) lines.push(`READ-ONLY: an assessment window is open until ${trust.readonlyWindow}. Finish it with \`agentic readonly end\`.`);
      if (trust.roadmap) lines.push(trust.roadmap);
      if (st.commitsBehind) {
        const stale = trust.changes.areas.filter((a) => a.paths.some((p) => trust.changes.committed.includes(p))).map((a) => `${a.label} (${a.dims.join("/")})`).join(", ");
        lines.push(`STALE: HEAD is ${st.commitsBehind} commit(s) past the assessed revision ${record.assessedRevision?.slice(0, 7)}${stale ? `; changed: ${stale}` : ""}. Run /agentic:reassess when the changes are relevant.`);
      }
      if (trust.changes.uncommitted.length) lines.push(`Uncommitted: ${trust.changes.uncommitted.length} path(s) differ from HEAD. The assessment may or may not have seen them; \`agentic changes\` lists the areas.`);
      if (record.assessedRevision && !trust.changes.revisionKnown) lines.push(`STALE: the assessed revision ${record.assessedRevision.slice(0, 7)} is not in this repository's history. Run /agentic:reassess.`);
      for (const r of trust.probeRegressions) lines.push(`REGRESSED: probe ${r.probe} was ${r.was} at the last scan and is ${r.now} now: ${r.evidence[0] ?? ""}`);
      for (const j of trust.janitors) lines.push(`JANITOR: ${j}`);
      if (!record.artifact) lines.push("Artifact: not published yet. Run /agentic:status to publish the tracker.");
      else if (st.unpublished && st.unpublished > 0) lines.push(`STALE: the Artifact (${record.artifact.url}) shows rev ${record.artifact.publishedRecordRevision}; the record is at rev ${record.recordRevision}. Republish it (agentic render, then Artifact publish to the same URL, then agentic published).`);
      else lines.push(`Artifact: ${record.artifact.url} (current)`);
      if (!args.flags.brief) {
        printScore(s);
        const next = roadmapOrder(record).find((e) => e.ready);
        if (next) lines.push(`First open task: ${next.task.id} ${next.task.title}`);
      }
      console.log(lines.join("\n"));
      return 0;
    }
    case "render": {
      recordScore(store, record);
      const st = staleness(store, record);
      const out = resolve(str(args, "out") ?? join(tmpdir(), "agentic-playbook", `${record.repo.name}-readiness.html`));
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, renderHtml(record, { headRevision: st.head, commitsBehind: st.commitsBehind, strictness: strictnessSnapshot(store) }));
      console.log(out);
      return 0;
    }
    case "published": {
      const url = need(args, "url");
      record.artifact = { url, publishedRecordRevision: record.recordRevision, publishedAt: now() };
      saveRecord(store, record, { bump: false });
      console.log(`Recorded publish of rev ${record.recordRevision} at ${url}`);
      return 0;
    }
    default:
      throw new UsageError(`Unknown command "${cmd}". Run \`agentic help\`.`);
  }
}

