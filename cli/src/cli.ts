import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { applicableRules, detectApps, lintLibrary, loadLibrary } from "./conventions.js";
import { commitsSince, headRevision } from "./git.js";
import { lintPlaybook } from "./lint.js";
import { locateStore, playbookRoot, type StoreLocation } from "./paths.js";
import { createRecord, loadRecord, nextId, now, saveRecord } from "./record.js";
import { renderHtml } from "./render.js";
import { loadRubric } from "./rubric.js";
import { scan, walk, type ScanResult } from "./scan.js";
import { applicableChecks, assessStrictness, countSuppressions, lintStrictness, loadStrictness } from "./strictness.js";
import { computeScore } from "./score.js";
import { UsageError, type AssessmentRecord, type Mode, type WorkStatus } from "./types.js";
import { validateRecord } from "./validate.js";
import { addEvidence, applyPatch, readyTasks, transitionTask, type Patch } from "./workflow.js";

const HELP = `agentic — deterministic core of the Agentic Playbook

Usage: agentic <command> [options]   (run inside the target repository, or pass --repo <path>)

Setup
  init [--mode greenfield|existing] [--force]   Create the record (staged outside the repo until adopted)
  scan [--github] [--json]                      Read-only probes -> scan.json (+ branch protection via gh with --github)
  adopt                                         Move the staged record into <repo>/.agentic/
  where                                         Print the record location

Assessment content (the only write path for findings/milestones/tasks/criteria)
  apply <patch.json|-> [--by <who>]             Upsert criteria, findings, milestones, tasks, approvals
  approve <subject> --by <human> [--note ...]   Record an explicit human approval

Execution
  next [--json]                                 Dependency-ready tasks and work awaiting verification
  task <id> <status> --by <who> [--reason ...]  Guarded transition (pending|in_progress|verification_required|completed|blocked|deferred)
  evidence --task <id> --covers <ids> --verifier <who> --action <cmd> --result pass|fail [--location ...] [--kind ...]
  show <id>                                     Print one criterion/finding/milestone/task/evidence as JSON

Conventions
  conventions [--app <root>] [--json]          App roots, detected stack, conventions files, applicable baseline rules

Strictness
  strictness [--app <root>] [--json]           Per app: which tiered strictness checks are on, and inline suppression counts

Reporting
  score [--json]                                Compute score, confidence, level; append to history
  status [--brief] [--json]                     Summary plus staleness of the assessment and Artifact
  render [--out <file>]                         Write the Artifact HTML (prints the path)
  published --url <artifact url>                Record that the current revision was published
  validate                                      Schema + referential integrity
  rubric [--json]                               Print the rubric

Playbook maintenance
  lint-playbook [--root <dir>]                  Rubric quotes, standard coverage, links, conventions and strictness libraries
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
    return apps && suppressions ? { scannedAt: s.scannedAt, revision: s.revision, apps, suppressions } : null;
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
      for (const w of [...lintLibrary(root).warnings, ...lintStrictness(root).warnings]) console.log(`! ${w}`);
      if (problems.length) {
        console.error(problems.map((p) => `✗ ${p}`).join("\n"));
        console.error(`\n${problems.length} problem(s).`);
        return 1;
      }
      console.log(`✓ playbook is consistent (${loadRubric(root).criteria.length} criteria, ${loadLibrary(root).rules.size} convention rules, ${loadStrictness(root).checks.size} strictness checks).`);
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
    case "adopt": {
      const store = locateStore(cwd);
      if (store.adopted) {
        console.log(`Already adopted at ${store.recordPath}`);
        return 0;
      }
      if (!existsSync(store.recordPath)) throw new UsageError("Nothing to adopt. Run `agentic init` first.");
      const dest = join(store.repoRoot, ".agentic");
      mkdirSync(dest, { recursive: true });
      cpSync(store.recordPath, join(dest, "record.json"));
      writeFileSync(join(dest, ".gitignore"), "scan.json\n*.html\n*.tmp\n");
      writeFileSync(
        join(dest, "README.md"),
        "# Agentic readiness record\n\n`record.json` is the authoritative assessment, roadmap and execution state produced by the Agentic Playbook plugin.\nEdit it only through the `agentic` CLI or `/agentic:*` commands; they validate every change.\n",
      );
      rmSync(store.dir, { recursive: true, force: true });
      console.log(`Adopted record into ${join(dest, "record.json")}. Commit .agentic/ to make it durable.`);
      return 0;
    }
  }

  const store = locateStore(cwd);
  const record = loadRecord(store);

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
      const log = applyPatch(record, readJsonInput(src) as Patch, { by, repoRoot: store.repoRoot });
      saveRecord(store, record);
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
      if (!approver.startsWith("human:")) throw new UsageError("Approvals must come from a human: use --by human:<name>");
      const id = nextId("A", record.approvals.map((a) => a.id));
      record.approvals.push({ id, subject, approvedBy: approver, at: now(), ...(str(args, "note") ? { note: str(args, "note")! } : {}) });
      saveRecord(store, record);
      console.log(`Recorded approval ${id} for ${subject}`);
      return 0;
    }
    case "task": {
      const [, id, to] = args._;
      if (!id || !to) throw new UsageError("usage: agentic task <id> <status> --by <who> [--reason ...]");
      const t = transitionTask(record, id, to as WorkStatus, { by, reason: str(args, "reason"), repoRoot: store.repoRoot });
      saveRecord(store, record);
      console.log(`${t.id}: ${t.history.at(-1)!.from} -> ${t.status} (record rev ${record.recordRevision})`);
      const ms = record.milestones.find((m) => m.id === t.milestoneId);
      if (ms) console.log(`${ms.id} is ${ms.status}`);
      return 0;
    }
    case "evidence": {
      const result = need(args, "result");
      if (result !== "pass" && result !== "fail") throw new UsageError("--result must be pass or fail");
      const ev = addEvidence(
        record,
        {
          taskId: str(args, "task"),
          milestoneId: str(args, "milestone"),
          covers: (str(args, "covers") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
          verifier: need(args, "verifier"),
          action: need(args, "action"),
          result,
          kind: (str(args, "kind") as never) ?? "check",
          ...(str(args, "location") ? { location: str(args, "location")! } : {}),
          ...(str(args, "notes") ? { notes: str(args, "notes")! } : {}),
        },
        store.repoRoot,
      );
      for (const k of Object.keys(ev) as (keyof typeof ev)[]) if (ev[k] === undefined) delete ev[k];
      saveRecord(store, record);
      console.log(`Recorded ${ev.id} (${ev.result}) covering ${ev.covers.join(", ") || "nothing"}`);
      return 0;
    }
    case "show": {
      const id = args._[1];
      const all = [...record.criteria, ...record.findings, ...record.milestones, ...record.tasks, ...record.evidence, ...record.approvals, ...record.conventions] as { id: string }[];
      const item = all.find((x) => x.id === id);
      if (!item) throw new UsageError(`No item ${id}`);
      const rc = loadRubric().criteria.find((c) => c.id === id);
      const conv = record.conventions.find((c) => c.id === id);
      const lr = conv ? loadLibrary().rules.get(conv.rule) : undefined;
      console.log(JSON.stringify(rc ? { rubric: rc, state: item } : lr ? { rule: lr, state: item } : item, null, 2));
      return 0;
    }
    case "next": {
      const ready = readyTasks(record);
      const awaiting = record.tasks.filter((t) => t.status === "verification_required");
      const active = record.tasks.filter((t) => t.status === "in_progress");
      if (args.flags.json) {
        console.log(JSON.stringify({ ready, active, awaitingVerification: awaiting }, null, 2));
        return 0;
      }
      if (active.length) console.log(`In progress: ${active.map((t) => `${t.id} ${t.title}`).join("; ")}`);
      if (awaiting.length) console.log(`Awaiting verification: ${awaiting.map((t) => `${t.id} ${t.title}`).join("; ")}`);
      if (!ready.length) console.log(record.tasks.length ? "No dependency-ready pending tasks." : "No tasks yet. Run /agentic:plan.");
      for (const t of ready.slice(0, 10)) console.log(`ready  ${t.id}  ${t.priority}  [${t.milestoneId}] ${t.title}`);
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
      const count = (x: WorkStatus) => record.tasks.filter((t) => t.status === x).length;
      if (args.flags.json) {
        console.log(JSON.stringify({ score: s, staleness: st, record: store.recordPath, adopted: store.adopted, artifact: record.artifact }, null, 2));
        return 0;
      }
      const lines = [
        `Agentic readiness for ${record.repo.name}: ${s.score}/100, ${s.level} ${s.levelName}, confidence ${s.confidence}% (record rev ${record.recordRevision}, ${store.adopted ? "adopted" : "staged"} at ${store.recordPath})`,
        `Tasks: ${count("in_progress")} in progress, ${count("verification_required")} awaiting verification, ${count("blocked")} blocked, ${count("pending")} pending, ${count("completed")} completed`,
      ];
      if (st.commitsBehind) lines.push(`STALE: HEAD is ${st.commitsBehind} commit(s) past the assessed revision ${record.assessedRevision?.slice(0, 7)}. Run /agentic:reassess when the changes are relevant.`);
      if (!record.artifact) lines.push("Artifact: not published yet. Run /agentic:status to publish the tracker.");
      else if (st.unpublished && st.unpublished > 0) lines.push(`STALE: the Artifact (${record.artifact.url}) shows rev ${record.artifact.publishedRecordRevision}; the record is at rev ${record.recordRevision}. Republish it (agentic render, then Artifact publish to the same URL, then agentic published).`);
      else lines.push(`Artifact: ${record.artifact.url} (current)`);
      if (!args.flags.brief) {
        printScore(s);
        const ready = readyTasks(record);
        if (ready.length) lines.push(`Next ready task: ${ready[0]!.id} ${ready[0]!.title}`);
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

