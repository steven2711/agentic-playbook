import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { lintLibrary } from "../src/conventions.js";
import { lintPlaybook } from "../src/lint.js";
import { playbookRoot } from "../src/paths.js";
import { loadRubric } from "../src/rubric.js";
import { computeScore } from "../src/score.js";
import { GREENFIELD, existingRepo, makeRepo, monorepo, patch, planned, readRecord, run } from "./helpers.js";

beforeEach(() => {
  process.env.AGENTIC_HOME = mkdtempSync(join(tmpdir(), "agentic-home-"));
});

describe("playbook lint", () => {
  it("passes on the real playbook", () => {
    expect(lintPlaybook(playbookRoot())).toEqual([]);
  });

  it("fails when a standard drops a quoted requirement", () => {
    const copy = mkdtempSync(join(tmpdir(), "agentic-pb-"));
    for (const d of ["rubric", "standards", "schema"]) cpSync(join(playbookRoot(), d), join(copy, d), { recursive: true });
    const f = join(copy, "standards", "verification.md");
    writeFileSync(f, readFileSync(f, "utf8").replace("Security-critical rules prohibit grandfathering.", ""));
    const problems = lintPlaybook(copy);
    expect(problems.some((p) => p.includes("SEC-04") && p.includes("quote not found"))).toBe(true);
  });
});

describe("init and scan", () => {
  it("detects greenfield, stages outside the repo and leaves the worktree clean", () => {
    const repo = makeRepo(GREENFIELD);
    expect(run(repo, "init").code).toBe(0);
    const rec = readRecord(repo);
    expect(rec.mode).toBe("greenfield");
    expect(rec.criteria.find((c) => c.id === "ARC-03")!.status).toBe("n_a");
    expect(rec.criteria.find((c) => c.id === "VER-08")!.status).toBe("deferred");
    expect(run(repo, "scan").code).toBe(0);
    expect(existsSync(join(repo, ".agentic"))).toBe(false);
    expect(execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" })).toBe("");
  });

  it("detects an existing project and its tooling", () => {
    const repo = existingRepo();
    run(repo, "init");
    expect(readRecord(repo).mode).toBe("existing");
    const scan = JSON.parse(run(repo, "scan", "--json").out);
    expect(scan.probes.canonical_commands.status).toBe("passed");
    expect(scan.probes.reproducible_setup.status).toBe("passed");
    expect(scan.probes.ci_runs_checks.status).toBe("passed");
    expect(scan.probes.boundary_tooling.status).toBe("partial");
    expect(scan.probes.claude_md_commands.evidence.join(" ")).toContain("pnpm run missing");
    expect(scan.criteriaHints["VER-01"].probe).toBe("canonical_commands");
  });

  it("refuses to overwrite an existing record", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    expect(run(repo, "init").code).toBe(2);
  });
});

describe("scoring", () => {
  it("is weighted, excludes n/a and deferred, and gates levels", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    const rubric = loadRubric();
    const l1 = rubric.criteria.filter((c) => c.gate === "L1").map((c) => ({ id: c.id, status: "passed", evidence: ["probe + review"] }));
    expect(patch(repo, { criteria: l1 }).code).toBe(0);
    let s = computeScore(readRecord(repo));
    expect(s.level).toBe("L1");
    const applicable = rubric.criteria.filter((c) => !["n_a", "deferred"].includes(readRecord(repo).criteria.find((x) => x.id === c.id)!.status));
    const total = applicable.reduce((n, c) => n + rubric.priorities[c.priority].weight, 0);
    const earned = l1.length * 3;
    expect(s.score).toBeCloseTo(Math.round((earned / total) * 1000) / 10, 5);
    expect(s.nextLevel?.level).toBe("L2");

    // partial on an L1 gate drops the level but keeps half credit
    patch(repo, { criteria: [{ id: "CTX-01", status: "partial", evidence: ["too long"] }] });
    s = computeScore(readRecord(repo));
    expect(s.level).toBe("L0");
    expect(s.score).toBeCloseTo(Math.round(((earned - 1.5) / total) * 1000) / 10, 5);
  });

  it("appends score history only when the score changes", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    run(repo, "score");
    run(repo, "score");
    expect(readRecord(repo).scoreHistory).toHaveLength(1);
    patch(repo, { criteria: [{ id: "CTX-01", status: "passed", evidence: ["ok"] }] });
    run(repo, "score");
    expect(readRecord(repo).scoreHistory).toHaveLength(2);
  });
});

describe("apply guards", () => {
  it("rejects computed fields, evidence and status changes", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    expect(patch(repo, { scoreHistory: [] }).code).toBe(2);
    expect(patch(repo, { evidence: [] }).code).toBe(2);
    expect(patch(repo, { tasks: [{ id: "T-001", status: "completed" }] }).code).toBe(2);
    expect(patch(repo, { criteria: [{ id: "NOPE-1", status: "passed", evidence: ["x"] }] }).code).toBe(2);
    expect(patch(repo, { criteria: [{ id: "CTX-01", status: "passed", evidence: [] }] }).code).toBe(2);
  });

  it("rejects dependency cycles and dangling links without writing", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    const before = readRecord(repo).recordRevision;
    expect(patch(repo, { tasks: [{ id: "T-001", dependsOn: ["T-002"] }] }).err).toContain("cycle");
    expect(patch(repo, { tasks: [{ id: "T-001", dependsOn: ["T-999"] }] }).code).toBe(2);
    expect(readRecord(repo).recordRevision).toBe(before);
  });

  it("links findings to tasks in both directions", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    expect(readRecord(repo).findings[0]!.taskIds).toEqual(["T-001"]);
  });
});

describe("task lifecycle", () => {
  it("enforces dependencies, independent verification and derived milestone status", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    const task = (...a: string[]) => run(repo, "task", ...a);

    expect(task("T-002", "in_progress", "--by", "agent:impl").err).toContain("unmet dependencies");
    expect(task("T-001", "completed", "--by", "agent:impl").err).toContain("Illegal transition");
    expect(task("T-001", "in_progress", "--by", "agent:impl").code).toBe(0);
    expect(task("T-001", "verification_required", "--by", "agent:impl").code).toBe(0);

    // no evidence
    expect(task("T-001", "completed", "--by", "agent:verifier").err).toContain("T-001.AC1");
    // evidence from the implementer does not count
    run(repo, "evidence", "--task", "T-001", "--covers", "T-001.AC1", "--verifier", "agent:impl", "--action", "npm test", "--result", "pass");
    expect(task("T-001", "completed", "--by", "agent:verifier").err).toContain("T-001.AC1");
    // implementer cannot complete
    expect(task("T-001", "completed", "--by", "agent:impl").err).toContain("independent verifier");
    // failing independent evidence does not count
    run(repo, "evidence", "--task", "T-001", "--covers", "T-001.AC1", "--verifier", "agent:verifier", "--action", "npm test", "--result", "fail");
    expect(task("T-001", "completed", "--by", "agent:verifier").code).toBe(2);
    run(repo, "evidence", "--task", "T-001", "--covers", "T-001.AC1", "--verifier", "agent:verifier", "--action", "npm test", "--result", "pass");
    expect(task("T-001", "completed", "--by", "agent:verifier").code).toBe(0);

    expect(readRecord(repo).milestones[0]!.status).toBe("in_progress");
    task("T-002", "in_progress", "--by", "agent:impl");
    task("T-002", "verification_required", "--by", "agent:impl");
    run(repo, "evidence", "--task", "T-002", "--covers", "T-002.AC1", "--verifier", "agent:verifier", "--action", "fixture", "--result", "pass");
    task("T-002", "completed", "--by", "agent:verifier");
    // all tasks done but exit criterion has no evidence
    expect(readRecord(repo).milestones[0]!.status).toBe("verification_required");
    run(repo, "evidence", "--milestone", "M-001", "--covers", "M-001.X1", "--verifier", "agent:verifier", "--action", "negative fixture", "--result", "pass");
    expect(readRecord(repo).milestones[0]!.status).toBe("completed");
  });

  it("requires reasons for blocking and human approval when flagged", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    expect(run(repo, "task", "T-001", "blocked", "--by", "x").code).toBe(2);
    expect(run(repo, "task", "T-001", "blocked", "--by", "x", "--reason", "no gh access").code).toBe(0);
    expect(readRecord(repo).tasks[0]!.blockedReason).toBe("no gh access");
    patch(repo, { tasks: [{ id: "T-001", requiresApproval: true }] });
    expect(run(repo, "task", "T-001", "in_progress", "--by", "agent:impl").err).toContain("approval");
    expect(run(repo, "approve", "T-001", "--by", "agent:claude").code).toBe(2);
    run(repo, "approve", "T-001", "--by", "human:owner");
    expect(run(repo, "task", "T-001", "in_progress", "--by", "agent:impl").code).toBe(0);
  });

  it("orders ready tasks by dependencies", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    const next = JSON.parse(run(repo, "next", "--json").out);
    expect(next.ready.map((t: { id: string }) => t.id)).toEqual(["T-001"]);
  });
});

describe("continuity and publishing", () => {
  it("survives a reload with the same ids, statuses and evidence, and survives adoption", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    run(repo, "task", "T-001", "in_progress", "--by", "agent:impl");
    const a = readRecord(repo);
    run(repo, "adopt");
    expect(existsSync(join(repo, ".agentic", "record.json"))).toBe(true);
    const b = readRecord(repo);
    expect(b.tasks.map((t) => [t.id, t.status, t.dependsOn])).toEqual(a.tasks.map((t) => [t.id, t.status, t.dependsOn]));
    expect(b.recordRevision).toBe(a.recordRevision);
    expect(run(repo, "validate").code).toBe(0);
  });

  it("flags unpublished revisions and commits past the assessment", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    run(repo, "published", "--url", "https://claude.ai/artifact/x");
    expect(run(repo, "status", "--brief").out).toContain("(current)");
    run(repo, "task", "T-001", "in_progress", "--by", "agent:impl");
    expect(run(repo, "status", "--brief").out).toContain("Republish");
    execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "x"], { cwd: repo });
    expect(run(repo, "status", "--brief").out).toContain("1 commit(s) past");
  });

  it("renders a self-contained page that cannot be broken out of", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    patch(repo, { findings: [{ id: "F-001", title: "</script><b>x</b>" }] });
    const out = join(mkdtempSync(join(tmpdir(), "agentic-r-")), "v.html");
    expect(run(repo, "render", "--out", out).code).toBe(0);
    const html = readFileSync(out, "utf8");
    expect(html).toContain("<title>");
    expect(html.match(/<\/script>/g)!.length).toBe(2);
    expect(html).not.toMatch(/<script[^>]+src=/);
  });
});

describe("engineering conventions", () => {
  const copyPlaybook = () => {
    const copy = mkdtempSync(join(tmpdir(), "agentic-pb-"));
    for (const d of ["rubric", "standards", "schema", "reference", "templates"]) cpSync(join(playbookRoot(), d), join(copy, d), { recursive: true });
    return copy;
  };

  it("the library lints clean, and a rule without a source fails", () => {
    expect(lintLibrary(playbookRoot()).problems).toEqual([]);
    const copy = copyPlaybook();
    const f = join(copy, "reference", "conventions", "frontend-web.yaml");
    writeFileSync(f, readFileSync(f, "utf8").replace(/source: \{ title: "React docs: Rendering Lists".*\n/, ""));
    expect(lintLibrary(copy).problems.some((p) => p.includes("FE-10") && p.includes("source"))).toBe(true);
  });

  it("warns when a library file has not been reviewed for over a year", () => {
    const { warnings } = lintLibrary(playbookRoot(), new Date("2028-06-01"));
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("last reviewed");
    expect(lintLibrary(playbookRoot(), new Date("2027-01-15")).warnings).toEqual([]);
  });

  it("finds app roots, their stacks and which ones lack scoped conventions", () => {
    const repo = monorepo();
    const out = JSON.parse(run(repo, "conventions", "--json").out);
    const apps = Object.fromEntries(out.apps.map((a: { root: string }) => [a.root, a]));
    expect(Object.keys(apps).sort()).toEqual(["apps/api", "apps/web"]);
    expect(apps["apps/web"].signals).toEqual(expect.arrayContaining(["react", "next", "web", "typescript"]));
    expect(apps["apps/web"].conventions).toEqual([".claude/rules/web.md"]);
    expect(apps["apps/api"].signals).toEqual(expect.arrayContaining(["server", "http-api", "db"]));
    expect(apps["apps/api"].conventions).toEqual([]);
    const ids = (a: { rules: { id: string }[] }) => a.rules.map((r) => r.id);
    expect(ids(apps["apps/web"])).toContain("FE-08");
    expect(ids(apps["apps/web"])).not.toContain("DATA-01");
    expect(ids(apps["apps/web"])).not.toContain("DATA-05"); // rule-level signals narrow the domain, never widen it
    expect(ids(apps["apps/api"])).toEqual(expect.arrayContaining(["API-05", "DATA-01"]));
    expect(ids(apps["apps/api"])).not.toContain("FE-01");

    run(repo, "init");
    const scan = JSON.parse(run(repo, "scan", "--json").out);
    expect(scan.probes.conventions.status).toBe("partial");
    expect(scan.probes.conventions.evidence.join(" ")).toContain("no scoped conventions for: apps/api");
    expect(scan.criteriaHints["CTX-12"].probe).toBe("conventions");
  });

  it("accepts only library rules, keeps stable ids per app and rule, and renders the tab", () => {
    const repo = monorepo();
    run(repo, "init");
    expect(patch(repo, { conventions: [{ scope: "apps/web", rule: "XX-99", status: "absent", evidence: [] }] }).err).toContain("not in the conventions library");
    expect(patch(repo, { conventions: [{ scope: "apps/web", rule: "FE-03", status: "contradicted", evidence: [] }] }).err).toContain("without evidence");
    expect(patch(repo, { conventions: [{ scope: "apps/web", rule: "FE-03", status: "contradicted", evidence: ["apps/web/app/page.tsx:3"] }] }).code).toBe(0);
    expect(patch(repo, { conventions: [{ scope: "apps/web", rule: "FE-03", status: "documented", evidence: [".claude/rules/web.md:6"] }, { scope: "apps/api", rule: "API-05", status: "absent", evidence: [], extraSources: ["javascript:alert(1)"] }] }).code).toBe(2);
    patch(repo, { conventions: [{ scope: "apps/web", rule: "FE-03", status: "documented", evidence: [".claude/rules/web.md:6"] }, { scope: "apps/api", rule: "API-05", status: "absent", evidence: [] }] });
    const cv = readRecord(repo).conventions;
    expect(cv.map((c) => [c.id, c.scope, c.rule, c.status, c.decision])).toEqual([
      ["CV-001", "apps/web", "FE-03", "documented", "proposed"],
      ["CV-002", "apps/api", "API-05", "absent", "proposed"],
    ]);
    // the score ignores conventions
    const before = computeScore(readRecord(repo)).score;
    patch(repo, { conventions: [{ scope: "apps/api", rule: "API-06", status: "contradicted", evidence: ["apps/api/src/server.ts:1"] }] });
    expect(computeScore(readRecord(repo)).score).toBe(before);

    const out = join(mkdtempSync(join(tmpdir(), "agentic-r-")), "v.html");
    run(repo, "render", "--out", out);
    const html = readFileSync(out, "utf8");
    expect(html).toContain("conventionsView");
    expect(html).toContain("https://google.aip.dev/158");
  });

  it("defers conventions review in greenfield but keeps conventions files applicable", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    const r = readRecord(repo);
    expect(r.criteria.find((c) => c.id === "VER-09")!.status).toBe("deferred");
    expect(r.criteria.find((c) => c.id === "CTX-12")!.status).toBe("unverified");
  });
});
