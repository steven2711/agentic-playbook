import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { defaultBranch, headRevision, remoteUrl } from "./git.js";
import type { StoreLocation } from "./paths.js";
import { defaultCriterion, loadRubric } from "./rubric.js";
import { SCHEMA_VERSION, UsageError, type AssessmentRecord, type Milestone, type MilestoneStatus, type Mode, type Task } from "./types.js";
import { validateRecord } from "./validate.js";

export const now = () => new Date().toISOString();

export function createRecord(store: StoreLocation, mode: Mode): AssessmentRecord {
  const rubric = loadRubric();
  const at = now();
  return {
    schemaVersion: SCHEMA_VERSION,
    assessmentId: `agentic-${basename(store.repoRoot)}-${at.slice(0, 10)}`,
    mode,
    rubricVersion: rubric.version,
    repo: { name: basename(store.repoRoot), remote: remoteUrl(store.repoRoot), defaultBranch: defaultBranch(store.repoRoot) },
    assessedRevision: headRevision(store.repoRoot),
    recordRevision: 1,
    createdAt: at,
    updatedAt: at,
    criteria: rubric.criteria.map((c) => defaultCriterion(c, mode)),
    findings: [],
    milestones: [],
    tasks: [],
    approvals: [],
    conventions: [],
    scoreHistory: [],
    artifact: null,
  };
}

/** Records loaded from an older schema, with the original text to back up before the first write. */
const pendingBackups = new WeakMap<AssessmentRecord, { text: string; from: number }>();

export function loadRecord(store: StoreLocation): AssessmentRecord {
  if (!existsSync(store.recordPath)) {
    throw new UsageError(`No assessment record for this repository (looked in ${store.recordPath}). Run \`agentic init\` first.`);
  }
  const text = readFileSync(store.recordPath, "utf8");
  let record = JSON.parse(text) as AssessmentRecord;
  const version = (record as { schemaVersion?: number }).schemaVersion;
  if (version === 1) {
    record = migrateV1(record as unknown as Record<string, unknown>);
    pendingBackups.set(record, { text, from: 1 });
  } else if (version !== SCHEMA_VERSION) {
    throw new UsageError(`Record schemaVersion ${String(version)} is not supported by this CLI (expects ${SCHEMA_VERSION}). Update the plugin.`);
  }
  record.conventions ??= [];
  // Rubric gained criteria since this record was created: add them as unverified.
  const rubric = loadRubric();
  for (const c of rubric.criteria) {
    if (!record.criteria.some((s) => s.id === c.id)) {
      record.criteria.push({ ...defaultCriterion(c, record.mode), reason: `Added in rubric v${rubric.version}; not yet assessed.` });
    }
  }
  return record;
}

/** True when the record was loaded from an older schema and has not been written since. */
export function pendingMigration(record: AssessmentRecord): number | null {
  return pendingBackups.get(record)?.from ?? null;
}

export const V1_BACKUP = "record.v1-backup.json";

type Loose = Record<string, any>;

/**
 * v1 records carried execution state: task statuses, transition history,
 * implementers and verification evidence. v2 is analysis and planning only.
 * Execution state is dropped (the original is backed up on the first write).
 * v1 evidence on a milestone exit criterion was agent-reported and never
 * citation-checked, so it is not promoted to `met`: the criterion becomes
 * `unverified`, quoting that evidence, for the next reassessment to judge.
 */
export function migrateV1(v1: Loose): AssessmentRecord {
  const r = structuredClone(v1);
  const evidence: Loose[] = Array.isArray(r.evidence) ? r.evidence : [];
  for (const t of (r.tasks ?? []) as Loose[]) {
    if (t.status !== "deferred") delete t.deferredTrigger;
    for (const k of ["status", "history", "implementer", "blockedReason"]) delete t[k];
  }
  for (const m of (r.milestones ?? []) as Loose[]) {
    for (const x of (m.exitCriteria ?? []) as Loose[]) {
      const covering = evidence.filter((e) => (e.covers ?? []).includes(x.id) && (!e.milestoneId || e.milestoneId === m.id));
      if (!covering.length) continue;
      const latest = [...covering].sort((a, b) => String(a.at).localeCompare(String(b.at))).at(-1)!;
      x.status = "unverified";
      x.evidence = covering.map((e) => `v1 evidence ${e.id} (${e.result}): ${e.action}${e.location ? ` (${e.location})` : ""} at ${String(e.revision ?? "no revision").slice(0, 12)} by ${e.verifier}`);
      x.reason = `Carried over from v1 evidence (latest ${latest.id}: ${latest.result}), which was agent-reported and not checked. Reassess to judge it; the original record is in ${V1_BACKUP}.`;
      x.assessedBy = "migration:v1";
      x.assessedAt = now();
    }
  }
  delete r.evidence;
  r.schemaVersion = SCHEMA_VERSION;
  const record = r as AssessmentRecord;
  const hash = planHash(record);
  const notes: string[] = [];
  const approvals = ((r.approvals ?? []) as Loose[]).filter((a) => {
    if (typeof a.approvedBy === "string" && /^human:.+/.test(a.approvedBy)) return true;
    notes.push(`dropped approval ${a.id} for ${a.subject}: approvedBy "${a.approvedBy}" is not a human attribution (likely written by a patch)`);
    return false;
  });
  record.approvals = approvals.map((a) => {
    const roadmap = a.subject === "roadmap";
    return {
      id: a.id,
      subject: a.subject,
      approvedBy: a.approvedBy,
      at: a.at,
      source: "local" as const,
      scope: roadmap ? ("roadmap" as const) : ("decision" as const),
      ...(roadmap ? { planHash: hash, migrated: true } : {}),
      ...(a.note ? { note: a.note } : {}),
    };
  });
  if (evidence.length) notes.push(`removed ${evidence.length} v1 evidence entr${evidence.length === 1 ? "y" : "ies"}; exit criteria it covered are unverified until reassessment judges them`);
  record.migrations = [...(record.migrations ?? []), { from: 1, to: SCHEMA_VERSION, at: now(), backup: V1_BACKUP, ...(notes.length ? { notes } : {}) }];
  for (const m of record.milestones) m.status = deriveMilestoneStatus(record, m);
  return record;
}

/** A task is addressed when reassessment has resolved every finding it was planned to fix. */
export function taskAddressed(record: AssessmentRecord, t: Task): boolean {
  if (!t.findingIds.length) return false;
  return t.findingIds.every((id) => record.findings.find((f) => f.id === id)?.resolved === true);
}

/** Milestone status is derived from reassessment judgements, never written. */
export function deriveMilestoneStatus(record: AssessmentRecord, m: Milestone): MilestoneStatus {
  const tasks = record.tasks.filter((t) => t.milestoneId === m.id);
  if (tasks.length && tasks.every((t) => t.deferredTrigger)) return "deferred";
  if (m.exitCriteria.length && m.exitCriteria.every((x) => x.status === "met")) return "completed";
  if (m.exitCriteria.some((x) => x.status === "met") || tasks.some((t) => taskAddressed(record, t))) return "in_progress";
  return "pending";
}

/** Canonical JSON: sorted keys, and absent, null, empty-list and empty-string values treated alike. */
const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical);
  if (v && typeof v === "object") {
    const empty = (x: unknown) => x === undefined || x === null || x === "" || (Array.isArray(x) && x.length === 0);
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .filter((k) => !empty((v as Loose)[k]))
        .map((k) => [k, canonical((v as Loose)[k])]),
    );
  }
  return v;
};
const sortedIds = (xs: string[] | undefined) => (xs ? [...xs].sort() : xs);

/**
 * The content a roadmap approval approves: milestones and tasks as planned,
 * excluding reassessment judgements (exit-criterion status and evidence), so
 * progress does not invalidate an approval but a changed plan does.
 */
export function planHash(record: AssessmentRecord): string {
  const byId = <T extends { id: string }>(xs: T[]) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  const plan = {
    milestones: byId(record.milestones).map((m) => ({
      id: m.id,
      title: m.title,
      objective: m.objective,
      scope: m.scope,
      outcomes: m.outcomes,
      dependsOn: sortedIds(m.dependsOn),
      exitCriteria: m.exitCriteria.map((x) => ({ id: x.id, text: x.text })),
    })),
    tasks: byId(record.tasks).map((t) => ({
      id: t.id,
      milestoneId: t.milestoneId,
      title: t.title,
      description: t.description,
      priority: t.priority,
      dependsOn: sortedIds(t.dependsOn),
      findingIds: sortedIds(t.findingIds),
      acceptanceCriteria: t.acceptanceCriteria,
      verification: t.verification,
      requiresApproval: t.requiresApproval || undefined,
      deferredTrigger: t.deferredTrigger,
    })),
  };
  return createHash("sha256").update(JSON.stringify(canonical(plan))).digest("hex");
}

/** The latest roadmap approval and whether it still matches the plan. */
export function roadmapApproval(record: AssessmentRecord) {
  const approval = [...record.approvals].reverse().find((a) => a.scope === "roadmap");
  if (!approval) return { approval: null, current: false };
  return { approval, current: approval.planHash === planHash(record) };
}

/** Persist a record: derive statuses, validate, bump revision, write atomically. Backs up a migrated record's original first. */
export function saveRecord(store: StoreLocation, record: AssessmentRecord, opts: { bump?: boolean } = {}): AssessmentRecord {
  for (const m of record.milestones) m.status = deriveMilestoneStatus(record, m);
  if (opts.bump !== false) {
    record.recordRevision += 1;
    record.updatedAt = now();
  }
  const { errors } = validateRecord(record);
  if (errors.length) throw new UsageError(`Refusing to write an invalid record:\n  - ${errors.join("\n  - ")}`);
  mkdirSync(dirname(store.recordPath), { recursive: true });
  const pending = pendingBackups.get(record);
  if (pending) {
    const backup = join(dirname(store.recordPath), V1_BACKUP);
    if (!existsSync(backup)) writeFileSync(backup, pending.text);
    pendingBackups.delete(record);
  }
  const tmp = `${store.recordPath}.tmp`;
  writeFileSync(tmp, JSON.stringify(record, null, 2) + "\n");
  renameSync(tmp, store.recordPath);
  return record;
}

export function nextId(prefix: string, existing: string[]): string {
  let max = 0;
  for (const id of existing) {
    const m = id.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}
