import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { git } from "./git.js";

/** Root of the playbook/plugin. Works from cli/src (tests) and cli/dist (bundle). */
export function playbookRoot(): string {
  if (process.env.AGENTIC_PLAYBOOK_ROOT) return resolve(process.env.AGENTIC_PLAYBOOK_ROOT);
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..");
}

export function repoRoot(start: string): string {
  const top = git(["rev-parse", "--show-toplevel"], start);
  return realpathSync.native(top ?? resolve(start));
}

export function repoKey(root: string): string {
  const hash = createHash("sha1").update(root).digest("hex").slice(0, 8);
  return `${basename(root)}-${hash}`;
}

export function stagingHome(): string {
  return process.env.AGENTIC_HOME ? resolve(process.env.AGENTIC_HOME) : join(homedir(), ".agentic-playbook");
}

export interface StoreLocation {
  repoRoot: string;
  dir: string;
  recordPath: string;
  scanPath: string;
  adopted: boolean;
}

/**
 * The record lives outside the target worktree during read-only assessment
 * (staging) and at <repo>/.agentic/ once adopted. Adopted always wins.
 */
export function locateStore(start: string): StoreLocation {
  const root = repoRoot(start);
  const adoptedDir = join(root, ".agentic");
  const adopted = existsSync(join(adoptedDir, "record.json"));
  const dir = adopted ? adoptedDir : join(stagingHome(), repoKey(root));
  return { repoRoot: root, dir, recordPath: join(dir, "record.json"), scanPath: join(dir, "scan.json"), adopted };
}
