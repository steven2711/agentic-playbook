import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { defaultBranch, headRevision, remoteUrl } from "./git.js";
import type { StoreLocation } from "./paths.js";
import { defaultCriterion, loadRubric } from "./rubric.js";
import { UsageError, type AssessmentRecord, type Milestone, type Mode, type WorkStatus } from "./types.js";
import { validateRecord } from "./validate.js";

export const now = () => new Date().toISOString();

export function createRecord(store: StoreLocation, mode: Mode): AssessmentRecord {
  const rubric = loadRubric();
  const at = now();
  return {
    schemaVersion: 1,
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
    evidence: [],
    approvals: [],
    conventions: [],
    scoreHistory: [],
    artifact: null,
  };
}

export function loadRecord(store: StoreLocation): AssessmentRecord {
  if (!existsSync(store.recordPath)) {
    throw new UsageError(`No assessment record for this repository (looked in ${store.recordPath}). Run \`agentic init\` first.`);
  }
  const record = JSON.parse(readFileSync(store.recordPath, "utf8")) as AssessmentRecord;
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

/** Milestone status is derived, never written: see templates/assessment-artifact.md §6. */
export function deriveMilestoneStatus(record: AssessmentRecord, m: Milestone): WorkStatus {
  const tasks = record.tasks.filter((t) => t.milestoneId === m.id);
  if (tasks.length === 0) return "pending";
  const statuses = tasks.map((t) => t.status);
  if (statuses.every((s) => s === "deferred")) return "deferred";
  const live = statuses.filter((s) => s !== "deferred");
  if (live.every((s) => s === "completed")) {
    return exitCriteriaMet(record, m) ? "completed" : "verification_required";
  }
  if (live.some((s) => s === "in_progress" || s === "verification_required" || s === "completed")) return "in_progress";
  if (live.some((s) => s === "blocked")) return "blocked";
  return "pending";
}

export function exitCriteriaMet(record: AssessmentRecord, m: Milestone): boolean {
  return m.exitCriteria.every((ec) =>
    record.evidence.some((e) => e.result === "pass" && e.covers.includes(ec.id) && (e.milestoneId === m.id || !e.milestoneId)),
  );
}

/** Persist a record: derive statuses, validate, bump revision, write atomically. */
export function saveRecord(store: StoreLocation, record: AssessmentRecord, opts: { bump?: boolean } = {}): AssessmentRecord {
  for (const m of record.milestones) m.status = deriveMilestoneStatus(record, m);
  if (opts.bump !== false) {
    record.recordRevision += 1;
    record.updatedAt = now();
  }
  const { errors } = validateRecord(record);
  if (errors.length) throw new UsageError(`Refusing to write an invalid record:\n  - ${errors.join("\n  - ")}`);
  mkdirSync(dirname(store.recordPath), { recursive: true });
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
