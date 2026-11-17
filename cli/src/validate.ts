import { Ajv, type ValidateFunction } from "ajv";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { playbookRoot } from "./paths.js";
import { loadLibrary } from "./conventions.js";
import { loadRubric } from "./rubric.js";
import { loadTesting } from "./testing.js";
import { loadDocs } from "./docs.js";
import { loadMaintenance } from "./maintenance.js";
import { computeScore } from "./score.js";
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

  for (const [kind, ids] of [
    ["criterion", record.criteria.map((c) => c.id)],
    ["finding", record.findings.map((f) => f.id)],
    ["milestone", record.milestones.map((m) => m.id)],
    ["task", record.tasks.map((t) => t.id)],
    ["approval", record.approvals.map((a) => a.id)],
    ["convention", record.conventions.map((c) => c.id)],
  ] as const) {
    for (const d of dupes(ids)) errors.push(`duplicate ${kind} id ${d}`);
  }

  const allIds = [...taskIds, ...milestoneIds, ...findingIds];
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
    for (const d of dupes(t.acceptanceCriteria.map((a) => a.id))) errors.push(`task ${t.id} has duplicate acceptance id ${d}`);
    if (!t.findingIds.length && !t.deferredTrigger)
      warnings.push(`task ${t.id} links no findings, so reassessment can never mark it addressed; link the findings it fixes, or rely on its milestone's exit criteria`);
    for (const a of t.acceptanceCriteria) if (!a.id.startsWith(`${t.id}.`)) errors.push(`acceptance id ${a.id} must be prefixed with ${t.id}.`);
  }
  for (const m of record.milestones) {
    for (const d of m.dependsOn) if (!milestoneIds.has(d)) errors.push(`milestone ${m.id} depends on unknown milestone ${d}`);
    if (!record.tasks.some((t) => t.milestoneId === m.id)) warnings.push(`milestone ${m.id} has no tasks`);
    for (const d of dupes(m.exitCriteria.map((x) => x.id))) errors.push(`milestone ${m.id} has duplicate exit criterion id ${d}`);
    for (const x of m.exitCriteria) {
      if (!x.id.startsWith(`${m.id}.`)) errors.push(`exit criterion id ${x.id} must be prefixed with ${m.id}.`);
      if (x.status === "met" && !x.evidence?.length) errors.push(`exit criterion ${x.id} is met without evidence (cite what reassessment observed)`);
      if (x.status === "unverified" && !x.reason) errors.push(`exit criterion ${x.id} is unverified without a reason`);
    }
  }

  // Plan coherence: a task may depend only on tasks in its own milestone or in milestones its milestone depends on.
  const msDeps = new Map(record.milestones.map((m) => [m.id, m.dependsOn]));
  const closure = (id: string) => {
    const seen = new Set<string>();
    const stack = [...(msDeps.get(id) ?? [])];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      stack.push(...(msDeps.get(x) ?? []));
    }
    return seen;
  };
  for (const t of record.tasks) {
    const upstream = closure(t.milestoneId);
    for (const d of t.dependsOn) {
      const dep = record.tasks.find((x) => x.id === d);
      if (dep && dep.milestoneId !== t.milestoneId && !upstream.has(dep.milestoneId))
        errors.push(`task ${t.id} (${t.milestoneId}) depends on ${d} in ${dep.milestoneId}, which ${t.milestoneId} does not depend on. Add ${dep.milestoneId} to ${t.milestoneId}.dependsOn, or move one of the tasks`);
    }
  }
  if (record.milestones.length) {
    const blocking = computeScore(record).nextLevel?.blocking ?? [];
    const planned = new Set(record.findings.filter((f) => f.taskIds.length).flatMap((f) => f.criterionIds));
    const unplanned = blocking.filter((b) => !planned.has(b.id) && b.status !== "unverified");
    if (unplanned.length) warnings.push(`criteria blocking the next level have no planned task: ${unplanned.map((b) => `${b.id} (${b.status})`).join(", ")}`);
  }

  for (const a of record.approvals) {
    if (a.scope === "roadmap" && !a.planHash) errors.push(`roadmap approval ${a.id} does not record the plan it approved (planHash)`);
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

  if (record.docs) {
    const docsLib = loadDocs();
    const findingIds = new Set(record.findings.map((f) => f.id));
    const keys = new Set<string>();
    for (const t of record.docs.target) {
      const at = `docs target ${t.id} (${t.scope})`;
      const item = docsLib.items.get(t.id);
      if (!item) errors.push(`${at} is not in the documentation library`);
      const key = `${t.scope}::${t.id}`;
      if (keys.has(key)) errors.push(`${at} appears more than once`);
      keys.add(key);
      if (t.status === "present" && t.evidence.length === 0) errors.push(`${at} is present without evidence (cite a path)`);
      if (t.status === "n_a" && !t.reason) errors.push(`${at} is n_a without a reason`);
      if ((t.status === "absent" || t.status === "misplaced") && (t.action === "retain" || t.action === "none") && !t.reason)
        errors.push(`${at} is ${t.status} but has no action; give one, or a reason for leaving it`);
      if ((t.action === "relocate" || t.action === "consolidate") && (!t.currentPaths?.length || !t.home)) errors.push(`${at} ${t.action} needs currentPaths and a home`);
      if (t.action === "create" && !t.home) errors.push(`${at} create needs a home`);
      for (const f of t.findingIds ?? []) if (!findingIds.has(f)) errors.push(`${at} links unknown finding ${f}`);
      if (item && item.tier > 1 && (t.action === "create" || t.action === "generate") && !t.reason)
        warnings.push(`${at} recommends a Tier ${item.tier} item without a reason; cite its condition${item.tier === 3 ? " and the recurring problem" : ""}`);
    }
  }

  if (record.maintenance) {
    const janLib = loadMaintenance();
    const findingIds = new Set(record.findings.map((f) => f.id));
    const crit = new Map(record.criteria.map((c) => [c.id, c.status]));
    const seen = new Set<string>();
    for (const r of record.maintenance.roster) {
      const at = `maintenance ${r.id}`;
      const j = janLib.items.get(r.id);
      if (!j) errors.push(`${at} is not in the maintenance library`);
      if (seen.has(r.id)) errors.push(`${at} appears more than once`);
      seen.add(r.id);
      if (r.status === "present" && r.evidence.length === 0) errors.push(`${at} is present without evidence (cite its workflow, skill or config)`);
      if (r.status === "n_a" && !r.reason) errors.push(`${at} is n_a without a reason`);
      for (const b of r.blockedBy ?? []) if (!crit.has(b)) errors.push(`${at} is blocked by ${b}, which is not a criterion in this record`);
      if (j && r.recommend === "now") {
        const failing = j.prerequisites.filter((p) => crit.get(p) !== "passed");
        // A warning here, not an error: a prerequisite that regresses later must not lock every write to the record.
        // apply refuses the roster itself when it is written with unmet prerequisites.
        if (failing.length) warnings.push(`${at} is recommended now but its prerequisites have not passed: ${failing.map((p) => `${p} (${crit.get(p) ?? "missing"})`).join(", ")}. Reassess, or use after-prerequisites with blockedBy`);
      }
      if (r.recommend === "after-prerequisites" && !r.blockedBy?.length) warnings.push(`${at} waits on prerequisites but does not name them in blockedBy`);
      for (const f of r.findingIds ?? []) if (!findingIds.has(f)) errors.push(`${at} links unknown finding ${f}`);
      if (j && j.tier > 1 && (r.recommend === "now" || r.recommend === "after-prerequisites") && !r.reason)
        warnings.push(`${at} recommends a Tier ${j.tier} janitor without a reason; cite its condition${j.tier === 3 ? " and the recurring problem" : ""}`);
    }
  }

  const taskCycle = findCycle(record.tasks);
  if (taskCycle) errors.push(`task dependency cycle: ${taskCycle.join(" -> ")}`);
  const msCycle = findCycle(record.milestones);
  if (msCycle) errors.push(`milestone dependency cycle: ${msCycle.join(" -> ")}`);

  return { errors, warnings };
}
