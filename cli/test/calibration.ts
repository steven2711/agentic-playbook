/**
 * Calibration scenarios: load a scenario repository and its ground truth, and grade either the
 * deterministic CLI output or an agent-produced assessment record against that ground truth.
 *
 * Ground truth lives in calibration/scenarios/<name>/expect.yaml and is written before a baseline
 * is measured. See calibration/README.md for the method.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "yaml";
import type { AssessmentRecord } from "../src/types.js";
import { makeRepo, readRecord, run } from "./helpers.js";

export const CALIBRATION = join(import.meta.dirname, "..", "..", "calibration");

type Status = string;
export interface Judge { criteria?: string[]; status?: Status[]; notStatus?: Status[]; path?: string; finding?: string; reason?: string }
export interface Detect { probe?: string; status?: Status[]; evidence?: string; uncovered?: { app: string; file: string }; known?: string }
export interface Seeded { id: string; what: string; detect?: Detect; judge?: Judge }
export interface Safeguard {
  id: string;
  what: string;
  probe?: string;
  notStatus?: Status[];
  judge?: Judge;
  conventionsFor?: string;
  layer?: { app: string; present: boolean };
  strictnessOn?: { app: string; checks: string[] };
}
export interface Expect {
  description: string;
  commits: number;
  mode: "greenfield" | "existing";
  apps: { root: string; kinds?: string[]; notKinds?: string[] }[];
  seeded: Seeded[];
  safeguards: Safeguard[];
  stage?: { deferred?: string[]; notApplicable?: string[]; notFailedJudge?: string[] };
  forbidden: { pattern: string; reason: string }[];
  plan?: { maxTasks?: number; noJanitorTasks?: boolean };
  variants?: Record<string, { detect?: Detect; judge?: Judge[] }>;
}

export function scenarios(): string[] {
  return readdirSync(join(CALIBRATION, "scenarios")).filter((d) => statSync(join(CALIBRATION, "scenarios", d)).isDirectory()).sort();
}

export function loadExpect(name: string): Expect {
  return parse(readFileSync(join(CALIBRATION, "scenarios", name, "expect.yaml"), "utf8")) as Expect;
}

function readTree(dir: string, into: Record<string, string> = {}, base = dir): Record<string, string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) readTree(p, into, base);
    else into[relative(base, p).split("\\").join("/")] = readFileSync(p, "utf8");
  }
  return into;
}

/** A fresh git repository for a scenario (plus an optional overlay), with the scenario's commit count. */
export function scenarioRepo(name: string, variant?: string): string {
  const root = join(CALIBRATION, "scenarios", name);
  const files = readTree(join(root, "repo"));
  if (variant) readTree(join(root, "overlays", variant), files);
  return makeRepo(files, loadExpect(name).commits);
}

export function cliJson<T = any>(repo: string, ...argv: string[]): T {
  const r = run(repo, ...argv, "--json");
  if (r.code !== 0) throw new Error(`agentic ${argv.join(" ")} failed: ${r.err}`);
  return JSON.parse(r.out) as T;
}

/** `known`: a documented limitation of the deterministic layer; reported, not failed. */
export interface Check { id: string; what: string; ok: boolean; got: string; known?: string }

/** Deterministic detection: what the CLI alone reports for a scenario repository. */
export function gradeDeterministic(repo: string, ex: Expect, variant?: { detect?: Detect }): Check[] {
  const scan = cliJson(repo, "scan");
  const strictness = cliJson(repo, "strictness");
  const tests = cliJson(repo, "tests");
  const conventions = cliJson(repo, "conventions");
  const out: Check[] = [];
  const probe = (id: string) => scan.probes[id] as { status: string; evidence: string[] } | undefined;

  out.push({ id: "mode", what: `mode is ${ex.mode}`, ok: scan.suggestedMode === ex.mode, got: `${scan.suggestedMode} (${scan.modeReason})` });

  const testApps: { root: string; kinds: string[]; criticalCandidates: { file: string; referencedBy: string[] }[]; layers: { kind: string; layer: string; status: string }[] }[] = tests.apps;
  const roots = testApps.map((a) => a.root).sort();
  out.push({ id: "apps", what: `app roots ${ex.apps.map((a) => a.root).join(", ")}`, ok: JSON.stringify(roots) === JSON.stringify(ex.apps.map((a) => a.root).sort()), got: roots.join(", ") });
  for (const a of ex.apps) {
    const got = testApps.find((t) => t.root === a.root);
    const kinds = got?.kinds ?? [];
    const ok = !!got && (a.kinds ?? []).every((k) => kinds.includes(k)) && (a.notKinds ?? []).every((k) => !kinds.includes(k));
    out.push({ id: `kinds:${a.root}`, what: `${a.root} kinds include ${(a.kinds ?? []).join("/") || "-"}, exclude ${(a.notKinds ?? []).join("/") || "-"}`, ok, got: kinds.join(", ") || "(none)" });
  }

  const detect = (id: string, what: string, d: Detect) => {
    if (d.probe) {
      const p = probe(d.probe);
      const statusOk = !!p && (d.status ?? []).includes(p.status);
      const evidenceOk = !d.evidence || (p?.evidence ?? []).some((e) => e.includes(d.evidence!));
      out.push({ id, what, ok: statusOk && evidenceOk, got: p ? `${d.probe}=${p.status}: ${p.evidence[0] ?? ""}` : `${d.probe} missing` });
    } else if (d.uncovered) {
      const app = testApps.find((a) => a.root === d.uncovered!.app);
      const c = app?.criticalCandidates.find((x) => x.file === d.uncovered!.file);
      out.push({ id, what, ok: !!c && c.referencedBy.length === 0, got: c ? `candidate, referencedBy=[${c.referencedBy.join(", ")}]` : "not a critical-path candidate" });
    }
    const last = out[out.length - 1]!;
    if (d.known && !last.ok) last.known = d.known;
  };

  for (const s of ex.seeded) if (s.detect) detect(s.id, `detects: ${s.what}`, s.detect);
  if (variant?.detect) detect("variant", "variant detection", variant.detect);

  for (const g of ex.safeguards) {
    if (g.probe) {
      const p = probe(g.probe);
      out.push({ id: g.id, what: `recognises: ${g.what}`, ok: !!p && !(g.notStatus ?? ["failed"]).includes(p.status), got: p ? `${g.probe}=${p.status}: ${p.evidence[0] ?? ""}` : `${g.probe} missing` });
    } else if (g.conventionsFor) {
      const app = conventions.apps.find((a: { root: string }) => a.root === g.conventionsFor);
      out.push({ id: g.id, what: `recognises: ${g.what}`, ok: !!app && app.conventions.length > 0, got: app ? `${app.conventions.length} conventions sources` : "app not found" });
    } else if (g.strictnessOn) {
      const app = strictness.apps.find((a: { root: string }) => a.root === g.strictnessOn!.app);
      const off = g.strictnessOn.checks.filter((id) => !(app?.checks ?? []).some((c: { id: string; status: string }) => c.id === id && c.status === "on"));
      out.push({ id: g.id, what: `recognises: ${g.what}`, ok: !!app && off.length === 0, got: off.length ? `reported off: ${off.join(", ")}` : "all on" });
    } else if (g.layer) {
      const app = testApps.find((a) => a.root === g.layer!.app);
      const present = (app?.layers ?? []).filter((l) => l.status === "present").map((l) => l.layer);
      out.push({ id: g.id, what: `recognises: ${g.what}`, ok: present.length > 0 === g.layer.present, got: present.join(", ") || "(no layers present)" });
    }
  }
  return out;
}

/** Stage defaults written by `agentic init` for the scenario's mode. */
export function gradeStage(repo: string, ex: Expect): Check[] {
  const r = run(repo, "init");
  if (r.code !== 0) throw new Error(r.err);
  const rec = readRecord(repo);
  const status = (id: string) => rec.criteria.find((c) => c.id === id)?.status ?? "missing";
  return [
    ...(ex.stage?.deferred ?? []).map((id) => ({ id: `stage:${id}`, what: `${id} deferred`, ok: status(id) === "deferred", got: status(id) })),
    ...(ex.stage?.notApplicable ?? []).map((id) => ({ id: `stage:${id}`, what: `${id} n_a`, ok: status(id) === "n_a", got: status(id) })),
  ];
}

const CITATION = /[\w./-]+\.\w+:\d+/;

/** Agent judgement: grade an assessment record (with its plan) against the ground truth. */
export function gradeRecord(rec: AssessmentRecord, ex: Expect, variant?: string): { checks: Check[]; metrics: Record<string, string | number> } {
  const out: Check[] = [];
  const status = (id: string) => rec.criteria.find((c) => c.id === id)?.status ?? "missing";
  const findingText = (f: AssessmentRecord["findings"][number]) => [f.title, f.description ?? "", f.currentState, f.desiredState, f.remediation, ...(f.evidence ?? [])].join(" \n ");
  const cites = (path: string) => rec.findings.some((f) => (f.evidence ?? []).some((e) => e.includes(path)) || findingText(f).includes(path));

  const judge = (id: string, what: string, j: Judge) => {
    if (j.finding) {
      const re = new RegExp(j.finding, "i");
      const hit = rec.findings.find((f) => re.test(findingText(f)));
      out.push({ id, what, ok: !!hit, got: hit ? `${hit.id}: ${hit.title}` : "no matching finding" });
      return;
    }
    const got = (j.criteria ?? []).map((c) => `${c}=${status(c)}`).join(", ");
    let ok = (j.criteria ?? []).every((c) => (j.status ? j.status.includes(status(c)) : true) && !(j.notStatus ?? []).includes(status(c)));
    if (j.path) ok = ok && cites(j.path);
    out.push({ id, what, ok, got: got + (j.path ? `; finding cites ${j.path}: ${cites(j.path)}` : "") });
  };

  for (const s of ex.seeded) if (s.judge) judge(s.id, `detects: ${s.what}`, s.judge);
  for (const g of ex.safeguards) if (g.judge) judge(g.id, `recognises: ${g.what}`, { notStatus: ["failed"], ...g.judge });
  for (const c of ex.stage?.deferred ?? []) out.push({ id: `stage:${c}`, what: `${c} stays deferred`, ok: ["deferred", "n_a"].includes(status(c)), got: status(c) });
  for (const c of ex.stage?.notFailedJudge ?? []) out.push({ id: `stage:${c}`, what: `${c} is not failed at this stage`, ok: status(c) !== "failed", got: status(c) });
  if (variant) (ex.variants?.[variant]?.judge ?? []).forEach((j, i) => judge(`${variant}#${i + 1}`, j.reason ?? `variant ${variant}`, j));

  const tasks = rec.tasks ?? [];
  const taskText = (t: (typeof tasks)[number]) => [t.title, t.description, ...(t.acceptanceCriteria ?? []).map((a) => a.text)].join(" \n ");
  for (const f of ex.forbidden) {
    const re = new RegExp(f.pattern, "i");
    const hits = [...tasks.filter((t) => re.test(taskText(t))).map((t) => t.id), ...rec.findings.filter((x) => !x.resolved && re.test(`${x.title} ${x.remediation ?? ""}`)).map((x) => x.id)];
    out.push({ id: `forbidden:${f.pattern.slice(0, 24)}`, what: `does not recommend: ${f.reason}`, ok: hits.length === 0, got: hits.join(", ") || "none" });
  }

  const max = ex.plan?.maxTasks;
  // Deferred tasks are triggers for later, not work now: the bound applies to open tasks.
  const openTasks = tasks.filter((t) => !t.deferredTrigger);
  if (max !== undefined && tasks.length) out.push({ id: "plan:size", what: `at most ${max} open tasks`, ok: openTasks.length <= max, got: `${openTasks.length} open, ${tasks.length - openTasks.length} deferred` });
  if (ex.plan?.noJanitorTasks) {
    const j = tasks.filter((t) => !t.deferredTrigger && /janitor|JAN-[A-Z]+-\d+/i.test(taskText(t)));
    out.push({ id: "plan:janitors", what: "no janitor tasks at this stage", ok: j.length === 0, got: j.map((t) => t.id).join(", ") || "none" });
  }
  const unlinked = tasks.filter((t) => !(t.findingIds ?? []).length);
  if (tasks.length) out.push({ id: "plan:linked", what: "every task is tied to a finding", ok: unlinked.length === 0, got: unlinked.map((t) => t.id).join(", ") || "all linked" });
  const bySet = new Map<string, string[]>();
  for (const t of tasks) {
    const k = [...(t.findingIds ?? [])].sort().join(",");
    if (k) bySet.set(k, [...(bySet.get(k) ?? []), t.id]);
  }
  const dupes = [...bySet.values()].filter((ids) => ids.length > 1);
  if (tasks.length) out.push({ id: "plan:overlap", what: "no two tasks address exactly the same findings", ok: dupes.length === 0, got: dupes.map((d) => d.join("+")).join("; ") || "none" });

  const open = rec.findings.filter((f) => !f.resolved);
  const cited = open.filter((f) => (f.evidence ?? []).some((e) => CITATION.test(e)));
  const metrics = {
    findings: open.length,
    "findings with path:line evidence": `${cited.length}/${open.length}`,
    tasks: tasks.length,
    "deferred tasks": tasks.filter((t) => t.deferredTrigger).length,
    milestones: (rec.milestones ?? []).length,
    "criteria failed": rec.criteria.filter((c) => c.status === "failed").length,
    "criteria unverified": rec.criteria.filter((c) => c.status === "unverified").length,
  };
  return { checks: out, metrics };
}

/** Share of criteria given the same status across repeated runs of one scenario. */
export function agreement(records: AssessmentRecord[]): { rate: number; differing: string[] } {
  if (records.length < 2) return { rate: 1, differing: [] };
  const ids = records[0]!.criteria.map((c) => c.id);
  const differing = ids.filter((id) => new Set(records.map((r) => r.criteria.find((c) => c.id === id)?.status)).size > 1);
  return { rate: (ids.length - differing.length) / ids.length, differing };
}

export function table(title: string, checks: Check[]): string {
  const pass = checks.filter((c) => c.ok).length;
  const lines = checks.map((c) => `  ${c.ok ? "ok  " : c.known ? "KNOWN" : "MISS"} ${c.id.padEnd(22)} ${c.what}  [${c.got}]${c.known && !c.ok ? ` (limitation: ${c.known})` : ""}`);
  return `${title}: ${pass}/${checks.length}\n${lines.join("\n")}`;
}
