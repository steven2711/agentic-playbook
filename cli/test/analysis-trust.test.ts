/**
 * Adversarial regression tests for the analysis trust boundary. Every case goes
 * through the CLI entry point (`main`) on a real temporary git repository, and
 * every refusal is checked for a message naming what was refused and the remedy.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { lintMaintenance } from "../src/maintenance.js";
import { locateStore, playbookRoot } from "../src/paths.js";
import { lockPath } from "../src/readonly.js";
import { GREENFIELD, existingRepo, makeRepo, patch, planned, readRecord, run } from "./helpers.js";

beforeEach(() => {
  process.env.AGENTIC_HOME = mkdtempSync(join(tmpdir(), "agentic-home-"));
});

const git = (repo: string, ...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: repo, stdio: "ignore" });

/** A criterion whose deterministic probe failed in this repository's scan. */
function failingHint(repo: string): string {
  const hints = JSON.parse(readFileSync(locateStore(repo).scanPath, "utf8")).criteriaHints as Record<string, { status: string }>;
  const id = Object.entries(hints).find(([, h]) => h.status === "failed")?.[0];
  if (!id) throw new Error("fixture has no failing probe");
  return id;
}

describe("read-only assessment", () => {
  it("end fails and lists every change made during the window; a clean window passes", () => {
    const repo = makeRepo({ ...GREENFIELD, "src/a.ts": "export const a = 1;\n" });
    run(repo, "init");
    expect(run(repo, "readonly", "begin").code).toBe(0);
    expect(run(repo, "readonly", "end").code).toBe(0);

    run(repo, "readonly", "begin");
    writeFileSync(join(repo, "src/a.ts"), "export const a = 2;\n");
    writeFileSync(join(repo, "notes.txt"), "scratch\n");
    git(repo, "checkout", "-q", "-b", "elsewhere");
    const end = run(repo, "readonly", "end");
    expect(end.code).toBe(1);
    expect(end.err).toContain("src/a.ts");
    expect(end.err).toContain("notes.txt");
    expect(end.err).toContain("branch changed");
    expect(end.err).toContain("Do not revert them without asking");
    // The window is closed either way.
    expect(run(repo, "readonly", "end").err).toContain("agentic readonly begin");
  });

  it("a change already present at begin is not reported, but changing it again is", () => {
    const repo = makeRepo({ ...GREENFIELD, "src/a.ts": "1\n" });
    run(repo, "init");
    writeFileSync(join(repo, "src/a.ts"), "dirty before\n");
    expect(run(repo, "readonly", "begin").out).toContain("uncommitted");
    expect(run(repo, "readonly", "end").code).toBe(0);
    run(repo, "readonly", "begin");
    writeFileSync(join(repo, "src/a.ts"), "dirty during\n");
    expect(run(repo, "readonly", "end").err).toContain("src/a.ts: content changed");
  });

  it("CLI writes to an adopted record during the window are allowed", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    run(repo, "adopt");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "adopt");
    run(repo, "readonly", "begin");
    expect(patch(repo, { findings: [{ id: "F-001", resolved: true }] }).code).toBe(0);
    expect(run(repo, "readonly", "end").code).toBe(0);
  });

  it("check refuses file writes inside a repository with an open window, and nowhere else", () => {
    const repo = makeRepo(GREENFIELD);
    const outside = mkdtempSync(join(tmpdir(), "agentic-outside-"));
    run(repo, "init");
    expect(run(repo, "readonly", "check", "--path", join(repo, "CLAUDE.md")).code).toBe(0);
    run(repo, "readonly", "begin");
    const inside = run(repo, "readonly", "check", "--path", join(repo, "docs/new/file.md"));
    expect(inside.code).toBe(2);
    expect(inside.err).toMatch(/Refused: a read-only assessment .* docs\/new\/file\.md/);
    expect(inside.err).toContain("scratchpad");
    expect(run(repo, "readonly", "check", "--path", join(outside, "x.md")).code).toBe(0);
    // Git metadata and the record are refused too: the first can hide changes, the second bypasses the CLI's checks.
    expect(run(repo, "readonly", "check", "--path", join(repo, ".git/info/exclude")).err).toContain("git metadata");
    expect(run(repo, "readonly", "check", "--path", join(repo, ".agentic/record.json")).err).toContain("written only by the agentic CLI");
    // An expired window no longer blocks.
    const lock = JSON.parse(readFileSync(lockPath(locateStore(repo).repoRoot), "utf8"));
    writeFileSync(lockPath(locateStore(repo).repoRoot), JSON.stringify({ ...lock, expiresAt: "2000-01-01T00:00:00.000Z" }));
    expect(run(repo, "readonly", "check", "--path", join(repo, "CLAUDE.md")).code).toBe(0);
  });

  describe("the PreToolUse hook script", () => {
    let bundle: string;
    beforeAll(async () => {
      bundle = join(mkdtempSync(join(tmpdir(), "agentic-cli-")), "agentic.mjs");
      await build({
        entryPoints: [join(playbookRoot(), "cli/src/entry.ts")],
        bundle: true,
        platform: "node",
        format: "esm",
        target: "node20",
        outfile: bundle,
        logLevel: "silent",
        banner: { js: 'import { createRequire as __cr } from "module"; const require = __cr(import.meta.url);' },
      });
    });
    const hook = (input: unknown) =>
      spawnSync("sh", [join(playbookRoot(), "hooks/readonly-guard.sh")], {
        input: JSON.stringify(input),
        encoding: "utf8",
        env: { ...process.env, AGENTIC_CLI_JS: bundle, AGENTIC_PLAYBOOK_ROOT: playbookRoot() },
      });

    it("blocks Edit/Write inside a locked repository with exit 2 and a reason, and passes otherwise", () => {
      const repo = makeRepo(GREENFIELD);
      run(repo, "init");
      const write = { tool_name: "Write", tool_input: { file_path: join(repo, "CLAUDE.md"), content: "x" } };
      expect(hook(write).status).toBe(0);
      run(repo, "readonly", "begin");
      const blocked = hook(write);
      expect(blocked.status).toBe(2);
      expect(blocked.stderr).toContain("read-only assessment");
      expect(hook({ tool_name: "Write", tool_input: { file_path: join(tmpdir(), "elsewhere.md") } }).status).toBe(0);
      expect(hook({ tool_name: "NotebookEdit", tool_input: { notebook_path: join(repo, "n.ipynb") } }).status).toBe(2);
      expect(hook("not json").status).toBe(0);
      run(repo, "readonly", "end");
      expect(hook(write).status).toBe(0);
    });
  });
});

describe("checked evidence", () => {
  it("rejects citations of missing files and lines past the end, without writing", () => {
    const repo = makeRepo({ ...GREENFIELD, "src/a.ts": "one\ntwo\n" });
    planned(repo);
    const before = readRecord(repo).recordRevision;
    const missing = patch(repo, { findings: [{ id: "F-001", evidence: ["src/missing.ts:3 does the thing"] }] });
    expect(missing.code).toBe(2);
    expect(missing.err).toContain("finding F-001 cites src/missing.ts:3, but src/missing.ts does not exist");
    const pastEnd = patch(repo, { criteria: [{ id: "VER-01", status: "partial", evidence: ["src/a.ts:2-9 lists commands"] }] });
    expect(pastEnd.err).toContain("src/a.ts has only 2 lines");
    expect(patch(repo, { conventions: [{ scope: ".", rule: "FE-03", status: "contradicted", evidence: ["../outside.ts:1"] }] }).err).toContain("outside the repository");
    expect(readRecord(repo).recordRevision).toBe(before);
    // Absence claims, bare names and URLs are not citations.
    expect(patch(repo, { findings: [{ id: "F-001", evidence: ["no .github/workflows directory", "see package.json", "https://example.com/a.ts:40"] }] }).code).toBe(0);
    expect(patch(repo, { findings: [{ id: "F-001", evidence: ["src/a.ts:1-2 exports one"] }] }).code).toBe(0);
  });

  it("a criterion passed against a failing probe needs a stated reason", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    const id = failingHint(repo);
    const r = patch(repo, { criteria: [{ id, status: "passed", evidence: ["reviewed by hand"] }] });
    expect(r.code).toBe(2);
    expect(r.err).toContain(`criterion ${id} is marked passed, but the deterministic probe`);
    expect(r.err).toContain('say why in "notes"');
    expect(patch(repo, { criteria: [{ id, status: "passed", evidence: ["reviewed by hand"], notes: "the probe looks only at the root; the check lives in tools/ci.sh" }] }).code).toBe(0);
    // Failed or partial judgements agree with the probe and need nothing extra.
    expect(patch(repo, { criteria: [{ id, status: "failed", evidence: ["confirmed"] }] }).code).toBe(0);
  });

  it("warns when there is no scan to check criteria against", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    rmSync(locateStore(repo).scanPath);
    expect(patch(repo, { criteria: [{ id: "CTX-01", status: "partial", evidence: ["CLAUDE.md:1 exists"] }] }).out).toContain("no scan.json");
  });
});

describe("approvals", () => {
  it("cannot be written or removed through a patch", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    const inject = patch(repo, { approvals: [{ id: "A-001", subject: "roadmap", approvedBy: "human:owner", at: "2026-01-01", source: "local", scope: "roadmap" }] });
    expect(inject.code).toBe(2);
    expect(inject.err).toContain("agentic approve");
    expect(patch(repo, { remove: { approvals: ["A-001"] } }).err).toContain("cannot be removed with apply");
    expect(readRecord(repo).approvals).toEqual([]);
  });

  it("must be attributed to a human, and a roadmap approval needs a roadmap", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    expect(run(repo, "approve", "roadmap", "--by", "human:owner").err).toContain("no roadmap to approve");
    planned(repo);
    const agent = run(repo, "approve", "roadmap", "--by", "agent:claude");
    expect(agent.code).toBe(2);
    expect(agent.err).toContain("--by human:<name>");
    const ok = run(repo, "approve", "roadmap", "--by", "human:owner");
    expect(ok.out).toContain("local attribution");
    expect(readRecord(repo).approvals[0]).toMatchObject({ scope: "roadmap", source: "local", approvedBy: "human:owner", planHash: expect.stringMatching(/^[0-9a-f]{64}$/) });
  });

  it("a roadmap approval is bound to the plan: changing the plan needs re-approval, progress does not", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    expect(run(repo, "status", "--brief").out).toContain("ROADMAP: not approved yet");
    run(repo, "approve", "roadmap", "--by", "human:owner");
    expect(run(repo, "status", "--brief").out).not.toContain("ROADMAP");

    // Reassessment judgements are progress, not plan changes.
    patch(repo, { findings: [{ id: "F-001", resolved: true }], milestones: [{ id: "M-001", exitCriteria: [{ id: "M-001.X1", status: "unmet", evidence: ["CLAUDE.md:1 has no CI section"] }] }] });
    expect(run(repo, "status", "--brief").out).not.toContain("ROADMAP");

    patch(repo, { tasks: [{ id: "T-001", acceptanceCriteria: [{ id: "T-001.AC1", text: "CI runs lint only" }] }] });
    expect(run(repo, "status", "--brief").out).toContain("ROADMAP: changed since approval A-001 by human:owner");
    expect(JSON.parse(run(repo, "status", "--json").out).trust.roadmapApproval).toEqual({ id: "A-001", current: false });
    const html = join(mkdtempSync(join(tmpdir(), "agentic-r-")), "v.html");
    run(repo, "render", "--out", html);
    expect(readFileSync(html, "utf8")).toContain('"current":false');

    run(repo, "approve", "roadmap", "--by", "human:owner");
    expect(run(repo, "status", "--brief").out).not.toContain("ROADMAP");
  });

  it("adopt warns when the roadmap is unapproved", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    expect(run(repo, "adopt").out).toContain("warning: no roadmap approval");
  });
});

describe("janitor recommendations", () => {
  const roster = (recommend: string, extra: Record<string, unknown> = {}) => ({
    maintenance: { roster: [{ id: "JAN-ARC-01", status: "absent", recommend, reason: "boundary drift in two reviews", evidence: ["no architecture janitor"], ...extra }] },
  });

  it("a prerequisite that is n_a or unverified does not count as met", () => {
    const repo = existingRepo();
    run(repo, "init");
    patch(repo, { criteria: [{ id: "ARC-01", status: "n_a", evidence: [], reason: "single module" }, { id: "ARC-04", status: "passed", evidence: ["reviewed"], notes: "fixture" }] });
    const r = patch(repo, roster("now"));
    expect(r.code).toBe(2);
    expect(r.err).toContain("JAN-ARC-01 needs ARC-01 (n_a)");
    expect(r.err).toContain("not n_a");
    expect(r.err).toContain('"after-prerequisites"');
    expect(patch(repo, roster("after-prerequisites", { blockedBy: ["ARC-01"] })).code).toBe(0);
    const scan = JSON.parse(run(repo, "maintenance", "--json").out);
    expect(scan.items.find((i: { id: string }) => i.id === "JAN-ARC-01").prerequisitesMet).toBe(false);
  });

  it("a later regression is reported, but never locks the record", () => {
    const repo = existingRepo();
    run(repo, "init");
    patch(repo, { criteria: [{ id: "ARC-01", status: "passed", evidence: ["reviewed"], notes: "fixture" }, { id: "ARC-04", status: "passed", evidence: ["reviewed"], notes: "fixture" }] });
    expect(patch(repo, roster("now")).code).toBe(0);
    const regress = patch(repo, { criteria: [{ id: "ARC-01", status: "failed", evidence: [".dependency-cruiser.cjs:1 has no rules"] }] });
    expect(regress.code).toBe(0);
    expect(regress.out).toContain("JAN-ARC-01 is recommended now but its prerequisites have not passed: ARC-01 (failed)");
    expect(run(repo, "status", "--brief").out).toContain("JANITOR: JAN-ARC-01 is recommended now but ARC-01 is failed");
  });

  it("the library marks risky autofixes and requires their safeguards", () => {
    expect(lintMaintenance(playbookRoot())).toEqual({ problems: [], warnings: [] });
    const copy = mkdtempSync(join(tmpdir(), "agentic-pb-"));
    for (const d of ["rubric", "standards", "schema", "reference", "templates"]) cpSync(join(playbookRoot(), d), join(copy, d), { recursive: true });
    const f = join(copy, "reference", "maintenance", "janitors.yaml");
    const text = readFileSync(f, "utf8");
    // Strip JAN-QLT-01's safeguards: a high-risk autofix without safeguards fails lint.
    writeFileSync(f, text.replace(/(id: JAN-QLT-01[\s\S]*?autofix_risk: high\n)    safeguards:\n(      - .*\n)+/, "$1"));
    expect(lintMaintenance(copy).problems.join("\n")).toContain("JAN-QLT-01 has a high-risk autofix and must list the safeguards");
    writeFileSync(f, text.replace("autofix_risk: low", "autofix_risk: maybe"));
    expect(lintMaintenance(copy).problems.join("\n")).toContain("autofix_risk must be low or high");
  });
});

describe("staleness and drift", () => {
  it("names the areas and judgements a change makes stale", () => {
    const repo = existingRepo();
    run(repo, "init");
    writeFileSync(join(repo, ".github/workflows/ci.yml"), "on: [pull_request]\njobs:\n  ci:\n    steps:\n      - run: pnpm test\n");
    git(repo, "commit", "-qam", "trim ci");
    writeFileSync(join(repo, "CLAUDE.md"), "# Ex\n\nchanged\n");
    const c = JSON.parse(run(repo, "changes", "--json").out);
    expect(c.commits).toBe(1);
    expect(c.dimensions.VER).toContain(".github/workflows/ci.yml");
    expect(c.dimensions.WF).toContain(".github/workflows/ci.yml");
    expect(c.snapshots.maintenance).toContain(".github/workflows/ci.yml");
    expect(c.uncommitted).toContain("CLAUDE.md");
    expect(c.dimensions.CTX).toContain("CLAUDE.md");
    const brief = run(repo, "status", "--brief").out;
    expect(brief).toContain("STALE: HEAD is 1 commit(s) past");
    expect(brief).toContain("CI configuration (VER/WF/SEC)");
  });

  it("reports probes that regressed since the last scan", () => {
    const repo = existingRepo();
    run(repo, "init");
    rmSync(join(repo, ".github/workflows/ci.yml"));
    git(repo, "commit", "-qam", "drop ci");
    const status = run(repo, "status").out;
    expect(status).toMatch(/REGRESSED: probe ci_runs_checks was (passed|partial) at the last scan and is failed now/);
    expect(JSON.parse(run(repo, "changes", "--json").out).probeRegressions.map((r: { probe: string }) => r.probe)).toContain("ci_runs_checks");
  });

  it("flags an assessed revision that is not in history", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    const store = locateStore(repo);
    const rec = JSON.parse(readFileSync(store.recordPath, "utf8"));
    writeFileSync(store.recordPath, JSON.stringify({ ...rec, assessedRevision: "0".repeat(40) }));
    expect(run(repo, "status", "--brief").out).toContain("not in this repository's history");
  });
});

describe("plan coherence", () => {
  it("rejects a task depending on a milestone its milestone does not depend on", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    const m2 = { id: "M-002", title: "Next", objective: "More", dependsOn: [], exitCriteria: [{ id: "M-002.X1", text: "done" }] };
    const t3 = { id: "T-003", milestoneId: "M-002", title: "Later", description: "d", priority: "P1", dependsOn: ["T-001"], findingIds: [], acceptanceCriteria: [{ id: "T-003.AC1", text: "x" }], verification: ["y"] };
    const r = patch(repo, { milestones: [m2], tasks: [t3] });
    expect(r.code).toBe(2);
    expect(r.err).toContain("T-003 (M-002) depends on T-001 in M-001, which M-002 does not depend on. Add M-001 to M-002.dependsOn");
    expect(patch(repo, { milestones: [{ ...m2, dependsOn: ["M-001"] }], tasks: [t3] }).code).toBe(0);
  });

  it("warns when a criterion blocking the next level has no planned task", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    const r = patch(repo, { criteria: [{ id: "CTX-01", status: "failed", evidence: ["no CLAUDE.md section on commands"] }] });
    expect(r.code).toBe(0);
    expect(r.out).toContain("criteria blocking the next level have no planned task: CTX-01 (failed)");
  });
});

describe("v1 records", () => {
  /** Rewrite a planned v2 record into the v1 shape: task execution state, evidence, and approvals without provenance. */
  function toV1(repo: string) {
    const store = locateStore(repo);
    const v2 = JSON.parse(readFileSync(store.recordPath, "utf8"));
    const v1 = {
      ...v2,
      schemaVersion: 1,
      milestones: v2.milestones.map((m: Record<string, unknown>) => ({ ...m, status: "in_progress" })),
      tasks: v2.tasks.map((t: Record<string, unknown>, i: number) => ({ ...t, status: i === 0 ? "completed" : "verification_required", implementer: "agent:impl", history: [{ at: "2026-01-01", from: "pending", to: "in_progress", by: "agent:impl" }] })),
      evidence: [
        { id: "E-001", taskId: "T-001", covers: ["T-001.AC1"], verifier: "agent:verifier", action: "npm test", revision: "abc", result: "pass", at: "2026-01-02" },
        { id: "E-002", milestoneId: "M-001", covers: ["M-001.X1"], verifier: "agent:verifier", action: "negative fixture", location: "ci run 12", revision: "abcdef1234567", result: "pass", at: "2026-01-03" },
      ],
      approvals: [
        { id: "A-001", subject: "roadmap", approvedBy: "human:owner", at: "2026-01-01" },
        { id: "A-002", subject: "T-002", approvedBy: "agent:claude", at: "2026-01-01", note: "injected by a patch" },
      ],
    };
    delete v1.migrations;
    writeFileSync(store.recordPath, JSON.stringify(v1, null, 2));
    return store;
  }

  it("is read without rewriting it, and migrated with a backup on the first write", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    const store = toV1(repo);
    const original = readFileSync(store.recordPath, "utf8");

    expect(run(repo, "validate").code).toBe(0);
    expect(run(repo, "status", "--brief").out).toContain("MIGRATION: the record uses schema v1");
    expect(readFileSync(store.recordPath, "utf8")).toBe(original);

    const w = patch(repo, { findings: [{ id: "F-001", resolved: true }] });
    expect(w.code).toBe(0);
    expect(w.out).toContain("Migrating the record from schema v1");
    const backup = join(store.dir, "record.v1-backup.json");
    expect(readFileSync(backup, "utf8")).toBe(original);

    const r = readRecord(repo) as unknown as Record<string, any>;
    expect(r.schemaVersion).toBe(2);
    expect(r.evidence).toBeUndefined();
    for (const t of r.tasks) for (const k of ["status", "history", "implementer"]) expect(t).not.toHaveProperty(k);
    // v1 evidence was agent-reported and unchecked: it is quoted for the next reassessment, never promoted to met.
    expect(r.milestones[0].exitCriteria[0]).toMatchObject({ status: "unverified", assessedBy: "migration:v1" });
    expect(r.milestones[0].exitCriteria[0].evidence[0]).toContain("v1 evidence E-002 (pass): negative fixture (ci run 12)");
    expect(r.milestones[0].exitCriteria[0].reason).toContain("Reassess to judge it");
    expect(r.milestones[0].status).toBe("in_progress");
    // The human roadmap approval is kept, bound to the plan as migrated; the agent-written one is dropped, with a note.
    expect(r.approvals).toEqual([expect.objectContaining({ id: "A-001", scope: "roadmap", source: "local", migrated: true })]);
    expect(r.migrations[0]).toMatchObject({ from: 1, to: 2, backup: "record.v1-backup.json" });
    expect(r.migrations[0].notes.join("\n")).toContain('dropped approval A-002 for T-002: approvedBy "agent:claude"');
    expect(run(repo, "status", "--brief").out).not.toContain("ROADMAP");
    expect(run(repo, "validate").code).toBe(0);
  });

  it("keeps the backup when an adopted record is migrated, and when a staged one is adopted", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    toV1(repo);
    patch(repo, { findings: [{ id: "F-001", resolved: true }] });
    run(repo, "adopt");
    expect(existsSync(join(repo, ".agentic", "record.v1-backup.json"))).toBe(true);
  });
});

describe("the supervised path stays simple", () => {
  it("assess, plan, approve, hand off, reassess and render", () => {
    const repo = makeRepo({ ...GREENFIELD, "src/a.ts": "export const a = 1;\n" });
    run(repo, "init");
    expect(run(repo, "readonly", "begin").code).toBe(0);
    planned(repo);
    expect(run(repo, "readonly", "end").code).toBe(0);
    expect(run(repo, "approve", "roadmap", "--by", "human:owner").code).toBe(0);
    expect(run(repo, "roadmap").out).toContain("ready   T-001");

    // The team implements T-001 in its own workflow.
    writeFileSync(join(repo, ".github-ci.yml"), "lint: true\n");
    git(repo, "add", "-A");
    git(repo, "commit", "-qm", "T-001 add CI");

    run(repo, "readonly", "begin");
    expect(run(repo, "changes").out).toContain("1 commit(s) since the assessment");
    expect(
      patch(
        repo,
        { assessedRevision: "HEAD", findings: [{ id: "F-001", resolved: true }], milestones: [{ id: "M-001", exitCriteria: [{ id: "M-001.X1", status: "met", evidence: [".github-ci.yml:1 runs lint"] }] }] },
        "agent:reassess",
      ).code,
    ).toBe(0);
    expect(run(repo, "readonly", "end").code).toBe(0);
    const r = readRecord(repo);
    expect(r.milestones[0]!.status).toBe("completed");
    expect(run(repo, "status", "--brief").out).not.toMatch(/STALE: HEAD|ROADMAP/);
    const html = join(mkdtempSync(join(tmpdir(), "agentic-r-")), "v.html");
    expect(run(repo, "render", "--out", html).code).toBe(0);
    expect(readFileSync(html, "utf8")).toContain('"addressed":["T-001"]');
  });
});

describe("regressions found in independent review", () => {
  it("a nested repository in the worktree does not blind the fingerprint to other changes", () => {
    const repo = makeRepo({ ...GREENFIELD, "dirty.txt": "a\n" });
    run(repo, "init");
    writeFileSync(join(repo, "dirty.txt"), "b\n");
    execFileSync("git", ["init", "-q", join(repo, "nested")]);
    writeFileSync(join(repo, "nested", "x.txt"), "1\n");
    run(repo, "readonly", "begin");
    writeFileSync(join(repo, "dirty.txt"), "c\n");
    const end = run(repo, "readonly", "end");
    expect(end.code).toBe(1);
    expect(end.err).toContain("dirty.txt: content changed");
    run(repo, "readonly", "begin");
    writeFileSync(join(repo, "nested", "y.txt"), "2\n");
    expect(run(repo, "readonly", "end").err).toContain("nested");
  });

  it("changing local ignore rules during the window is reported", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    run(repo, "readonly", "begin");
    writeFileSync(join(repo, ".git/info/exclude"), "*.log\n");
    writeFileSync(join(repo, "debug.log"), "x\n");
    expect(run(repo, "readonly", "end").err).toContain(".git/info/exclude");
  });

  it("begin refuses to discard an open window; expired windows are cleaned up", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    run(repo, "readonly", "begin");
    const again = run(repo, "readonly", "begin");
    expect(again.code).toBe(2);
    expect(again.err).toContain("agentic readonly end");
    expect(run(repo, "readonly", "begin", "--restart").code).toBe(0);
    const path = lockPath(locateStore(repo).repoRoot);
    writeFileSync(path, JSON.stringify({ ...JSON.parse(readFileSync(path, "utf8")), expiresAt: "2000-01-01T00:00:00.000Z" }));
    run(repo, "readonly", "check", "--path", join(repo, "CLAUDE.md"));
    expect(existsSync(path)).toBe(false);
  });

  it("a different letter case for the repository path does not bypass the guard", () => {
    const repo = makeRepo(GREENFIELD);
    const upper = repo.replace(/agentic-fx-/, "AGENTIC-FX-");
    if (!existsSync(upper)) return; // case-sensitive filesystem: nothing to bypass
    run(repo, "init");
    run(repo, "readonly", "begin");
    expect(run(repo, "readonly", "check", "--path", join(upper, "CLAUDE.md")).code).toBe(2);
  });

  it("an earlier note cannot justify a later pass against a failing probe", () => {
    const repo = makeRepo(GREENFIELD);
    run(repo, "init");
    const id = failingHint(repo);
    expect(patch(repo, { criteria: [{ id, status: "failed", evidence: ["missing"], notes: "Missing entirely" }] }).code).toBe(0);
    expect(patch(repo, { criteria: [{ id, status: "passed", evidence: ["looks fine"] }] }).err).toContain("deterministic probe");
  });

  it("a reworded exit criterion loses its old judgement, and a new judgement needs its own evidence", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    patch(repo, { milestones: [{ id: "M-001", exitCriteria: [{ id: "M-001.X1", status: "unmet", evidence: ["CLAUDE.md:1 has no CI section"] }] }] });
    expect(patch(repo, { milestones: [{ id: "M-001", exitCriteria: [{ id: "M-001.X1", status: "met" }] }] }).err).toContain("judged met without evidence in this patch");
    patch(repo, { milestones: [{ id: "M-001", exitCriteria: [{ id: "M-001.X1", status: "met", evidence: ["package.json:1 has scripts"] }] }] });
    expect(readRecord(repo).milestones[0]!.status).toBe("completed");
    patch(repo, { milestones: [{ id: "M-001", exitCriteria: [{ id: "M-001.X1", text: "Something entirely different" }] }] });
    const m = readRecord(repo).milestones[0]!;
    expect(m.exitCriteria[0]!.status).toBeUndefined();
    expect(m.exitCriteria[0]!.evidence).toBeUndefined();
    expect(m.status).toBe("pending");
    expect(patch(repo, { milestones: [{ id: "M-001", exitCriteria: "nope" }] }).err).toContain("exitCriteria must be a list");
  });

  it("citations: sentence periods and route paths are checked; hosts, IPs and image tags are not files", () => {
    const repo = makeRepo({ ...GREENFIELD, "src/a.ts": "1\n2\n3\n", "app/[id]/page.tsx": "x\n", "My Docs/a.ts": "x\n" });
    planned(repo);
    const ev = (e: string) => patch(repo, { findings: [{ id: "F-001", evidence: [e] }] });
    expect(ev("see src/a.ts:40.").err).toContain("src/a.ts has only 3 lines");
    expect(ev("app/[id]/page.tsx:9 renders").err).toContain("app/[id]/page.tsx has only 1 line");
    expect(ev("app/(marketing)/page.tsx:5 renders").err).toContain("does not exist");
    expect(ev("serves on 127.0.0.1:3000, api.example.com:443 and ghcr.io/acme/api:42").code).toBe(0);
    expect(ev("`My Docs/a.ts:4` is quoted").err).toContain("My Docs/a.ts has only 1 line");
    expect(ev("`My Docs/a.ts:1` is quoted").code).toBe(0);
  });

  it("a rename reports both the old and the new location", () => {
    const repo = existingRepo();
    run(repo, "init");
    git(repo, "mv", ".github/workflows/ci.yml", "archive-ci.yml");
    git(repo, "commit", "-qm", "move ci");
    const c = JSON.parse(run(repo, "changes", "--json").out);
    expect(c.committed).toContain(".github/workflows/ci.yml");
    expect(c.dimensions.VER).toContain(".github/workflows/ci.yml");
    git(repo, "mv", "CLAUDE.md", "AGENTS-old.md");
    expect(JSON.parse(run(repo, "changes", "--json").out).uncommitted).toEqual(expect.arrayContaining(["CLAUDE.md", "AGENTS-old.md"]));
  });

  it("an empty list and an absent field hash the same plan", () => {
    const repo = makeRepo(GREENFIELD);
    planned(repo);
    run(repo, "approve", "roadmap", "--by", "human:owner");
    patch(repo, { milestones: [{ id: "M-001", outcomes: [] }], tasks: [{ id: "T-002", findingIds: [] }] });
    expect(run(repo, "status", "--brief").out).not.toContain("ROADMAP");
  });
});
