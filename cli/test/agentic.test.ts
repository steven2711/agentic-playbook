import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { lintLibrary } from "../src/conventions.js";
import { lintStrictness } from "../src/strictness.js";
import { lintTesting } from "../src/testing.js";
import { lintDocs } from "../src/docs.js";
import { lintPlaybook } from "../src/lint.js";
import { playbookRoot } from "../src/paths.js";
import { loadRubric } from "../src/rubric.js";
import { computeScore } from "../src/score.js";
import { GREENFIELD, documentedMonorepo, existingRepo, makeRepo, monorepo, patch, planned, readRecord, run, testedMonorepo } from "./helpers.js";

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

describe("strictness and suppressions", () => {
  const copyPlaybook = () => {
    const copy = mkdtempSync(join(tmpdir(), "agentic-pb-"));
    for (const d of ["rubric", "standards", "schema", "reference", "templates"]) cpSync(join(playbookRoot(), d), join(copy, d), { recursive: true });
    return copy;
  };

  it("the strictness library lints clean, and rejects missing triggers, bad regexes and stale reviews", () => {
    expect(lintStrictness(playbookRoot())).toEqual({ problems: [], warnings: [] });
    const copy = copyPlaybook();
    const f = join(copy, "reference", "strictness", "general.yaml");
    writeFileSync(f, readFileSync(f, "utf8").replace(/    when: More than about.*\n/, "").replace("    when: Once agents write a meaningful share of the tests.\n", "").replace("'expect-expect|", "'(expect-expect|"));
    const { problems } = lintStrictness(copy);
    expect(problems.some((p) => p.includes("STR-GEN-04") && p.includes('"when"'))).toBe(true);
    expect(problems.some((p) => p.includes("STR-GEN-04") && p.includes("not a valid JavaScript regex"))).toBe(true);
    expect(lintStrictness(playbookRoot(), new Date("2028-06-01")).warnings[0]).toContain("last reviewed");
  });

  it("reports Tier 1 checks and inline suppressions per app", () => {
    const repo = monorepo();
    const out = JSON.parse(run(repo, "strictness", "--json").out);
    const apps = Object.fromEntries(out.apps.map((a: { root: string }) => [a.root, a]));
    const check = (app: string, id: string) => apps[app].checks.find((c: { id: string }) => c.id === id);
    expect(check("apps/web", "STR-TS-01").status).toBe("off");
    expect(check("apps/api", "STR-TS-01")).toMatchObject({ status: "on", evidence: "apps/api/tsconfig.json" });
    expect(check("apps/api", "STR-TS-02").status).toBe("on");
    expect(check("apps/web", "STR-PY-01")).toBeUndefined(); // only the app's own stack
    expect(apps["apps/web"].suppressions["eslint-disable"]).toEqual({ total: 4, undescribed: 3 });
    expect(apps["apps/web"].suppressions["skipped-test"]).toEqual({ total: 1, undescribed: 1 });
    expect(apps["apps/api"].suppressions).toEqual({});
    expect(out.notRecommended.some((n: { practice: string }) => /100%/.test(n.practice))).toBe(true);
    expect(run(repo, "strictness").out).toContain("✗ STR-TS-01 TypeScript strict mode is on");

    run(repo, "init");
    const before = run(repo, "score", "--json").out;
    const scan = JSON.parse(run(repo, "scan", "--json").out);
    expect(scan.probes.strictness.status).toBe("failed");
    expect(scan.probes.strictness.evidence.join(" ")).toContain("apps/web: Tier 1");
    expect(scan.probes.suppressions.status).toBe("failed");
    expect(scan.probes.suppressions.evidence[0]).toContain("5 inline suppressions (4 without a reason");
    expect(scan.criteriaHints["VER-10"].probe).toBe("strictness");
    expect(scan.criteriaHints["ARC-08"].probe).toBe("suppressions");
    expect(JSON.parse(run(repo, "score", "--json").out).score).toBe(JSON.parse(before).score); // facts never score by themselves

    const html = join(mkdtempSync(join(tmpdir(), "agentic-r-")), "v.html");
    run(repo, "render", "--out", html);
    const page = readFileSync(html, "utf8");
    expect(page).toContain("strictnessPanel");
    expect(page).toContain("STR-TS-01");
  });

  it("a reason-requiring rule or a baseline turns the suppressions hint from failed to partial", () => {
    const repo = makeRepo({
      "package.json": JSON.stringify({ name: "x", devDependencies: { typescript: "5.7.2" } }),
      "eslint.config.mjs": "export default [{ rules: { '@eslint-community/eslint-comments/require-description': 'error' } }]\n",
      "src/a.ts": "// eslint-disable-next-line no-console\nconsole.log(1)\n",
    });
    const scan = JSON.parse(run(repo, "scan", "--json").out);
    expect(scan.probes.suppressions.status).toBe("partial");
    expect(scan.probes.suppressions.evidence.join(" ")).toContain("eslint-comments/require-description");
  });

  it("keeps strictness applicable in greenfield, where it is cheapest", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    const r = readRecord(repo);
    expect(r.criteria.find((c) => c.id === "VER-10")!.status).toBe("unverified");
    expect(r.criteria.find((c) => c.id === "ARC-08")!.status).toBe("unverified");
  });
});

describe("testing assessment", () => {
  const copyPlaybook = () => {
    const copy = mkdtempSync(join(tmpdir(), "agentic-pb-"));
    for (const d of ["rubric", "standards", "schema", "reference", "templates"]) cpSync(join(playbookRoot(), d), join(copy, d), { recursive: true });
    return copy;
  };

  it("the testing library lints clean, and rejects missing triggers, bad regexes, unknown TST rules and stale reviews", () => {
    expect(lintTesting(playbookRoot())).toEqual({ problems: [], warnings: [] });
    const copy = copyPlaybook();
    const f = join(copy, "reference", "testing", "api-service.yaml");
    writeFileSync(f, readFileSync(f, "utf8").replace(/    when: The service has a consumer.*\n/, "").replace("'(^|/)pacts?/'", "'(^|/)pacts?/('").replace("see: [TST-02, TST-03]", "see: [TST-99]"));
    const { problems } = lintTesting(copy);
    expect(problems.some((p) => p.includes("TL-API-03") && p.includes('"when"'))).toBe(true);
    expect(problems.some((p) => p.includes("TL-API-03") && p.includes("not a valid JavaScript regex"))).toBe(true);
    expect(problems.some((p) => p.includes("TL-API-02") && p.includes("TST-99"))).toBe(true);
    expect(lintTesting(playbookRoot(), new Date("2028-06-01")).warnings[0]).toContain("last reviewed");
  });

  it("reports kinds, layers, critical-path candidates, untested dirs and coverage per app", () => {
    const repo = testedMonorepo();
    const out = JSON.parse(run(repo, "tests", "--json").out);
    const apps = Object.fromEntries(out.apps.map((a: { root: string }) => [a.root, a]));
    const layer = (app: string, id: string) => apps[app].layers.find((l: { id: string }) => l.id === id);
    expect(apps["apps/web"].kinds).toContain("web-frontend");
    expect(apps["apps/api"].kinds).toEqual(["api-service"]);
    expect(apps["apps/api"].runners).toEqual(expect.arrayContaining(["vitest"]));
    expect(layer("apps/web", "TL-WEB-01")).toMatchObject({ status: "present", count: 1 });
    expect(layer("apps/web", "TL-WEB-02").status).toBe("absent");
    expect(layer("apps/api", "TL-API-01")).toMatchObject({ status: "present", count: 1, examples: ["apps/api/src/domain/price.test.ts"] });
    expect(layer("apps/api", "TL-API-02").status).toBe("present");
    expect(layer("apps/api", "TL-API-04").status).toBe("absent"); // db app: migration layer applies (Tier 2)
    expect(layer("apps/api", "TL-API-04").when).toMatch(/migrations/);
    const crit = (app: string, file: string) => apps[app].criticalCandidates.find((c: { file: string }) => c.file === file);
    expect(crit("apps/web", "apps/web/app/checkout/pay.ts")).toMatchObject({ name: "payments", referencedBy: [] });
    expect(crit("apps/api", "apps/api/src/auth/login.ts").referencedBy).toEqual(["apps/api/test/integration/orders.int.test.ts"]);
    expect(crit("apps/api", "apps/api/src/billing/refund.ts").referencedBy).toEqual([]);
    expect(apps["apps/api"].untestedDirs).toContain("apps/api/src/util");
    expect(apps["apps/api"].untestedDirs).not.toContain("apps/api/src/domain");
    expect(apps["apps/api"].coverage.join(" ")).toContain("apps/api/vitest.config.ts");
    expect(apps["apps/api"].notRecommended.some((n: { practice: string }) => /load tests/i.test(n.practice))).toBe(true);
    const text = run(repo, "tests").out;
    expect(text).toContain("✗ T1 TL-WEB-02 e2e");
    expect(text).toContain("✗ apps/web/app/checkout/pay.ts (payments");

    run(repo, "init");
    const before = JSON.parse(run(repo, "score", "--json").out).score;
    const scan = JSON.parse(run(repo, "scan", "--json").out);
    expect(scan.probes.tests.status).toBe("partial");
    expect(scan.probes.tests.evidence.join(" ")).toMatch(/apps\/web \[[^\]]*\]: .*missing: [^)]*e2e/);
    expect(scan.criteriaHints["VER-11"].probe).toBe("tests");
    expect(scan.criteriaHints["VER-12"].probe).toBe("tests");
    expect(JSON.parse(run(repo, "score", "--json").out).score).toBe(before);
  });

  it("a repo with code and no tests fails the hint", () => {
    const repo = makeRepo({ "package.json": JSON.stringify({ name: "x", dependencies: { express: "4" } }), "src/a.ts": "export {}\n", "src/b.ts": "export {}\n" });
    expect(JSON.parse(run(repo, "scan", "--json").out).probes.tests.status).toBe("failed");
  });

  it("stores a per-app testing snapshot, replaced by scope, validated against the library, and rendered", () => {
    const repo = testedMonorepo();
    run(repo, "init");
    run(repo, "scan");
    const snap = {
      scope: "apps/api", kinds: ["api-service"], strategy: { documented: false },
      layers: [{ id: "TL-API-02", status: "present", evidence: ["apps/api/test/integration/orders.int.test.ts:3"] }],
      criticalPaths: { total: 3, covered: 1, uncovered: ["apps/api/src/billing/refund.ts"] },
    };
    expect(patch(repo, { testing: [snap] }, "agent:test-strategy-auditor").code).toBe(0);
    expect(patch(repo, { testing: [{ ...snap, criticalPaths: { total: 3, covered: 2, uncovered: [] } }] }).code).toBe(0);
    const r = readRecord(repo);
    expect(r.testing).toHaveLength(1);
    expect(r.testing![0]!.criticalPaths.covered).toBe(2);
    expect(r.testing![0]!.assessedBy).toBe("agent:claude");

    const bad = patch(repo, { testing: [{ ...snap, layers: [{ id: "TL-API-99", status: "present", evidence: [] }] }] });
    expect(bad.code).not.toBe(0);
    expect(bad.err).toContain("TL-API-99");
    expect(patch(repo, { testing: [{ ...snap, criticalPaths: { total: 1, covered: 2, uncovered: [] } }] }).err).toContain("more covered critical paths");

    const html = join(mkdtempSync(join(tmpdir(), "agentic-r-")), "v.html");
    run(repo, "render", "--out", html);
    const page = readFileSync(html, "utf8");
    expect(page).toContain("testingView");
    expect(page).toMatch(/"testingScan":\[\{"root":"apps\//);
    expect(page).toContain("TL-WEB-02");

    expect(patch(repo, { remove: { testing: ["apps/api"] } }).code).toBe(0);
    expect(readRecord(repo).testing).toEqual([]);
  });

  it("keeps the strategy criterion applicable in greenfield and defers critical-path coverage", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    const r = readRecord(repo);
    expect(r.criteria.find((c) => c.id === "VER-11")!.status).toBe("unverified");
    expect(r.criteria.find((c) => c.id === "VER-12")!.status).toBe("deferred");
  });
});

describe("documentation architecture", () => {
  const copyPlaybook = () => {
    const copy = mkdtempSync(join(tmpdir(), "agentic-pb-"));
    for (const d of ["rubric", "standards", "schema", "reference", "templates"]) cpSync(join(playbookRoot(), d), join(copy, d), { recursive: true });
    return copy;
  };

  it("the docs library lints clean, and rejects bad ids, missing triggers, bad enums, unknown criteria, bad regexes and stale reviews", () => {
    expect(lintDocs(playbookRoot())).toEqual({ problems: [], warnings: [] });
    const copy = copyPlaybook();
    const f = join(copy, "reference", "docs", "architecture.yaml");
    writeFileSync(
      f,
      readFileSync(f, "utf8")
        .replace("id: DOC-ARC-03", "id: DOC-ARC-3")
        .replace("    when: Choices are being made that later contributors will question, such as a framework, datastore, boundary or deploy target, or the repository has more than one app.\n", "")
        .replace("load: linked\n    authority: history", "load: sometimes\n    authority: history")
        .replace("see: [CTX-06, CTX-07]", "see: [CTX-99]")
        .replace("'(^|/)(adr|adrs|decisions)/.+\\.md$'", "'(^|/)(adr'"),
    );
    const { problems } = lintDocs(copy);
    expect(problems.some((p) => p.includes("DOC-ARC-3") && p.includes("DOC-AAA-NN"))).toBe(true);
    expect(problems.some((p) => p.includes("DOC-ARC-02") && p.includes('"when"'))).toBe(true);
    expect(problems.some((p) => p.includes("DOC-ARC-02") && p.includes("load must be"))).toBe(true);
    expect(problems.some((p) => p.includes("DOC-ARC-02") && p.includes("CTX-99"))).toBe(true);
    expect(problems.some((p) => p.includes("DOC-ARC-02") && p.includes("not a valid JavaScript regex"))).toBe(true);
    expect(lintDocs(playbookRoot(), new Date("2028-06-01")).warnings[0]).toContain("last reviewed");
  });

  it("reports items per repo and app, always-loaded lines, broken links and repeated lines", () => {
    const repo = documentedMonorepo();
    const out = JSON.parse(run(repo, "docs", "--json").out);
    const item = (scope: string, id: string) => out.items.find((i: { scope: string; id: string }) => i.scope === scope && i.id === id);
    expect(out.repoConditions).toEqual(expect.arrayContaining(["multi-app", "deployable", "http-api"]));
    expect(item("repo", "DOC-ENT-01")).toMatchObject({ status: "present", paths: ["CLAUDE.md"] });
    expect(item("repo", "DOC-ENT-02").status).toBe("present");
    expect(item("repo", "DOC-ARC-01").status).toBe("present");
    expect(item("repo", "DOC-ARC-02")).toMatchObject({ status: "absent", tier: 2 });
    expect(item("apps/api", "DOC-APP-01")).toMatchObject({ status: "present", paths: [".claude/rules/api.md"] });
    expect(item("apps/web", "DOC-APP-01").status).toBe("absent");
    expect(item("apps/web", "DOC-APP-02").status).toBe("present");
    expect(item("apps/api", "DOC-APP-02").status).toBe("absent");
    expect(item("apps/api", "DOC-OPS-01").status).toBe("present");
    expect(item("apps/api", "DOC-OPS-03").status).toBe("absent"); // deployable: runbook applies (Tier 2)
    expect(item("apps/web", "DOC-OPS-03")).toBeUndefined(); // not deployable
    expect(item("apps/api", "DOC-INT-01").title).toMatch(/contract/);
    expect(out.alwaysLoaded.map((a: { file: string }) => a.file)).toEqual(["CLAUDE.md"]);
    expect(out.alwaysLoadedLines).toBeGreaterThan(290);
    expect(out.brokenLinks).toEqual(["CLAUDE.md -> docs/nope.md"]);
    expect(out.duplicates[0].files).toEqual([".claude/rules/api.md", "CLAUDE.md"]);
    expect(out.notRecommended.some((n: { practice: string }) => /monolithic/i.test(n.practice))).toBe(true);

    const text = run(repo, "docs").out;
    expect(text).toContain("✗ T1 DOC-APP-01 Scoped conventions: expected at");
    expect(text).toContain("✗ CLAUDE.md -> docs/nope.md");

    run(repo, "init");
    const before = JSON.parse(run(repo, "score", "--json").out).score;
    const scan = JSON.parse(run(repo, "scan", "--json").out);
    expect(scan.probes.docs.status).toBe("failed");
    expect(scan.probes.docs.evidence[0]).toMatch(/missing: .*Scoped conventions \(apps\/web\)/);
    expect(scan.facts.brokenLinks).toEqual(["CLAUDE.md -> docs/nope.md"]);
    expect(JSON.parse(run(repo, "score", "--json").out).score).toBe(before);
  });

  it("a single-app repo with a CLAUDE.md and README has no Tier 1 gaps", () => {
    const repo = makeRepo({ ...GREENFIELD, "README.md": "# GF\n\nnpm install, then npm test.\n" });
    const out = JSON.parse(run(repo, "docs", "--json").out);
    expect(out.items.filter((i: { tier: number; status: string }) => i.tier === 1 && i.status === "absent")).toEqual([]);
    expect(out.items.some((i: { id: string }) => i.id === "DOC-APP-01")).toBe(false);
    expect(JSON.parse(run(repo, "scan", "--json").out).probes.docs.status).toBe("partial");
  });

  it("stores one docs snapshot, replaced whole, validated against the library, and rendered", () => {
    const repo = documentedMonorepo();
    run(repo, "init");
    run(repo, "scan");
    expect(patch(repo, { findings: [{ id: "F-CTX-001", title: "No ADRs", kind: "verified", dimension: "CTX", priority: "P1", currentState: "none", desiredState: "ADR log", evidence: ["no docs/adr"], remediation: "DOC-ARC-02", criterionIds: ["CTX-06"] }] }).code).toBe(0);
    const snap = {
      inventory: [{ location: "CLAUDE.md", purpose: "Entry point", authority: "contract", disposition: "consolidate", issue: "300 lines" }],
      target: [
        { id: "DOC-ENT-01", scope: "repo", status: "present", action: "consolidate", currentPaths: ["CLAUDE.md"], home: "CLAUDE.md", evidence: ["CLAUDE.md is 296 lines"] },
        { id: "DOC-ARC-02", scope: "repo", status: "absent", action: "create", home: "docs/adr/", reason: "two apps", evidence: ["no decisions directory"], findingIds: ["F-CTX-001"] },
        { id: "DOC-APP-01", scope: "apps/web", status: "absent", action: "create", home: ".claude/rules/web.md", evidence: [] },
      ],
      loading: { alwaysLoadedLines: 296, issues: ["CLAUDE.md holds 290 generic rules"] },
      navigation: [{ goal: "decisions", reachable: false, route: ["CLAUDE.md"] }],
      summary: "Entry point is too long and decisions are unrecorded.",
    };
    expect(patch(repo, { docs: snap }, "agent:context-auditor").code).toBe(0);
    expect(patch(repo, { docs: { ...snap, summary: "second run" } }).code).toBe(0);
    const r = readRecord(repo);
    expect(r.docs!.summary).toBe("second run");
    expect(r.docs!.assessedBy).toBe("agent:claude");
    expect(r.docs!.target).toHaveLength(3);

    const bad = (target: unknown[]) => patch(repo, { docs: { ...snap, target } }).err;
    expect(bad([{ id: "DOC-ZZZ-01", scope: "repo", status: "absent", action: "create", home: "x", evidence: [] }])).toContain("not in the documentation library");
    expect(bad([{ id: "DOC-ARC-02", scope: "repo", status: "absent", action: "none", evidence: [] }])).toContain("has no action");
    expect(bad([{ id: "DOC-APP-01", scope: "apps/web", status: "misplaced", action: "relocate", home: "x", evidence: [] }])).toContain("needs currentPaths and a home");
    expect(bad([{ id: "DOC-ENT-01", scope: "repo", status: "present", action: "retain", evidence: [] }])).toContain("without evidence");
    expect(bad([snap.target[1], snap.target[1]])).toContain("more than once");
    expect(bad([{ ...snap.target[1], findingIds: ["F-CTX-404"] }])).toContain("unknown finding F-CTX-404");

    const html = join(mkdtempSync(join(tmpdir(), "agentic-r-")), "v.html");
    run(repo, "render", "--out", html);
    const page = readFileSync(html, "utf8");
    expect(page).toContain("docsView");
    expect(page).toContain('"docsScan":{');
    expect(page).toContain("DOC-ARC-02");

    expect(patch(repo, { remove: { docs: true } }).code).toBe(0);
    expect(readRecord(repo).docs).toBeUndefined();
  });
});
