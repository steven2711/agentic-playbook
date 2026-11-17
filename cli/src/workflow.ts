import { checkCitations } from "./citations.js";
import { headRevision } from "./git.js";
import { loadMaintenance } from "./maintenance.js";
import { nextId, now, taskAddressed } from "./record.js";
import { defaultCriterion, loadRubric } from "./rubric.js";
import { UsageError, type AssessmentRecord, type ExitCriterion, type Task } from "./types.js";

export function getTask(record: AssessmentRecord, id: string): Task {
  const t = record.tasks.find((x) => x.id === id);
  if (!t) throw new UsageError(`Unknown task ${id}`);
  return t;
}

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 } as const;

export interface RoadmapEntry {
  task: Task;
  /** Every task it depends on is addressed. */
  ready: boolean;
  waitingOn: string[];
}

/**
 * The open tasks (not addressed, not deferred) in the order the plan intends:
 * milestone order, then dependencies, then priority. A handoff list for the
 * team's own workflow; the playbook does not track who works on what.
 */
export function roadmapOrder(record: AssessmentRecord): RoadmapEntry[] {
  const msOrder = new Map(record.milestones.map((m, i) => [m.id, i]));
  const open = record.tasks.filter((t) => !t.deferredTrigger && !taskAddressed(record, t));
  const openIds = new Set(open.map((t) => t.id));
  const sorted = [...open].sort(
    (a, b) =>
      (msOrder.get(a.milestoneId) ?? 0) - (msOrder.get(b.milestoneId) ?? 0) ||
      PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
      a.id.localeCompare(b.id),
  );
  // Stable topological pass so a task never precedes an open dependency.
  const out: Task[] = [];
  const placed = new Set<string>();
  const place = (t: Task, seen: Set<string>) => {
    if (placed.has(t.id) || seen.has(t.id)) return;
    seen.add(t.id);
    for (const d of t.dependsOn) {
      const dep = open.find((x) => x.id === d);
      if (dep) place(dep, seen);
    }
    placed.add(t.id);
    out.push(t);
  };
  for (const t of sorted) place(t, new Set());
  return out.map((task) => {
    const waitingOn = task.dependsOn.filter((d) => openIds.has(d));
    return { task, ready: waitingOn.length === 0, waitingOn };
  });
}

type Collection = "criteria" | "findings" | "milestones" | "tasks" | "conventions";
const PATCHABLE: Collection[] = ["criteria", "findings", "milestones", "tasks", "conventions"];
const FORBIDDEN: Record<string, string> = {
  approvals: "Approvals record a human decision and are written only by `agentic approve <subject> --by human:<name>`, after the user says so in the session.",
  evidence: "The record keeps no execution evidence. Cite what you observed in the item's own `evidence` strings.",
  scoreHistory: "It is computed by the CLI (`agentic score`).",
  recordRevision: "It is computed by the CLI.",
  artifact: "It is set by `agentic published`.",
  schemaVersion: "It is set by the CLI.",
  createdAt: "It is set by the CLI.",
  updatedAt: "It is set by the CLI.",
  rubricVersion: "It is set by the CLI.",
  migrations: "It is set by the CLI when it migrates a record.",
};
const TASK_EXECUTION_FIELDS = ["status", "history", "implementer", "blockedReason"];

/** Scan hints from scan.json: what the deterministic probes said about each criterion. */
export type ScanHints = Record<string, { probe: string; status: string; evidence: string[] }>;

export interface Patch {
  assessedRevision?: string | null;
  mode?: "greenfield" | "existing";
  criteria?: Record<string, unknown>[];
  findings?: Record<string, unknown>[];
  milestones?: Record<string, unknown>[];
  tasks?: Record<string, unknown>[];
  conventions?: Record<string, unknown>[];
  testing?: Record<string, unknown>[];
  docs?: Record<string, unknown>;
  maintenance?: Record<string, unknown>;
  remove?: Partial<Record<Collection | "testing" | "exitCriteria", string[]>> & { docs?: boolean; maintenance?: boolean };
}

/**
 * Checks that need the patch as a whole, before anything is merged: precise
 * citations must exist in the worktree, and a criterion marked passed against
 * a failing deterministic probe must say why.
 */
function precheck(record: AssessmentRecord, patch: Patch, repoRoot: string, hints: ScanHints | null): string[] {
  const problems: string[] = [];
  const cite = (label: string, ev: unknown) => problems.push(...checkCitations(repoRoot, label, ev));
  for (const c of patch.criteria ?? []) {
    cite(`criterion ${String(c.id)}`, c.evidence);
    const hint = hints?.[c.id as string];
    const existing = record.criteria.find((x) => x.id === c.id);
    // An earlier note may argue the opposite. Moving to passed needs its reason in the same item; a criterion
    // already passed with a stated reason keeps it.
    const notes = existing?.status === "passed" ? ((c.notes as string | undefined) ?? existing.notes) : (c.notes as string | undefined);
    if (c.status === "passed" && hint?.status === "failed" && !notes?.trim()) {
      problems.push(
        `criterion ${String(c.id)} is marked passed, but the deterministic probe ${hint.probe} failed: ${hint.evidence.join("; ") || "no evidence"}. ` +
          'Either the probe is wrong here (say why in "notes", citing what you read) or the criterion is not passed.',
      );
    }
  }
  for (const f of patch.findings ?? []) cite(`finding ${String(f.id)}`, f.evidence);
  for (const c of patch.conventions ?? []) cite(`convention ${String(c.id ?? `${String(c.scope)} ${String(c.rule)}`)}`, c.evidence);
  for (const m of patch.milestones ?? []) {
    if (m.exitCriteria !== undefined && !Array.isArray(m.exitCriteria)) {
      problems.push(`milestone ${String(m.id)} exitCriteria must be a list`);
      continue;
    }
    const current = record.milestones.find((x) => x.id === m.id)?.exitCriteria ?? [];
    for (const x of (m.exitCriteria as Record<string, unknown>[] | undefined) ?? []) {
      cite(`exit criterion ${String(x.id)}`, x.evidence);
      // A judgement stands on its own evidence: never inherit evidence written for a different judgement.
      const was = current.find((y) => y.id === x.id)?.status;
      if (x.status === "met" && was !== "met" && !(Array.isArray(x.evidence) && x.evidence.length))
        problems.push(`exit criterion ${String(x.id)} is judged met without evidence in this patch. Cite what reassessment observed.`);
      if (x.status === "unverified" && was !== "unverified" && !x.reason) problems.push(`exit criterion ${String(x.id)} is judged unverified without a reason in this patch.`);
    }
  }
  for (const t of patch.testing ?? []) for (const l of (Array.isArray(t.layers) ? (t.layers as Record<string, unknown>[]) : [])) cite(`testing ${String(t.scope)} layer ${String(l.id)}`, l.evidence);
  for (const d of (Array.isArray(patch.docs?.target) ? (patch.docs!.target as Record<string, unknown>[]) : [])) cite(`docs target ${String(d.id)} (${String(d.scope)})`, d.evidence);
  for (const r of (Array.isArray(patch.maintenance?.roster) ? (patch.maintenance!.roster as Record<string, unknown>[]) : [])) cite(`maintenance ${String(r.id)}`, r.evidence);
  return problems;
}

/**
 * The single write path for Claude-authored content. Upserts by id with a
 * shallow merge (milestone exit criteria merge by id). Scores and approvals
 * have their own commands and are rejected here; so is task execution state,
 * which the record no longer holds.
 */
export function applyPatch(record: AssessmentRecord, patch: Patch, opts: { by: string; repoRoot: string; hints?: ScanHints | null }): string[] {
  const log: string[] = [];
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new UsageError("A patch must be a JSON object");
  for (const key of Object.keys(patch)) {
    if (FORBIDDEN[key]) throw new UsageError(`Refused: "${key}" cannot be written with apply. ${FORBIDDEN[key]}`);
    if (![...PATCHABLE, "testing", "docs", "maintenance", "assessedRevision", "mode", "remove"].includes(key)) throw new UsageError(`Unknown patch key "${key}"`);
  }
  for (const key of Object.keys(patch.remove ?? {})) {
    if (FORBIDDEN[key]) throw new UsageError(`Refused: "${key}" cannot be removed with apply. ${FORBIDDEN[key]}`);
  }
  for (const t of patch.tasks ?? []) {
    const exec = TASK_EXECUTION_FIELDS.filter((k) => k in t);
    if (exec.length) {
      throw new UsageError(
        `Refused: task ${String(t.id)} sets ${exec.join(", ")}. Tasks carry no execution state; the team implements them in its own workflow. ` +
          "Progress shows up when /agentic:reassess resolves the task's findings and judges its milestone's exit criteria. To defer a task, set deferredTrigger.",
      );
    }
  }
  const problems = precheck(record, patch, opts.repoRoot, opts.hints ?? null);
  if (problems.length) throw new UsageError(`Refusing the patch: ${problems.length} evidence problem${problems.length === 1 ? "" : "s"}:\n  - ${problems.join("\n  - ")}`);
  if (patch.assessedRevision !== undefined) {
    record.assessedRevision = patch.assessedRevision === "HEAD" ? headRevision(opts.repoRoot) : patch.assessedRevision;
    log.push(`assessedRevision = ${record.assessedRevision}`);
  }
  const rubricIds = new Set(loadRubric().criteria.map((c) => c.id));

  for (const coll of PATCHABLE) {
    const items = patch[coll];
    if (!items) continue;
    const target = record[coll] as unknown as Record<string, unknown>[];
    for (const item of items) {
      if (coll === "conventions" && !item.id) {
        // Stable identity per (scope, rule): reuse the existing id, else allocate CV-NNN.
        const same = record.conventions.find((c) => c.scope === item.scope && c.rule === item.rule);
        item.id = same?.id ?? nextId("CV", record.conventions.map((c) => c.id));
      }
      const id = item.id as string | undefined;
      if (!id) throw new UsageError(`${coll} item without id`);
      const existing = target.find((x) => x.id === id);
      if (coll === "criteria") {
        if (!rubricIds.has(id)) throw new UsageError(`Unknown criterion ${id}`);
        item.assessedBy ??= opts.by;
        item.assessedAt ??= now();
        item.stageDefault ??= false;
        if (item.status !== "n_a" && item.status !== "unverified" && existing) delete existing.reason;
        if (item.status !== "deferred" && existing) delete existing.trigger;
      }
      if (coll === "milestones") {
        delete item.status; // derived
        item.status = existing?.status ?? "pending";
        if (Array.isArray(item.exitCriteria)) {
          // Exit criteria merge by id, so reassessment can judge one without restating the rest.
          const merged = ((existing?.exitCriteria as ExitCriterion[] | undefined) ?? []).map((x) => ({ ...x }));
          for (const x of item.exitCriteria as Record<string, unknown>[]) {
            const judged = x.status !== undefined && x.status !== merged.find((y) => y.id === x.id)?.status;
            if (judged || x.evidence !== undefined) {
              x.assessedBy ??= opts.by;
              x.assessedAt ??= now();
            }
            const cur = merged.find((y) => y.id === x.id);
            if (cur) {
              // A reworded criterion is a different criterion: its old judgement does not carry over.
              if (typeof x.text === "string" && x.text !== cur.text) for (const k of ["status", "evidence", "reason", "assessedBy", "assessedAt"] as const) delete cur[k];
              if (x.status && x.status !== cur.status) for (const k of ["evidence", "reason"] as const) delete cur[k];
              Object.assign(cur, x);
            } else merged.push(x as unknown as ExitCriterion);
          }
          item.exitCriteria = merged;
        }
      }
      if (coll === "tasks" && !existing) {
        item.dependsOn ??= [];
        item.findingIds ??= [];
      }
      if (coll === "findings" && !existing) {
        item.taskIds ??= [];
        item.criterionIds ??= [];
        item.evidence ??= [];
      }
      if (coll === "conventions") {
        item.assessedBy ??= opts.by;
        item.assessedAt ??= now();
        if (!existing) {
          item.evidence ??= [];
          item.decision ??= "proposed";
        }
        if (existing && item.status && item.status !== "n_a") delete existing.reason;
      }
      if (existing) Object.assign(existing, item);
      else target.push(item);
      log.push(`${existing ? "updated" : "added"} ${id}`);
    }
  }

  // Testing assessments are per-app snapshots: replaced whole, keyed by scope.
  for (const item of patch.testing ?? []) {
    const scope = item.scope as string | undefined;
    if (!scope) throw new UsageError("testing item without scope");
    record.testing ??= [];
    const entry = { ...item, assessedBy: item.assessedBy ?? opts.by, assessedAt: item.assessedAt ?? now() } as unknown as NonNullable<AssessmentRecord["testing"]>[number];
    const idx = record.testing.findIndex((t) => t.scope === scope);
    if (idx >= 0) record.testing[idx] = entry;
    else record.testing.push(entry);
    log.push(`${idx >= 0 ? "replaced" : "added"} testing ${scope}`);
  }

  // The documentation assessment is one snapshot per repository: replaced whole.
  if (patch.docs) {
    const d = patch.docs;
    if (!Array.isArray(d.inventory) || !Array.isArray(d.target)) throw new UsageError("docs needs inventory and target arrays");
    const replaced = !!record.docs;
    record.docs = { ...d, assessedBy: (d.assessedBy as string | undefined) ?? opts.by, assessedAt: (d.assessedAt as string | undefined) ?? now() } as unknown as NonNullable<AssessmentRecord["docs"]>;
    log.push(`${replaced ? "replaced" : "added"} docs (${d.target.length} target entries, ${d.inventory.length} inventory entries)`);
  }

  // The maintenance roster is one snapshot per repository: replaced whole.
  if (patch.maintenance) {
    const m = patch.maintenance;
    if (!Array.isArray(m.roster)) throw new UsageError("maintenance needs a roster array");
    const replaced = !!record.maintenance;
    record.maintenance = { ...m, assessedBy: (m.assessedBy as string | undefined) ?? opts.by, assessedAt: (m.assessedAt as string | undefined) ?? now() } as unknown as NonNullable<AssessmentRecord["maintenance"]>;
    log.push(`${replaced ? "replaced" : "added"} maintenance (${m.roster.length} janitors)`);
    // Recommending a janitor "now" is a claim that its contract exists and is enforced. Hold it to that when the roster is written.
    const lib = loadMaintenance();
    const crit = new Map(record.criteria.map((c) => [c.id, c.status]));
    const unmet = (m.roster as { id: string; recommend?: string }[])
      .filter((r) => r.recommend === "now")
      .flatMap((r) => {
        const missing = (lib.items.get(r.id)?.prerequisites ?? []).filter((p) => crit.get(p) !== "passed");
        return missing.length ? [`${r.id} needs ${missing.map((p) => `${p} (${crit.get(p) ?? "missing"})`).join(", ")}`] : [];
      });
    if (unmet.length) {
      throw new UsageError(
        `Refused: janitors recommended "now" whose prerequisites have not passed:\n  - ${unmet.join("\n  - ")}\n` +
          'A prerequisite must be passed, not n_a: the janitor guards a contract that has to exist. Use "recommend": "after-prerequisites" with those criteria in "blockedBy".',
      );
    }
  }

  // Keep finding.taskIds consistent with task.findingIds (both directions).
  for (const t of record.tasks) {
    for (const fid of t.findingIds) {
      const f = record.findings.find((x) => x.id === fid);
      if (f && !f.taskIds.includes(t.id)) f.taskIds.push(t.id);
    }
  }

  for (const [coll, ids] of Object.entries(patch.remove ?? {}) as [Collection | "testing" | "docs" | "maintenance" | "exitCriteria", string[] | boolean][]) {
    if (coll === "maintenance") {
      if (!ids) continue;
      if (!record.maintenance) throw new UsageError("Cannot remove maintenance: there is no maintenance assessment");
      delete record.maintenance;
      log.push("removed maintenance");
      continue;
    }
    if (coll === "docs") {
      if (!ids) continue;
      if (!record.docs) throw new UsageError("Cannot remove docs: there is no documentation assessment");
      delete record.docs;
      log.push("removed docs");
      continue;
    }
    if (typeof ids === "boolean") throw new UsageError(`remove.${coll} must be a list of ids`);
    if (coll === "exitCriteria") {
      for (const id of ids) {
        const m = record.milestones.find((x) => x.exitCriteria.some((e) => e.id === id));
        if (!m) throw new UsageError(`Cannot remove unknown exit criterion ${id}`);
        if (m.exitCriteria.length === 1) throw new UsageError(`Cannot remove ${id}: milestone ${m.id} needs at least one exit criterion`);
        m.exitCriteria = m.exitCriteria.filter((e) => e.id !== id);
        log.push(`removed ${id}`);
      }
      continue;
    }
    if (coll === "testing") {
      for (const scope of ids) {
        const idx = (record.testing ?? []).findIndex((t) => t.scope === scope);
        if (idx < 0) throw new UsageError(`Cannot remove unknown testing scope ${scope}`);
        record.testing!.splice(idx, 1);
        log.push(`removed testing ${scope}`);
      }
      continue;
    }
    if (coll === "criteria") throw new UsageError("Criteria cannot be removed; mark them n_a with a reason");
    const target = record[coll] as unknown as { id: string; status?: string }[];
    for (const id of ids) {
      const idx = target.findIndex((x) => x.id === id);
      if (idx < 0) throw new UsageError(`Cannot remove unknown ${coll} id ${id}`);
      if (coll === "tasks" && taskAddressed(record, target[idx] as unknown as Task)) {
        throw new UsageError(`Task ${id} cannot be removed: reassessment found it addressed (its findings are resolved). Keep it as the record of that work.`);
      }
      target.splice(idx, 1);
      log.push(`removed ${id}`);
    }
  }

  if (patch.mode && patch.mode !== record.mode) {
    record.mode = patch.mode;
    for (const rc of loadRubric().criteria) {
      const cur = record.criteria.find((c) => c.id === rc.id);
      if (cur && (cur.stageDefault || (cur.status === "unverified" && cur.evidence.length === 0))) {
        Object.assign(cur, { reason: undefined, trigger: undefined }, defaultCriterion(rc, patch.mode));
        if (cur.reason === undefined) delete cur.reason;
        if (cur.trigger === undefined) delete cur.trigger;
        if (!defaultCriterion(rc, patch.mode).stageDefault) delete cur.stageDefault;
      }
    }
    log.push(`mode = ${patch.mode} (stage-default criteria recomputed)`);
  }
  return log;
}
