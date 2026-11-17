import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { playbookRoot } from "./paths.js";
import type { CriterionState, Mode, Rubric, RubricCriterion, StageApplicability } from "./types.js";

let cached: Rubric | null = null;

export function loadRubric(root = playbookRoot()): Rubric {
  if (cached && root === playbookRoot()) return cached;
  const rubric = parse(readFileSync(join(root, "rubric", "rubric.yaml"), "utf8")) as Rubric;
  if (root === playbookRoot()) cached = rubric;
  return rubric;
}

export function applicability(c: RubricCriterion, mode: Mode): StageApplicability {
  return c.applies?.[mode] ?? "active";
}

export function levelIndex(level: string | undefined): number {
  if (!level) return Infinity;
  const n = Number(level.replace(/^L/, ""));
  return Number.isFinite(n) ? n : Infinity;
}

/** Initial criterion state for a mode: unverified, or the stage default. */
export function defaultCriterion(c: RubricCriterion, mode: Mode): CriterionState {
  const stage = applicability(c, mode);
  if (stage === "n_a") {
    return { id: c.id, status: "n_a", evidence: [], reason: `Not applicable to ${mode} repositories (rubric stage rule).`, stageDefault: true };
  }
  if (stage === "deferred") {
    return { id: c.id, status: "deferred", evidence: [], trigger: c.activates_when ?? "Activation trigger not specified.", stageDefault: true };
  }
  return { id: c.id, status: "unverified", evidence: [], reason: "Not yet assessed." };
}
