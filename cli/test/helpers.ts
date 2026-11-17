import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { vi } from "vitest";
import { main } from "../src/cli.js";
import { locateStore } from "../src/paths.js";
import type { AssessmentRecord } from "../src/types.js";

export function makeRepo(files: Record<string, string>, commits = 1): string {
  const dir = mkdtempSync(join(tmpdir(), "agentic-fx-"));
  const g = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "ignore" });
  g("init", "-q");
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, p)), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  g("add", "-A");
  for (let i = 0; i < commits; i++) g("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", `c${i}`);
  return dir;
}

export const GREENFIELD = {
  "package.json": JSON.stringify({ name: "gf", scripts: { test: "vitest run", lint: "eslint ." } }),
  "CLAUDE.md": "# GF\n\nRun `npm test`. See [arch](docs/architecture.md).\n",
  "docs/architecture.md": "# Architecture\n",
};

export function existingRepo(): string {
  const files: Record<string, string> = {
    "package.json": JSON.stringify({ name: "ex", packageManager: "pnpm@9.0.0", scripts: { test: "vitest", lint: "eslint .", typecheck: "tsc", build: "vite build", format: "prettier -c ." } }),
    "pnpm-lock.yaml": "lockfileVersion: 9\n",
    ".nvmrc": "20\n",
    "CLAUDE.md": "# Ex\n\n`pnpm lint` `pnpm run typecheck` `pnpm run missing`\n\n[ADRs](docs/adr/0001.md)\n",
    "docs/adr/0001.md": "# ADR 1\n",
    ".github/workflows/ci.yml": "on: [pull_request]\npermissions:\n  contents: read\njobs:\n  ci:\n    steps:\n      - run: pnpm lint && pnpm typecheck && pnpm test && pnpm build\n",
    ".github/CODEOWNERS": ".github/ @platform\n",
    ".dependency-cruiser.cjs": "module.exports = {}\n",
    ".claude/settings.json": JSON.stringify({ permissions: { deny: ["Edit(.github/**)"] } }),
  };
  for (let i = 0; i < 40; i++) files[`src/mod${i}.ts`] = `export const v${i} = ${i};\n`;
  return makeRepo(files, 3);
}

/** A pnpm monorepo: a Next.js web app with scoped conventions, and an Express API with Prisma and none. */
export function monorepo(): string {
  return makeRepo({
    "package.json": JSON.stringify({ name: "mono", private: true, scripts: { test: "turbo test" } }),
    "pnpm-workspace.yaml": "packages:\n  - apps/*\n",
    "CLAUDE.md": "# Mono\n\nRun `pnpm test`.\n",
    ".claude/rules/web.md": "---\npaths:\n  - \"apps/web/**\"\n---\n# Web conventions\n\n- Fetch server data in server components (FE-03).\n",
    "apps/web/package.json": JSON.stringify({ name: "web", dependencies: { next: "15.0.0", react: "19.0.0" }, devDependencies: { typescript: "5.7.2" } }),
    "apps/web/app/page.tsx": "export default function Page() { return null }\n",
    "apps/api/package.json": JSON.stringify({ name: "api", dependencies: { express: "4.21.0", "@prisma/client": "6.0.0" } }),
    "apps/api/src/server.ts": "export {}\n",
    "apps/web/e2e/package.json": JSON.stringify({ name: "e2e" }),
  });
}

export function run(repo: string, ...argv: string[]): { code: number; out: string; err: string } {
  const out: string[] = [];
  const err: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...a) => void out.push(a.join(" ")));
  const error = vi.spyOn(console, "error").mockImplementation((...a) => void err.push(a.join(" ")));
  let code: number;
  try {
    code = main([...argv, "--repo", repo]);
  } catch (e) {
    err.push((e as Error).message);
    code = 2;
  } finally {
    log.mockRestore();
    error.mockRestore();
  }
  return { code, out: out.join("\n"), err: err.join("\n") };
}

export function readRecord(repo: string): AssessmentRecord {
  return JSON.parse(readFileSync(locateStore(repo).recordPath, "utf8"));
}

export function patch(repo: string, body: unknown, by = "agent:claude") {
  const file = join(mkdtempSync(join(tmpdir(), "agentic-patch-")), "p.json");
  writeFileSync(file, JSON.stringify(body));
  return run(repo, "apply", file, "--by", by);
}

/** A planned record: one milestone, two tasks (T-002 depends on T-001). */
export function planned(repo: string) {
  run(repo, "init");
  const r = patch(repo, {
    findings: [
      { id: "F-001", title: "No CI gate", kind: "verified", dimension: "VER", priority: "P0", currentState: "none", desiredState: "gate", evidence: ["no .github/workflows"], remediation: "add CI", criterionIds: ["VER-03"] },
    ],
    milestones: [{ id: "M-001", title: "Foundation", objective: "Deterministic gate", dependsOn: [], exitCriteria: [{ id: "M-001.X1", text: "CI fails on a failing check" }] }],
    tasks: [
      { id: "T-001", milestoneId: "M-001", title: "Add CI", description: "Add CI workflow", priority: "P0", findingIds: ["F-001"], acceptanceCriteria: [{ id: "T-001.AC1", text: "CI runs lint and test" }], verification: ["gh run view"] },
      { id: "T-002", milestoneId: "M-001", title: "Aggregate gate", description: "Add gate job", priority: "P0", dependsOn: ["T-001"], acceptanceCriteria: [{ id: "T-002.AC1", text: "gate fails on skip" }], verification: ["fixture run"] },
    ],
  });
  if (r.code !== 0) throw new Error(r.err);
}
