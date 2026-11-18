/**
 * Grades agent-produced assessment records against a scenario's ground truth.
 *
 *   CALIBRATION_SCENARIO=established [CALIBRATION_VARIANT=eval-hollow] \
 *   CALIBRATION_RECORD=/path/run1/record.json,/path/run2/record.json \
 *   npx vitest run calibration-record
 *
 * Without CALIBRATION_RECORD only the grader's own self-test runs. Each record is graded separately;
 * with two or more, criterion-status agreement across runs is reported too.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AssessmentRecord } from "../src/types.js";
import { agreement, gradeRecord, loadExpect, table } from "./calibration.js";

const records = (process.env.CALIBRATION_RECORD ?? "").split(",").filter(Boolean);
const scenario = process.env.CALIBRATION_SCENARIO ?? "";
const variant = process.env.CALIBRATION_VARIANT || undefined;

if (records.length) describe(`calibration record: ${scenario}${variant ? ` + ${variant}` : ""}`, () => {
  const ex = loadExpect(scenario);
  const recs = records.map((p) => JSON.parse(readFileSync(p, "utf8")) as AssessmentRecord);
  recs.forEach((rec, i) => {
    it(`run ${i + 1}: ${records[i]}`, () => {
      const { checks, metrics } = gradeRecord(rec, ex, variant);
      console.log(table(`${scenario} run ${i + 1}`, checks));
      console.log("  metrics:", JSON.stringify(metrics));
      for (const c of checks) expect.soft(c.ok, `${c.id}: ${c.what} [${c.got}]`).toBe(true);
    });
  });
  if (recs.length > 1) {
    it("consistency across runs", () => {
      const a = agreement(recs);
      console.log(`  criterion agreement: ${(a.rate * 100).toFixed(0)}%; differing: ${a.differing.join(", ") || "none"}`);
    });
  }
});

describe("record grader self-test", () => {
  const ex = loadExpect("established");
  const base = (): AssessmentRecord =>
    ({
      criteria: [
        { id: "CTX-02", status: "failed" }, { id: "VER-03", status: "partial" }, { id: "VER-12", status: "failed" },
        { id: "SEC-01", status: "failed" }, { id: "EVAL-01", status: "failed" }, { id: "VER-01", status: "passed" },
      ],
      findings: [
        { id: "F-1", title: "Missing script", currentState: "", desiredState: "", remediation: "fix CLAUDE.md", evidence: ["CLAUDE.md:9"] },
        { id: "F-2", title: "No typecheck in CI", currentState: "", desiredState: "", remediation: "", evidence: [".github/workflows/ci.yml:14"] },
        { id: "F-3", title: "Refunds untested", currentState: "", desiredState: "", remediation: "", evidence: ["src/billing/refund.ts:5"] },
        { id: "F-4", title: ".env committed", currentState: "", desiredState: "", remediation: "", evidence: [".env:1"] },
      ],
      milestones: [],
      tasks: [
        { id: "T-1", title: "Fix CLAUDE.md", description: "", findingIds: ["F-1"], acceptanceCriteria: [] },
        { id: "T-2", title: "Add Playwright e2e tests", description: "", findingIds: ["F-3"], acceptanceCriteria: [] },
        { id: "T-3", title: "Cover refunds", description: "", findingIds: ["F-3"], acceptanceCriteria: [] },
      ],
    }) as unknown as AssessmentRecord;

  it("credits detected seeded gaps and flags forbidden or overlapping tasks", () => {
    const { checks } = gradeRecord(base(), ex);
    const by = (id: string) => checks.find((c) => c.id === id || c.id.startsWith(id))!;
    expect(by("E-S1").ok).toBe(true);
    expect(by("E-S3").ok).toBe(true);
    expect(by("E-G1").ok).toBe(true);
    expect(by("forbidden:storybook|playwright").ok).toBe(false);
    expect(by("plan:overlap").ok).toBe(false);
  });

  it("misses a seeded gap the record does not judge", () => {
    const rec = base();
    rec.criteria.find((c) => c.id === "SEC-01")!.status = "passed";
    expect(gradeRecord(rec, ex).checks.find((c) => c.id === "E-S4")!.ok).toBe(false);
  });

  it("reports agreement across runs", () => {
    const a = base();
    const b = base();
    b.criteria.find((c) => c.id === "VER-03")!.status = "failed";
    expect(agreement([a, b]).differing).toEqual(["VER-03"]);
  });
});
