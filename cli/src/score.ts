import { levelIndex, loadRubric } from "./rubric.js";
import type { AssessmentRecord, CriterionStatus, DimensionId } from "./types.js";

export const CREDIT: Record<CriterionStatus, number | null> = {
  passed: 1,
  partial: 0.5,
  failed: 0,
  unverified: 0,
  n_a: null,
  deferred: null,
};

export interface DimensionScore {
  id: DimensionId;
  name: string;
  score: number | null;
  applicable: number;
  passed: number;
}

export interface LevelGap {
  level: string;
  name: string;
  blocking: { id: string; title: string; status: CriterionStatus }[];
}

export interface ScoreResult {
  score: number;
  confidence: number;
  level: string;
  levelName: string;
  dimensions: DimensionScore[];
  nextLevel: LevelGap | null;
  counts: Record<CriterionStatus, number>;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Deterministic readiness score. The record only stores criterion statuses and
 * evidence; this function is the only place a score is produced.
 */
export function computeScore(record: AssessmentRecord): ScoreResult {
  const rubric = loadRubric();
  const state = new Map(record.criteria.map((c) => [c.id, c]));
  const counts: Record<CriterionStatus, number> = { passed: 0, partial: 0, failed: 0, unverified: 0, n_a: 0, deferred: 0 };

  let earned = 0;
  let possible = 0;
  let verifiedWeight = 0;
  const dims = new Map<DimensionId, { earned: number; possible: number; applicable: number; passed: number }>();
  for (const d of rubric.dimensions) dims.set(d.id, { earned: 0, possible: 0, applicable: 0, passed: 0 });

  for (const c of rubric.criteria) {
    const status = state.get(c.id)?.status ?? "unverified";
    counts[status] += 1;
    const credit = CREDIT[status];
    if (credit === null) continue;
    const w = rubric.priorities[c.priority].weight;
    earned += credit * w;
    possible += w;
    if (status !== "unverified") verifiedWeight += w;
    const d = dims.get(c.dimension)!;
    d.earned += credit * w;
    d.possible += w;
    d.applicable += 1;
    if (status === "passed") d.passed += 1;
  }

  // Level: highest Ln where every applicable criterion gated at <= Ln is passed.
  let achieved = 0;
  let nextLevel: LevelGap | null = null;
  for (let n = 1; n < rubric.levels.length; n++) {
    const blocking = rubric.criteria
      .filter((c) => levelIndex(c.gate) <= n)
      .map((c) => ({ id: c.id, title: c.title, status: (state.get(c.id)?.status ?? "unverified") as CriterionStatus }))
      .filter((c) => CREDIT[c.status] !== null && c.status !== "passed");
    if (blocking.length === 0) {
      achieved = n;
      continue;
    }
    nextLevel = { level: rubric.levels[n]!.id, name: rubric.levels[n]!.name, blocking };
    break;
  }

  const lvl = rubric.levels[achieved]!;
  return {
    score: possible ? round((earned / possible) * 100) : 0,
    confidence: possible ? round((verifiedWeight / possible) * 100) : 0,
    level: lvl.id,
    levelName: lvl.name,
    dimensions: rubric.dimensions.map((d) => {
      const s = dims.get(d.id)!;
      return { id: d.id, name: d.name, score: s.possible ? round((s.earned / s.possible) * 100) : null, applicable: s.applicable, passed: s.passed };
    }),
    nextLevel,
    counts,
  };
}
