import { execFileSync } from "node:child_process";

/** Run a read-only git command; returns trimmed stdout or null on failure. */
export function git(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function headRevision(cwd: string): string | null {
  return git(["rev-parse", "HEAD"], cwd);
}

export function commitsSince(cwd: string, rev: string | null): number | null {
  if (!rev) return null;
  const out = git(["rev-list", "--count", `${rev}..HEAD`], cwd);
  return out === null ? null : Number(out);
}

export function commitCount(cwd: string): number {
  const out = git(["rev-list", "--count", "HEAD"], cwd);
  return out ? Number(out) : 0;
}

export function remoteUrl(cwd: string): string | null {
  return git(["remote", "get-url", "origin"], cwd);
}

export function defaultBranch(cwd: string): string | null {
  const ref = git(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], cwd);
  if (ref) return ref.replace(/^origin\//, "");
  return git(["branch", "--show-current"], cwd);
}

export function isDirty(cwd: string): boolean {
  const out = git(["status", "--porcelain"], cwd);
  return !!out;
}
