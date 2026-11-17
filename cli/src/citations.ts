import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, normalize } from "node:path";

/**
 * Evidence strings are written by agents. Where one cites a specific location
 * (`path:line` or `path:start-end`), that location must exist in the worktree
 * being assessed. Citations without a line ("no .github/workflows", "see
 * package.json") are not checked: absence is a legitimate claim, and a bare
 * name is not a precise one.
 */

const URL = /\b[a-z][a-z0-9+.-]*:\/\/\S+/gi;
// A path, then :line or :start-end. Paths may hold route segments such as [id], (group) and $param.
// A trailing sentence period is allowed. A path with spaces is checked only when quoted in backticks.
const CITATION = /(?:^|[\s(`'"[,;])([\w@+.$~-][\w@+./$~()[\]-]*):(\d+)(?:-(\d+))?(?=$|[\s)`'",;:\]]|\.(?:\s|$))/g;
const QUOTED = /`([^`\n]*\s[^`\n]*):(\d+)(?:-(\d+))?`/g;
// Extensions that mark a token as a file even when its first segment is not in the worktree.
const FILE_EXT = /\.(c|cc|cfg|cjs|clj|conf|cpp|cs|css|cts|dart|env|ex|exs|gradle|graphql|go|h|hpp|html?|ini|ipynb|java|js|json5?|jsonc|jsx|kt|kts|lock|md|mdx|mjs|mts|php|proto|py|rb|rs|scala|scss|sh|sql|svelte|swift|tf|toml|ts|tsx|txt|vue|xml|ya?ml)$/i;

export interface Citation {
  path: string;
  start: number;
  end: number;
}

/**
 * Precise citations in a string. A token counts as a path only when its first
 * segment exists in the repository or it ends in a file extension, so hosts,
 * IP addresses and image tags (`127.0.0.1:3000`, `ghcr.io/acme/api:42`) are not
 * mistaken for files. Without a repository root, only the extension rule applies.
 */
export function citationsIn(text: string, repoRoot?: string): Citation[] {
  const out: Citation[] = [];
  const push = (raw: string, a: string, b?: string) => {
    const path = raw.replace(/^\.\//, "");
    if (!/[./]/.test(path) || /^\.+$/.test(path)) return;
    const first = path.split("/")[0]!;
    const known = !!repoRoot && first !== "" && first !== "." && first !== ".." && existsSync(join(repoRoot, first));
    if (!known && !FILE_EXT.test(path) && !path.startsWith("../") && !path.startsWith("/")) return;
    const start = Number(a);
    out.push({ path, start, end: b ? Number(b) : start });
  };
  let clean = text.replace(URL, " ");
  clean = clean.replace(QUOTED, (_m, p: string, a: string, b?: string) => {
    push(p, a, b);
    return " ";
  });
  for (const m of clean.matchAll(CITATION)) push(m[1]!, m[2]!, m[3]);
  return out;
}

const lineCounts = new Map<string, number | "dir" | null>();

function lines(repoRoot: string, rel: string): number | "dir" | null {
  const abs = join(repoRoot, rel);
  if (lineCounts.has(abs)) return lineCounts.get(abs)!;
  let n: number | "dir" | null;
  try {
    if (statSync(abs).isDirectory()) n = "dir";
    else {
      const text = readFileSync(abs, "utf8");
      n = text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
    }
  } catch {
    n = null;
  }
  lineCounts.set(abs, n);
  return n;
}

/** Problems with the precise citations in these evidence strings, labelled for the user. */
export function checkCitations(repoRoot: string, label: string, evidence: unknown): string[] {
  lineCounts.clear();
  if (!Array.isArray(evidence)) return [];
  const problems: string[] = [];
  for (const e of evidence) {
    if (typeof e !== "string") continue;
    for (const c of citationsIn(e, repoRoot)) {
      const cite = `${c.path}:${c.start}${c.end !== c.start ? `-${c.end}` : ""}`;
      const rel = normalize(c.path);
      if (isAbsolute(c.path) || rel.startsWith("..")) {
        problems.push(`${label} cites ${cite}, which is outside the repository. Cite a repo-relative path.`);
        continue;
      }
      const n = lines(repoRoot, rel);
      if (n === null) problems.push(`${label} cites ${cite}, but ${c.path} does not exist in the worktree. Cite the repo-relative path you read (in backticks if it contains spaces), or drop the line number for an absence claim.`);
      else if (n === "dir") problems.push(`${label} cites ${cite}, but ${c.path} is a directory. Cite a file.`);
      else if (c.start < 1 || c.end < c.start) problems.push(`${label} cites ${cite}, which is not a valid line range.`);
      else if (c.end > n) problems.push(`${label} cites ${cite}, but ${c.path} has only ${n} line${n === 1 ? "" : "s"}. Re-read the file and cite the real line.`);
    }
  }
  return problems;
}
