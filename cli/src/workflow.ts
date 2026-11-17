import { headRevision } from "./git.js";
import { nextId, now } from "./record.js";
import { defaultCriterion, loadRubric } from "./rubric.js";
import { UsageError, type AssessmentRecord, type Evidence, type Task, type WorkStatus } from "./types.js";

const TRANSITIONS: Record<WorkStatus, WorkStatus[]> = {
  pending: ["in_progress", "blocked", "deferred"],
  in_progress: ["verification_required", "blocked", "pending"],
  verification_required: ["completed", "in_progress", "blocked"],
  blocked: ["pending", "in_progress"],
  deferred: ["pending"],
  completed: ["in_progress"],
};

export function getTask(record: AssessmentRecord, id: string): Task {
  const t = record.tasks.find((x) => x.id === id);
  if (!t) throw new UsageError(`Unknown task ${id}`);
  return t;
}

export function unmetDependencies(record: AssessmentRecord, task: Task): string[] {
  return task.dependsOn.filter((d) => record.tasks.find((t) => t.id === d)?.status !== "completed");
}

/** Acceptance criteria not yet covered by passing evidence from someone other than the implementer. */
export function uncoveredAcceptance(record: AssessmentRecord, task: Task): string[] {
  const independent = record.evidence.filter(
    (e) => e.taskId === task.id && e.result === "pass" && e.revision && e.verifier !== task.implementer,
  );
  return task.acceptanceCriteria.filter((ac) => !independent.some((e) => e.covers.includes(ac.id))).map((ac) => ac.id);
}

export interface TransitionOpts {
  by: string;
  reason?: string;
  repoRoot: string;
}

export function transitionTask(record: AssessmentRecord, id: string, to: WorkStatus, opts: TransitionOpts): Task {
  const task = getTask(record, id);
  const from = task.status;
  if (from === to) throw new UsageError(`Task ${id} is already ${to}`);
  if (!TRANSITIONS[from].includes(to)) {
    throw new UsageError(`Illegal transition for ${id}: ${from} -> ${to}. Allowed from ${from}: ${TRANSITIONS[from].join(", ")}`);
  }
  if (to === "in_progress") {
    const unmet = unmetDependencies(record, task);
    if (unmet.length) throw new UsageError(`Task ${id} has unmet dependencies: ${unmet.join(", ")}`);
    if (task.requiresApproval && !record.approvals.some((a) => a.subject === id)) {
      throw new UsageError(`Task ${id} requires an explicit approval first (agentic approve ${id} --by <human>)`);
    }
    if (from === "completed" && !opts.reason) throw new UsageError(`Reopening completed task ${id} requires --reason`);
    if (from === "pending" || from === "blocked") task.implementer = opts.by;
  }
  if (to === "blocked") {
    if (!opts.reason) throw new UsageError(`Blocking ${id} requires --reason`);
    task.blockedReason = opts.reason;
  } else if (from === "blocked") {
    delete task.blockedReason;
  }
  if (to === "deferred") {
    if (!opts.reason) throw new UsageError(`Deferring ${id} requires --reason (the activation trigger)`);
    task.deferredTrigger = opts.reason;
  }
  if (to === "completed") {
    if (opts.by === task.implementer) {
      throw new UsageError(`Task ${id} cannot be completed by its implementer (${task.implementer}). Completion requires an independent verifier.`);
    }
    const missing = uncoveredAcceptance(record, task);
    if (missing.length) {
      throw new UsageError(
        `Task ${id} cannot be completed: acceptance criteria without passing independent evidence: ${missing.join(", ")}. ` +
          `Record evidence with \`agentic evidence --task ${id} --covers <ids> --verifier <not ${task.implementer}> ...\``,
      );
    }
  }
  task.status = to;
  task.history.push({ at: now(), from, to, by: opts.by, revision: headRevision(opts.repoRoot), ...(opts.reason ? { reason: opts.reason } : {}) });
  return task;
}

export function addEvidence(record: AssessmentRecord, input: Omit<Evidence, "id" | "at" | "revision"> & { revision?: string | null }, repoRoot: string): Evidence {
  if (input.taskId) getTask(record, input.taskId);
  const known = new Set([
    ...record.tasks.flatMap((t) => t.acceptanceCriteria.map((a) => a.id)),
    ...record.milestones.flatMap((m) => m.exitCriteria.map((x) => x.id)),
  ]);
  for (const c of input.covers) if (!known.has(c)) throw new UsageError(`Evidence covers unknown acceptance/exit criterion ${c}`);
  const evidence: Evidence = {
    ...input,
    id: nextId("E", record.evidence.map((e) => e.id)),
    revision: input.revision ?? headRevision(repoRoot),
    at: now(),
  };
  record.evidence.push(evidence);
  return evidence;
}

const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 } as const;

export function readyTasks(record: AssessmentRecord): Task[] {
  const msOrder = new Map(record.milestones.map((m, i) => [m.id, i]));
  const msReady = (mid: string) => {
    const m = record.milestones.find((x) => x.id === mid);
    return !m || m.dependsOn.every((d) => record.milestones.find((x) => x.id === d)?.status === "completed");
  };
  return record.tasks
    .filter((t) => t.status === "pending" && unmetDependencies(record, t).length === 0 && msReady(t.milestoneId))
    .sort(
      (a, b) =>
        (msOrder.get(a.milestoneId) ?? 0) - (msOrder.get(b.milestoneId) ?? 0) ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        a.id.localeCompare(b.id),
    );
}

type Collection = "criteria" | "findings" | "milestones" | "tasks" | "approvals" | "conventions";
const PATCHABLE: Collection[] = ["criteria", "findings", "milestones", "tasks", "approvals", "conventions"];
const FORBIDDEN = ["scoreHistory", "recordRevision", "artifact", "evidence", "schemaVersion", "createdAt", "updatedAt", "rubricVersion"];

export interface Patch {
  assessedRevision?: string | null;
  mode?: "greenfield" | "existing";
  criteria?: Record<string, unknown>[];
  findings?: Record<string, unknown>[];
  milestones?: Record<string, unknown>[];
  tasks?: Record<string, unknown>[];
  approvals?: Record<string, unknown>[];
  conventions?: Record<string, unknown>[];
  testing?: Record<string, unknown>[];
  docs?: Record<string, unknown>;
  remove?: Partial<Record<Collection | "testing", string[]>> & { docs?: boolean };
}

/**
 * The single write path for Claude-authored content. Upserts by id with a
 * shallow merge. Scores, evidence and task status changes have their own
 * guarded commands and are rejected here.
 */
export function applyPatch(record: AssessmentRecord, patch: Patch, opts: { by: string; repoRoot: string }): string[] {
  const log: string[] = [];
  for (const key of Object.keys(patch)) {
    if (FORBIDDEN.includes(key)) throw new UsageError(`"${key}" cannot be written with apply. ${key === "evidence" ? "Use `agentic evidence`." : "It is computed by the CLI."}`);
    if (![...PATCHABLE, "testing", "docs", "assessedRevision", "mode", "remove"].includes(key)) throw new UsageError(`Unknown patch key "${key}"`);
  }
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
      if (coll === "milestones") item.status = existing?.status ?? "pending";
      if (coll === "tasks") {
        if (existing && item.status !== undefined && item.status !== existing.status) {
          throw new UsageError(`Task ${id} status must change through \`agentic task ${id} <status>\`, not apply`);
        }
        if (!existing) {
          const s = (item.status as string | undefined) ?? "pending";
          if (!["pending", "deferred", "blocked"].includes(s)) throw new UsageError(`New task ${id} must start pending, deferred or blocked`);
          item.status = s;
          item.history ??= [];
          item.dependsOn ??= [];
          item.findingIds ??= [];
        } else {
          delete item.history;
          delete item.implementer;
        }
      }
      if (coll === "findings" && !existing) {
        item.taskIds ??= [];
        item.criterionIds ??= [];
        item.evidence ??= [];
      }
      if (coll === "approvals" && !existing) item.at ??= now();
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

  // Keep finding.taskIds consistent with task.findingIds (both directions).
  for (const t of record.tasks) {
    for (const fid of t.findingIds) {
      const f = record.findings.find((x) => x.id === fid);
      if (f && !f.taskIds.includes(t.id)) f.taskIds.push(t.id);
    }
  }

  for (const [coll, ids] of Object.entries(patch.remove ?? {}) as [Collection | "testing" | "docs", string[] | boolean][]) {
    if (coll === "docs") {
      if (!ids) continue;
      if (!record.docs) throw new UsageError("Cannot remove docs: there is no documentation assessment");
      delete record.docs;
      log.push("removed docs");
      continue;
    }
    if (typeof ids === "boolean") throw new UsageError(`remove.${coll} must be a list of ids`);
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
      if (coll === "tasks" && target[idx]!.status === "completed") throw new UsageError(`Completed task ${id} cannot be removed`);
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
