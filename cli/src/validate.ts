import { Ajv, type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { playbookRoot } from "./paths.js";
import { loadLibrary } from "./conventions.js";
import { loadRubric } from "./rubric.js";
import { loadTesting } from "./testing.js";
import type { AssessmentRecord } from "./types.js";

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

let validator: ValidateFunction | null = null;

function schemaValidator(): ValidateFunction {
  if (!validator) {
    const schema = JSON.parse(readFileSync(join(playbookRoot(), "schema", "record.schema.json"), "utf8"));
    const ajv = new Ajv({ allErrors: true, strict: false });
    validator = ajv.compile(schema);
  }
  return validator;
}

function findCycle(nodes: { id: string; dependsOn: string[] }[]): string[] | null {
  const deps = new Map(nodes.map((n) => [n.id, n.dependsOn]));
  const state = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const visit = (id: string): string[] | null => {
    if (state.get(id) === 2) return null;
    if (state.get(id) === 1) return [...stack.slice(stack.indexOf(id)), id];
    state.set(id, 1);
    stack.push(id);
    for (const d of deps.get(id) ?? []) {
      if (!deps.has(d)) continue;
      const c = visit(d);
      if (c) return c;
    }
    stack.pop();
    state.set(id, 2);
    return null;
  };
  for (const n of nodes) {
    const c = visit(n.id);
    if (c) return c;
  }
  return null;
}

function dupes(ids: string[]): string[] {
  const seen = new Set<string>();
  const out = new Set<string>();
  for (const id of ids) (seen.has(id) ? out : seen).add(id);
  return [...out];
}

export function validateRecord(record: AssessmentRecord): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const validate = schemaValidator();
  if (!validate(record)) {
    for (const e of validate.errors ?? []) errors.push(`schema: ${e.instancePath || "/"} ${e.message}`);
    return { errors, warnings };
  }

  const rubric = loadRubric();
  const rubricIds = new Set(rubric.criteria.map((c) => c.id));
  const taskIds = new Set(record.tasks.map((t) => t.id));
  const milestoneIds = new Set(record.milestones.map((m) => m.id));
  const findingIds = new Set(record.findings.map((f) => f.id));
  const evidenceIds = new Set(record.evidence.map((e) => e.id));

  for (const [kind, ids] of [
    ["criterion", record.criteria.map((c) => c.id)],
    ["finding", record.findings.map((f) => f.id)],
    ["milestone", record.milestones.map((m) => m.id)],
    ["task", record.tasks.map((t) => t.id)],
    ["evidence", record.evidence.map((e) => e.id)],
    ["approval", record.approvals.map((a) => a.id)],
    ["convention", record.conventions.map((c) => c.id)],
  ] as const) {
    for (const d of dupes(ids)) errors.push(`duplicate ${kind} id ${d}`);
  }

  const allIds = [...taskIds, ...milestoneIds, ...findingIds, ...evidenceIds];
  for (const d of dupes(allIds)) errors.push(`id ${d} is used by more than one collection`);

  for (const c of record.criteria) {
    if (!rubricIds.has(c.id)) errors.push(`criterion ${c.id} is not in rubric v${rubric.version}`);
    if ((c.status === "passed" || c.status === "partial") && c.evidence.length === 0)
      errors.push(`criterion ${c.id} is ${c.status} without evidence`);
    if ((c.status === "n_a" || c.status === "unverified") && !c.reason) errors.push(`criterion ${c.id} is ${c.status} without a reason`);
    if (c.status === "deferred" && !c.trigger) errors.push(`criterion ${c.id} is deferred without an activation trigger`);
  }
  for (const id of rubricIds) if (!record.criteria.some((c) => c.id === id)) errors.push(`rubric criterion ${id} missing from record`);

  for (const f of record.findings) {
    for (const t of f.taskIds) if (!taskIds.has(t)) errors.push(`finding ${f.id} links unknown task ${t}`);
    for (const c of f.criterionIds) if (!rubricIds.has(c)) errors.push(`finding ${f.id} links unknown criterion ${c}`);
    for (const d of f.dependsOn ?? []) if (!findingIds.has(d)) errors.push(`finding ${f.id} depends on unknown finding ${d}`);
    if (f.evidence.length === 0 && f.kind === "verified") errors.push(`verified finding ${f.id} has no evidence`);
    if ((f.kind === "unknown" || f.kind === "deferred") && !f.reason) warnings.push(`${f.kind} finding ${f.id} has no reason`);
    const actionable = (f.kind === "verified" || f.kind === "recommendation" || f.kind === "inferred") && !f.resolved;
    if (actionable && f.taskIds.length === 0 && record.milestones.length > 0) warnings.push(`actionable finding ${f.id} is not linked to any task`);
  }

  for (const t of record.tasks) {
    if (!milestoneIds.has(t.milestoneId)) errors.push(`task ${t.id} belongs to unknown milestone ${t.milestoneId}`);
    for (const d of t.dependsOn) if (!taskIds.has(d)) errors.push(`task ${t.id} depends on unknown task ${d}`);
    for (const f of t.findingIds) if (!findingIds.has(f)) errors.push(`task ${t.id} links unknown finding ${f}`);
    if (t.status === "blocked" && !t.blockedReason) errors.push(`task ${t.id} is blocked without blockedReason`);
    if (t.status === "deferred" && !t.deferredTrigger) warnings.push(`task ${t.id} is deferred without deferredTrigger`);
    for (const d of dupes(t.acceptanceCriteria.map((a) => a.id))) errors.push(`task ${t.id} has duplicate acceptance id ${d}`);
    for (const a of t.acceptanceCriteria) if (!a.id.startsWith(`${t.id}.`)) errors.push(`acceptance id ${a.id} must be prefixed with ${t.id}.`);
  }
  for (const m of record.milestones) {
    for (const d of m.dependsOn) if (!milestoneIds.has(d)) errors.push(`milestone ${m.id} depends on unknown milestone ${d}`);
    if (!record.tasks.some((t) => t.milestoneId === m.id)) warnings.push(`milestone ${m.id} has no tasks`);
    for (const x of m.exitCriteria) if (!x.id.startsWith(`${m.id}.`)) errors.push(`exit criterion id ${x.id} must be prefixed with ${m.id}.`);
  }
  for (const e of record.evidence) {
    if (e.taskId && !taskIds.has(e.taskId)) errors.push(`evidence ${e.id} references unknown task ${e.taskId}`);
    if (e.milestoneId && !milestoneIds.has(e.milestoneId)) errors.push(`evidence ${e.id} references unknown milestone ${e.milestoneId}`);
  }

  const library = loadLibrary();
  const pairs = new Set<string>();
  for (const c of record.conventions) {
    if (!library.rules.has(c.rule)) errors.push(`convention ${c.id} references ${c.rule}, which is not in the conventions library`);
    const key = `${c.scope}::${c.rule}`;
    if (pairs.has(key)) errors.push(`convention ${c.id} duplicates ${c.rule} for ${c.scope}`);
    pairs.add(key);
    if ((c.status === "documented" || c.status === "followed" || c.status === "contradicted") && c.evidence.length === 0)
      errors.push(`convention ${c.id} is ${c.status} without evidence (cite path:line)`);
    if (c.status === "n_a" && !c.reason) errors.push(`convention ${c.id} is n_a without a reason`);
  }

  const testingLib = loadTesting();
  const scopes = new Set<string>();
  for (const t of record.testing ?? []) {
    if (scopes.has(t.scope)) errors.push(`testing assessment for ${t.scope} appears more than once`);
    scopes.add(t.scope);
    for (const l of t.layers) {
      if (!testingLib.layers.has(l.id)) errors.push(`testing ${t.scope} references layer ${l.id}, which is not in the testing library`);
      if (l.status === "present" && l.evidence.length === 0) errors.push(`testing ${t.scope} layer ${l.id} is present without evidence (cite a test path)`);
      if (l.status === "n_a" && !l.reason) errors.push(`testing ${t.scope} layer ${l.id} is n_a without a reason`);
    }
    if (t.criticalPaths.covered > t.criticalPaths.total) errors.push(`testing ${t.scope} has more covered critical paths than it has critical paths`);
    if (t.strategy.documented && !t.strategy.path) warnings.push(`testing ${t.scope} strategy is documented but no path is given`);
  }

  const taskCycle = findCycle(record.tasks);
  if (taskCycle) errors.push(`task dependency cycle: ${taskCycle.join(" -> ")}`);
  const msCycle = findCycle(record.milestones);
  if (msCycle) errors.push(`milestone dependency cycle: ${msCycle.join(" -> ")}`);

  return { errors, warnings };
}
