/**
 * Deterministic calibration: what the CLI alone detects on each calibration scenario, compared with
 * the scenario's ground truth. This proves detector behaviour only, not the auditors' judgement
 * (see calibration-record.test.ts and calibration/README.md for that).
 */
import { describe, expect, it } from "vitest";
import { cliJson, gradeDeterministic, gradeStage, loadExpect, scenarioRepo, scenarios, table } from "./calibration.js";
import { makeRepo, patch, run } from "./helpers.js";

describe("calibration scenarios (deterministic)", () => {
  for (const name of scenarios()) {
    const ex = loadExpect(name);
    it(`${name}: ${ex.description}`, () => {
      const repo = scenarioRepo(name);
      const checks = [...gradeDeterministic(repo, ex), ...gradeStage(repo, ex)];
      console.log(table(name, checks));
      for (const c of checks.filter((x) => !x.known)) expect.soft(c.ok, `${name} ${c.id}: ${c.what} [${c.got}]`).toBe(true);
    });
    for (const [variant, v] of Object.entries(ex.variants ?? {})) {
      if (!v.detect) continue;
      it(`${name} + ${variant}`, () => {
        const repo = scenarioRepo(name, variant);
        const checks = gradeDeterministic(repo, { ...ex, seeded: ex.seeded.filter((s) => s.id !== "E-S5") }, v).filter((c) => c.id === "variant");
        console.log(table(`${name}+${variant}`, checks));
        for (const c of checks) expect.soft(c.ok, `${variant}: ${c.got}`).toBe(true);
      });
    }
  }
});

describe("detector corrections found by calibration", () => {
  it("a clean worktree is not reported as having uncommitted paths when the window opens", () => {
    // Found in the greenfield agent run: git's info/exclude file was counted as an uncommitted path.
    const repo = makeRepo({ "a.txt": "a\n" });
    const r = run(repo, "readonly", "begin");
    expect(r.code).toBe(0);
    expect(r.out).not.toContain("uncommitted");
    run(repo, "readonly", "end");
  });

  it("a Next.js app is an HTTP API only when it has route handlers or API routes", () => {
    const base = { "package.json": JSON.stringify({ name: "w", dependencies: { next: "15.1.0", react: "19.0.0" } }), "app/page.tsx": "export default () => null\n" };
    const kinds = (files: Record<string, string>) => cliJson(makeRepo(files), "tests").apps[0].kinds as string[];
    expect(kinds(base)).not.toContain("api-service");
    expect(kinds({ ...base, "app/api/orders/route.ts": "export async function GET() {}\n" })).toContain("api-service");
    expect(kinds({ ...base, "pages/api/hello.ts": "export default () => {}\n" })).toContain("api-service");
  });

  it("CI that skips an existing type check is partial, and says what it skips", () => {
    const files = {
      "package.json": JSON.stringify({ scripts: { lint: "eslint .", typecheck: "tsc", test: "vitest run" } }),
      ".github/workflows/ci.yml": "on: [pull_request]\njobs:\n  c:\n    steps:\n      - run: npm run lint && npm test\n",
    };
    const p = cliJson(makeRepo(files), "scan").probes.ci_runs_checks;
    expect(p.status).toBe("partial");
    expect(p.evidence.join(" ")).toContain("not run in CI: typecheck");
    const fixed = { ...files, ".github/workflows/ci.yml": "on: [pull_request]\njobs:\n  c:\n    steps:\n      - run: npm run lint && npm run typecheck && npm test\n" };
    expect(cliJson(makeRepo(fixed), "scan").probes.ci_runs_checks.status).toBe("passed");
  });

  it("CI that delegates to just or make is credited with what the recipe runs", () => {
    const repo = makeRepo({
      Justfile: "check: lint test\n\nlint:\n    biome ci .\n\ntest:\n    vitest run\n",
      ".buildkite/pipeline.yaml": "steps:\n  - command: just check\n",
    });
    const p = cliJson(repo, "scan").probes.ci_runs_checks;
    expect(p.status).toBe("passed");
    expect(p.evidence.join(" ")).toContain(".buildkite/pipeline.yaml");
  });

  it("a single-app repository's root guide can be its conventions home; a multi-app root guide cannot", () => {
    const single = cliJson(makeRepo({ "package.json": "{}", "AGENTS.md": "# Rules\n" }), "conventions").apps;
    expect(single[0].conventions).toEqual(["AGENTS.md"]);
    const multi = cliJson(makeRepo({ "pnpm-workspace.yaml": "packages: [apps/*]\n", "package.json": "{}", "CLAUDE.md": "# Rules\n", "apps/a/package.json": "{}", "apps/b/package.json": "{}" }), "conventions").apps;
    expect(multi.every((a: { conventions: string[] }) => a.conventions.length === 0)).toBe(true);
  });

  it("an unresolved just recipe in CLAUDE.md is reported, like an unresolved npm script", () => {
    const repo = makeRepo({ Justfile: "check:\n    echo ok\n", "CLAUDE.md": "@AGENTS.md\n", "AGENTS.md": "Run `just check`, then `just deploy`.\n" });
    const p = cliJson(repo, "scan").probes.claude_md_commands;
    expect(p.status).toBe("partial");
    expect(p.evidence.join(" ")).toContain("unresolved: `just deploy`");
  });
});

describe("planning horizon (found by calibration: L0 roadmaps planned L4 work)", () => {
  const finding = (id: string, crit: string) => ({ id, title: id, kind: "verified", dimension: crit.split("-")[0], priority: "P2", currentState: "x", desiredState: "y", evidence: ["no such file"], remediation: "z", criterionIds: [crit] });

  it("reaches two levels above the current one plus every P0, and leaves the rest for later", () => {
    const repo = makeRepo({ "a.txt": "a\n" }, 45);
    run(repo, "init");
    const h = cliJson(repo, "score").horizon;
    expect(h.through).toBe("L2");
    expect(h.criteria).toEqual(expect.arrayContaining(["CTX-01", "VER-10", "VER-12", "ARC-01"])); // L1, L2, and P0s gated at L3
    expect(h.later).toEqual(expect.arrayContaining(["WF-06", "WF-08", "EVAL-01", "VER-11"])); // L3/L4 P1/P2
    expect(h.later).not.toContain("VER-12");
  });

  it("does not ask for tasks for findings beyond the horizon, but still does within it", () => {
    const repo = makeRepo({ "a.txt": "a\n" }, 45);
    run(repo, "init");
    const r = patch(repo, {
      findings: [finding("F-001", "WF-08"), finding("F-002", "VER-03")],
      milestones: [{ id: "M-001", title: "Foundation", objective: "CI", dependsOn: [], exitCriteria: [{ id: "M-001.X1", text: "CI gate exists" }] }],
      tasks: [],
    });
    expect(r.code).toBe(0);
    const v = run(repo, "validate");
    expect(v.out + v.err).toContain("actionable finding F-002 is not linked");
    expect(v.out + v.err).not.toContain("F-001");
  });
});
