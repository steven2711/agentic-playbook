import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { git } from "./git.js";
import { repoKey, stagingHome } from "./paths.js";
import { UsageError } from "./types.js";

/**
 * Read-only assessment, enforced rather than requested.
 *
 *  - `begin` fingerprints the worktree (HEAD, branch, and the content of every
 *    modified or untracked path) without writing to the repository, and opens
 *    a time-limited window recorded in the staging directory.
 *  - The plugin's PreToolUse hook calls `check` and refuses Claude's file-tool
 *    writes (Edit, Write, NotebookEdit) inside a repository with an open window,
 *    including `.git/` and `.agentic/`.
 *  - `end` recomputes the fingerprint and fails, listing every change, if the
 *    worktree moved (including shell writes the hook cannot see). Gitignored
 *    paths are outside the fingerprint; `.git/info/exclude` is inside it.
 *
 * `.agentic/` is excluded from the fingerprint: an adopted record is
 * legitimately rewritten by `agentic apply` (not by file tools) during the
 * assessment.
 */

export const WINDOW_HOURS = 6;

export interface Fingerprint {
  head: string | null;
  branch: string | null;
  /** path -> porcelain status plus content hash ("deleted" when gone). */
  paths: Record<string, string>;
}

export interface Lock {
  repoRoot: string;
  startedAt: string;
  expiresAt: string;
  fingerprint: Fingerprint;
}

const EXCLUDED = /^\.agentic(\/|$)/;

/** Uncommitted paths (modified, staged, deleted, untracked) with their porcelain codes, excluding `.agentic/`. */
export function uncommittedPaths(repoRoot: string): [string, string][] {
  let raw = "";
  try {
    raw = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    raw = "";
  }
  const entries: [string, string][] = [];
  const parts = raw.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (p.length < 4) continue;
    const code = p.slice(0, 2);
    const path = p.slice(3);
    if (!EXCLUDED.test(path)) entries.push([path, code]);
    if (code[0] === "R" || code[0] === "C") {
      // The next entry is the original path: a move touches both places.
      const from = parts[++i];
      if (from && !EXCLUDED.test(from)) entries.push([from, code]);
    }
  }
  return entries;
}

export function fingerprint(repoRoot: string): Fingerprint {
  const head = git(["rev-parse", "HEAD"], repoRoot);
  const branch = git(["symbolic-ref", "-q", "--short", "HEAD"], repoRoot);
  const entries = uncommittedPaths(repoRoot);
  const hashes = new Map<string, string>();
  const files: string[] = [];
  for (const [p] of entries) {
    const st = statOrNull(join(repoRoot, p));
    if (!st) continue;
    if (st.isDirectory()) hashes.set(p, directoryHash(join(repoRoot, p)));
    else if (st.isFile() && !p.includes("\n")) files.push(p);
    else hashes.set(p, st.isFile() ? fileHash(join(repoRoot, p)) : `special:${st.mode}:${st.size}`);
  }
  if (files.length) {
    try {
      const out = execFileSync("git", ["hash-object", "--stdin-paths"], { cwd: repoRoot, input: files.join("\n") + "\n", encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
      out.trim().split("\n").forEach((h, i) => hashes.set(files[i]!, h));
    } catch {
      // Never let one unreadable file blank every hash: fall back to hashing each file on its own.
      for (const p of files) hashes.set(p, fileHash(join(repoRoot, p)));
    }
  }
  const paths: Record<string, string> = {};
  for (const [p, code] of entries) paths[p] = `${code} ${hashes.get(p) ?? "deleted"}`;
  // Local ignore rules can hide later writes from `git status`; changing them is itself a change.
  const exclude = join(repoRoot, ".git", "info", "exclude");
  if (existsSync(exclude)) paths[".git/info/exclude"] = `exclude ${fileHash(exclude)}`;
  return { head, branch, paths };
}

function statOrNull(p: string) {
  try {
    return statSync(p);
  } catch {
    return null;
  }
}

function fileHash(p: string): string {
  try {
    return createHash("sha1").update(readFileSync(p)).digest("hex");
  } catch {
    return "unreadable";
  }
}

/** A nested repository or submodule: its HEAD plus its own status, so work inside it is still seen. */
function directoryHash(dir: string): string {
  const head = git(["rev-parse", "HEAD"], dir) ?? "";
  let status = "";
  try {
    status = execFileSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
  } catch {
    status = "";
  }
  return `dir:${createHash("sha1").update(`${head}\0${status}`).digest("hex")}`;
}

/** Human-readable differences between two fingerprints. Empty means unchanged. */
export function diffFingerprints(a: Fingerprint, b: Fingerprint): string[] {
  const out: string[] = [];
  if (a.head !== b.head) out.push(`HEAD moved: ${a.head?.slice(0, 12) ?? "none"} -> ${b.head?.slice(0, 12) ?? "none"}`);
  if (a.branch !== b.branch) out.push(`branch changed: ${a.branch ?? "(detached)"} -> ${b.branch ?? "(detached)"}`);
  for (const p of [...new Set([...Object.keys(a.paths), ...Object.keys(b.paths)])].sort()) {
    const was = a.paths[p];
    const now = b.paths[p];
    if (was === now) continue;
    if (!was) {
      const code = now!.slice(0, 2);
      const kind = code === "??" ? "created" : code.includes("D") ? "deleted" : code.includes("R") ? "renamed" : "modified";
      out.push(`${p}: ${kind} during the assessment`);
    }
    else if (!now) out.push(`${p}: change reverted or committed during the assessment`);
    else out.push(`${p}: content changed during the assessment`);
  }
  return out;
}

export function lockPath(repoRoot: string): string {
  return join(stagingHome(), repoKey(repoRoot), "readonly.json");
}

export function readLock(repoRoot: string): Lock | null {
  const p = lockPath(repoRoot);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as Lock;
  } catch {
    return null;
  }
}

/** The open window, or null. An expired lock is removed, so the hook's fast path stays fast. */
export function liveLock(repoRoot: string, at = new Date()): Lock | null {
  const l = readLock(repoRoot);
  if (!l) return null;
  if (new Date(l.expiresAt) > at) return l;
  rmSync(lockPath(repoRoot), { force: true });
  return null;
}

export function beginWindow(repoRoot: string, opts: { restart?: boolean } = {}): { lock: Lock; dirty: number; replaced: boolean } {
  const open = liveLock(repoRoot);
  if (open && !opts.restart) {
    throw new UsageError(
      `A read-only window is already open for ${repoRoot} (since ${open.startedAt}). Starting a new one would discard changes made since then. ` +
        "Run `agentic readonly end` first and report what it lists, or pass --restart if that window was abandoned.",
    );
  }
  const replaced = !!open;
  const started = new Date();
  const lock: Lock = {
    repoRoot,
    startedAt: started.toISOString(),
    expiresAt: new Date(started.getTime() + WINDOW_HOURS * 3600_000).toISOString(),
    fingerprint: fingerprint(repoRoot),
  };
  const p = lockPath(repoRoot);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(lock, null, 2) + "\n");
  // .git/info/exclude is fingerprinted to catch changed ignore rules; it is not an uncommitted path.
  return { lock, dirty: Object.keys(lock.fingerprint.paths).filter((p) => p !== ".git/info/exclude").length, replaced };
}

export function endWindow(repoRoot: string): { lock: Lock | null; changes: string[] } {
  const lock = readLock(repoRoot);
  if (!lock) return { lock: null, changes: [] };
  const changes = diffFingerprints(lock.fingerprint, fingerprint(repoRoot));
  rmSync(lockPath(repoRoot), { force: true });
  return { lock, changes };
}

/** Resolve symlinks (and, on case-insensitive filesystems, letter case) in the longest existing prefix of a path that may not exist yet. */
function realish(path: string): { real: string; existing: string } | null {
  let dir = resolve(path);
  const rest: string[] = [];
  while (!existsSync(dir)) {
    const up = dirname(dir);
    if (up === dir) return null;
    rest.unshift(dir.slice(up.length).replace(/^[\\/]/, ""));
    dir = up;
  }
  const base = realpathSync.native(dir);
  return { real: join(base, ...rest), existing: statSync(base).isDirectory() ? base : dirname(base) };
}

/** The repository root containing a path that may not exist yet, including paths inside its .git directory. */
export function repoOf(path: string): string | null {
  const r = realish(path);
  if (!r) return null;
  // Inside .git, `--show-toplevel` fails: start from the directory that holds .git.
  const segs = r.existing.split(sep);
  const gitAt = segs.lastIndexOf(".git");
  const start = gitAt > 0 ? segs.slice(0, gitAt).join(sep) || sep : r.existing;
  const top = git(["rev-parse", "--show-toplevel"], start);
  return top ? realpathSync.native(top) : null;
}

/** Why a write to this path is refused, or null when it is allowed. */
export function writeRefusal(path: string, at = new Date()): string | null {
  const r = realish(path);
  if (!r) return null;
  const root = repoOf(path);
  if (!root) return null;
  const lock = liveLock(root, at);
  if (!lock) return null;
  const rel = relative(root, r.real).split(sep).join("/");
  if (rel.startsWith("..")) return null;
  const what = /^\.git(\/|$)/.test(rel)
    ? `${rel} (git metadata, which can hide or rewrite changes)`
    : EXCLUDED.test(rel)
      ? `${rel} (the record is written only by the agentic CLI, which validates it)`
      : rel;
  return (
    `Refused: a read-only assessment of ${root} is in progress (since ${lock.startedAt}), so writes to ${what} are not allowed. ` +
    "Assessment commands must not modify the repository. Put scratch files and patches in the session scratchpad, " +
    "or, if the assessment is finished, close the window with `agentic readonly end`."
  );
}
