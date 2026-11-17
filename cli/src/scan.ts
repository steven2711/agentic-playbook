import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { commitCount, defaultBranch, headRevision, remoteUrl } from "./git.js";
import { detectApps } from "./conventions.js";
import { assessStrictness, countSuppressions, loadStrictness } from "./strictness.js";
import type { CriterionStatus, Mode } from "./types.js";

/**
 * Read-only probes. Nothing here writes to the target repository. Probe
 * results are *suggestions* with evidence; auditors confirm or override them.
 */

const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", "build", "out", ".next", ".nuxt", "coverage", "vendor", ".venv", "venv", "__pycache__",
  "target", ".turbo", ".cache", ".gradle", ".idea", ".vscode", "Pods", ".terraform", ".agentic",
]);
const SOURCE_EXT = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".rb", ".cs", ".php", ".swift",
  ".scala", ".ex", ".exs", ".c", ".cc", ".cpp", ".h", ".hpp", ".vue", ".svelte", ".dart", ".clj",
]);
const MAX_FILES = 25000;

/** Every probe name a rubric criterion may reference. Checked by lint-playbook. */
export const PROBES = [
  "claude_md", "agent_guidance_sources", "scoped_rules", "canonical_commands", "claude_md_commands", "reproducible_setup",
  "ci_runs_checks", "doc_checks", "ci_permissions", "boundary_tooling", "baselines", "codeowners", "architecture_docs",
  "secret_scanning", "dependency_scanning", "agent_settings", "policy_hooks", "coverage", "eval_cases", "branch_protection",
  "conventions", "strictness", "suppressions",
] as const;

export interface ProbeResult {
  status: CriterionStatus;
  evidence: string[];
  note?: string;
}

export interface ScanResult {
  scannedAt: string;
  revision: string | null;
  repo: { name: string; remote: string | null; defaultBranch: string | null };
  stats: { files: number; sourceFiles: number; testFiles: number; commits: number; truncated: boolean };
  suggestedMode: Mode;
  modeReason: string;
  facts: Record<string, unknown>;
  probes: Record<string, ProbeResult>;
}

export function walk(root: string): { files: string[]; truncated: boolean } {
  const files: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(join(dir, e.name));
      } else if (e.isFile()) {
        files.push(relative(root, join(dir, e.name)));
        if (files.length >= MAX_FILES) return { files, truncated: true };
      }
    }
  }
  return { files: files.sort(), truncated: false };
}

const read = (root: string, rel: string) => {
  try {
    return readFileSync(join(root, rel), "utf8");
  } catch {
    return "";
  }
};

const isTest = (f: string) => /(^|\/)(__tests__|tests?|spec|e2e)\//.test(f) || /\.(test|spec)\.[a-z]+$/.test(f) || /(^|\/)test_[^/]+\.py$/.test(f) || /_test\.(go|py)$/.test(f);

const CANONICAL: Record<string, RegExp> = {
  format: /^(format|fmt|prettier)(:check)?$/,
  lint: /^lint(:.*)?$/,
  typecheck: /^(typecheck|type-check|types|tsc|check-types)$/,
  build: /^build$/,
  test: /^test(:unit)?$/,
};
const MAKE_CANONICAL: Record<string, RegExp> = {
  format: /^(format|fmt)$/,
  lint: /^lint$/,
  typecheck: /^(typecheck|types|mypy)$/,
  build: /^build$/,
  test: /^test$/,
};

export function scan(root: string, opts: { github?: boolean } = {}): ScanResult {
  const { files, truncated } = walk(root);
  const has = (rel: string) => files.includes(rel);
  const matching = (re: RegExp) => files.filter((f) => re.test(f));
  const sourceFiles = files.filter((f) => SOURCE_EXT.has(extname(f)) && !/\.config\.[cm]?[jt]s$/.test(f) && !isTest(f));
  const testFiles = files.filter((f) => SOURCE_EXT.has(extname(f)) && isTest(f));
  const commits = commitCount(root);
  const probes: Record<string, ProbeResult> = {};
  const facts: Record<string, unknown> = {};

  // ---------- agent context
  const claudeMd = has("CLAUDE.md") ? "CLAUDE.md" : has(".claude/CLAUDE.md") ? ".claude/CLAUDE.md" : null;
  const claudeText = claudeMd ? read(root, claudeMd) : "";
  const claudeLines = claudeText ? claudeText.split("\n").length : 0;
  const nestedClaude = matching(/(^|\/)CLAUDE\.md$/).filter((f) => f !== claudeMd);
  const agentsMd = matching(/(^|\/)AGENTS\.md$/);
  const rules = matching(/^\.claude\/rules\/.+\.md$/);
  const skills = matching(/^\.claude\/skills\/[^/]+\/SKILL\.md$/);
  const commands = matching(/^\.claude\/commands\/.+\.md$/);
  const agents = matching(/^\.claude\/agents\/.+\.md$/);
  const settingsFiles = [".claude/settings.json", ".claude/settings.local.json"].filter(has);
  const settings = settingsFiles.map((f) => {
    try {
      return JSON.parse(read(root, f)) as Record<string, any>;
    } catch {
      return {};
    }
  });
  const imports = [...claudeText.matchAll(/^@([\w./-]+)/gm)].map((m) => m[1]);
  facts.agentContext = { claudeMd, claudeLines, nestedClaude, agentsMd, rules, skills, commands, agents, settingsFiles, imports };

  if (!claudeMd) probes.claude_md = { status: "failed", evidence: ["No root CLAUDE.md found."] };
  else {
    const links = (claudeText.match(/\]\([^)]+\)/g) ?? []).length + imports.length;
    const ok = claudeLines <= 200 && links > 0;
    probes.claude_md = {
      status: ok ? "partial" : claudeLines > 400 ? "failed" : "partial",
      evidence: [`${claudeMd}: ${claudeLines} lines, ${links} links/imports.`],
      note: "Probe checks size and links only; an auditor must confirm it is navigational (purpose, commands, constraints, links).",
    };
  }
  const guidance = [claudeMd, ...nestedClaude, ...agentsMd, ...rules].filter(Boolean) as string[];
  probes.agent_guidance_sources = {
    status: guidance.length === 0 ? "failed" : "unverified",
    evidence: guidance.length ? [`Agent guidance sources: ${guidance.join(", ")}`] : ["No agent guidance files found."],
    note: "Duplication and contradiction require reading the sources.",
  };
  probes.scoped_rules = {
    status: rules.length + nestedClaude.length + skills.length > 0 ? "partial" : "failed",
    evidence: [`${rules.length} .claude/rules, ${nestedClaude.length} nested CLAUDE.md, ${skills.length} project skills.`],
  };

  // ---------- engineering conventions per app
  const apps = detectApps(files, (rel) => read(root, rel));
  facts.apps = apps;
  const uncovered = apps.filter((a) => a.conventions.length === 0);
  probes.conventions = {
    status: uncovered.length === apps.length ? "failed" : "partial",
    evidence: [
      `${apps.length} app root(s): ${apps.map((a) => `${a.root} [${a.signals.filter((x) => x !== "any").join(", ") || "no stack signals"}]`).join("; ")}`,
      ...apps.filter((a) => a.conventions.length).map((a) => `${a.root} conventions: ${a.conventions.join(", ")}`),
      ...(uncovered.length ? [`no scoped conventions for: ${uncovered.map((a) => a.root).join(", ")}`] : []),
    ],
    note: "Presence only. The context auditor judges content; the conventions-advisor compares it with the baseline library.",
  };

  // ---------- strictness profile & inline suppressions per app
  const strictness = assessStrictness(loadStrictness(), apps, files, (rel) => read(root, rel));
  facts.strictness = strictness;
  const tier1 = strictness.flatMap((a) => a.checks.filter((c) => c.tier === 1).map((c) => ({ ...c, app: a.root })));
  const tier1Off = tier1.filter((c) => c.status === "off");
  probes.strictness = {
    status: tier1.length && tier1Off.length === 0 ? "partial" : "failed",
    evidence: [
      ...strictness.map((a) => {
        const t1 = a.checks.filter((c) => c.tier === 1);
        const off = t1.filter((c) => c.status === "off");
        return `${a.root}: Tier 1 ${t1.length - off.length}/${t1.length} on${off.length ? `; off: ${off.map((c) => `${c.id} ${c.title}`).join("; ")}` : ""}`;
      }),
    ],
    note: "Config presence only. The verification auditor confirms CI runs these at zero or behind a tool-native baseline. Run `agentic strictness` for the per-app list.",
  };
  const sup = countSuppressions(apps, files, (rel) => read(root, rel));
  facts.suppressions = sup;
  const guarded = sup.descriptionRules.length > 0 || sup.baselines.length > 0;
  probes.suppressions = {
    status: sup.total === 0 || sup.undescribed === 0 || guarded ? "partial" : "failed",
    evidence: [
      `${sup.total} inline suppressions (${sup.undescribed} without a reason or specific rule) in ${sup.filesScanned} files${sup.truncated ? " (truncated)" : ""}`,
      ...Object.entries(sup.byApp).map(([app, kinds]) => `${app}: ${Object.entries(kinds).map(([k, v]) => `${v.total} ${k}`).join(", ")}`),
      `rules requiring a reason: ${sup.descriptionRules.join(", ") || "none"}`,
      `suppression baselines: ${sup.baselines.join(", ") || "none"}`,
    ],
    note: "Counts are textual and may include matches inside strings. The auditor confirms whether growth is blocked (ARC-08).",
  };

  // ---------- manifests & commands
  const pkgFiles = matching(/(^|\/)package\.json$/);
  const scripts: Record<string, string> = {};
  const workspaceScripts: Record<string, string> = {};
  for (const p of pkgFiles) {
    try {
      const pkg = JSON.parse(read(root, p));
      for (const [k, v] of Object.entries(pkg.scripts ?? {})) (p === "package.json" ? scripts : workspaceScripts)[p === "package.json" ? k : `${dirname(p)}#${k}`] = String(v);
      if (p === "package.json") facts.packageManagerField = pkg.packageManager ?? null;
    } catch {
      /* ignore */
    }
  }
  const makeTargets = has("Makefile") ? [...read(root, "Makefile").matchAll(/^([A-Za-z][\w-]*):/gm)].map((m) => m[1]!) : [];
  const justTargets = has("justfile") ? [...read(root, "justfile").matchAll(/^([A-Za-z][\w-]*)\s*(?:[^:=\n]*)?:/gm)].map((m) => m[1]!) : [];
  const pyproject = read(root, "pyproject.toml");
  const canonical: Record<string, string | null> = {};
  for (const [cat, re] of Object.entries(CANONICAL)) {
    const s = Object.keys(scripts).find((k) => re.test(k));
    const mk = makeTargets.find((t) => MAKE_CANONICAL[cat]!.test(t));
    const jt = justTargets.find((t) => MAKE_CANONICAL[cat]!.test(t));
    canonical[cat] = s ? `package.json scripts.${s}` : mk ? `Makefile ${mk}` : jt ? `justfile ${jt}` : null;
  }
  if (!canonical.lint && /\[tool\.ruff\]/.test(pyproject)) canonical.lint = "pyproject.toml [tool.ruff] (no wrapper command)";
  if (!canonical.typecheck && /\[tool\.mypy\]/.test(pyproject)) canonical.typecheck = "pyproject.toml [tool.mypy] (no wrapper command)";
  if (!canonical.test && /\[tool\.pytest/.test(pyproject)) canonical.test = "pyproject.toml [tool.pytest] (no wrapper command)";
  if (has("Cargo.toml")) for (const c of ["build", "test", "lint", "format"]) canonical[c] ??= `cargo (${c === "lint" ? "clippy" : c === "format" ? "fmt" : c})`;
  if (has("go.mod")) for (const c of ["build", "test", "format"]) canonical[c] ??= `go ${c === "format" ? "fmt" : c}`;
  facts.scripts = scripts;
  facts.workspaceScripts = Object.keys(workspaceScripts).slice(0, 200);
  facts.makeTargets = makeTargets;
  facts.canonicalCommands = canonical;
  const found = Object.entries(canonical).filter(([, v]) => v);
  const missing = Object.entries(canonical).filter(([, v]) => !v).map(([k]) => k);
  probes.canonical_commands = {
    status: missing.length === 0 ? "passed" : found.length >= 2 ? "partial" : "failed",
    evidence: [...found.map(([k, v]) => `${k}: ${v}`), ...(missing.length ? [`missing: ${missing.join(", ")}`] : [])],
  };

  // CLAUDE.md command references resolve?
  if (claudeMd) {
    const refs = [...claudeText.matchAll(/`((?:npm|pnpm|yarn|bun) (?:run )?([\w:-]+))[^`]*`/g)].map((m) => ({ cmd: m[1]!, script: m[2]! }));
    const builtin = new Set(["install", "i", "ci", "test", "start", "exec", "dlx", "x", "add"]);
    const unresolved = refs.filter((r) => !builtin.has(r.script) && !(r.script in scripts));
    const testOk = refs.some((r) => r.script === "test") ? "test" in scripts : true;
    probes.claude_md_commands = {
      status: refs.length === 0 ? "failed" : unresolved.length === 0 && testOk ? "passed" : "partial",
      evidence: refs.length
        ? [`${refs.length} command references in ${claudeMd}`, ...unresolved.map((u) => `unresolved: \`${u.cmd}\``)]
        : [`No package-manager command references found in ${claudeMd}; Makefile/other commands need manual review.`],
    };
  } else probes.claude_md_commands = { status: "failed", evidence: ["No CLAUDE.md to document commands."] };

  // ---------- reproducible setup
  const lockfiles = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock", "poetry.lock", "uv.lock", "Pipfile.lock", "Cargo.lock", "go.sum", "Gemfile.lock", "composer.lock"].filter(has);
  const pins = [".nvmrc", ".node-version", ".tool-versions", ".python-version", "rust-toolchain.toml", "rust-toolchain", "mise.toml", ".mise.toml", "flake.nix", ".devcontainer/devcontainer.json"].filter(has);
  if (facts.packageManagerField) pins.push(`package.json packageManager=${facts.packageManagerField}`);
  facts.setup = { lockfiles, pins };
  probes.reproducible_setup = {
    status: lockfiles.length && pins.length ? "passed" : lockfiles.length || pins.length ? "partial" : "failed",
    evidence: [`lockfiles: ${lockfiles.join(", ") || "none"}`, `toolchain pins: ${pins.join(", ") || "none"}`],
  };

  // ---------- CI
  const ghWorkflows = matching(/^\.github\/workflows\/[^/]+\.ya?ml$/);
  const otherCi = [".gitlab-ci.yml", ".circleci/config.yml", "azure-pipelines.yml", "bitbucket-pipelines.yml", "Jenkinsfile", ".buildkite/pipeline.yml"].filter(has);
  const ciFiles = [...ghWorkflows, ...otherCi];
  const ciText = ciFiles.map((f) => read(root, f)).join("\n");
  const ciCovers: Record<string, boolean> = {};
  for (const cat of Object.keys(CANONICAL)) {
    const re = cat === "typecheck" ? /(typecheck|type-check|tsc|mypy|pyright)/ : cat === "format" ? /(format|prettier|fmt|black|ruff format)/ : new RegExp(`\\b${cat}\\b`);
    ciCovers[cat] = re.test(ciText);
  }
  const prTriggered = /pull_request|merge_request|on:\s*\[?\s*push/.test(ciText) || otherCi.length > 0;
  facts.ci = { files: ciFiles, covers: ciCovers, prTriggered };
  const covered = Object.entries(ciCovers).filter(([, v]) => v).map(([k]) => k);
  probes.ci_runs_checks = {
    status: ciFiles.length === 0 ? "failed" : covered.length >= 3 && prTriggered ? "passed" : "partial",
    evidence: ciFiles.length ? [`CI files: ${ciFiles.join(", ")}`, `checks referenced: ${covered.join(", ") || "none"}`, `change-triggered: ${prTriggered}`] : ["No CI configuration found."],
  };
  const docCheck = /(markdown-link-check|lychee|linkinator|remark-validate-links|markdownlint|mdlint|docs?:check|check-links)/i.test(ciText + JSON.stringify(scripts));
  probes.doc_checks = { status: docCheck ? "partial" : "failed", evidence: [docCheck ? "Documentation/link checking tool referenced in CI or scripts." : "No documentation or link check found in CI or scripts."] };

  // permissions
  const permissive = ghWorkflows.filter((f) => !/^\s*permissions:/m.test(read(root, f)));
  const prt = ghWorkflows.filter((f) => /pull_request_target/.test(read(root, f)));
  probes.ci_permissions = {
    status: ghWorkflows.length === 0 ? "unverified" : permissive.length === 0 && prt.length === 0 ? "partial" : "failed",
    evidence: ghWorkflows.length
      ? [
          permissive.length ? `Workflows without explicit permissions: ${permissive.join(", ")}` : "All workflows declare permissions.",
          ...(prt.length ? [`pull_request_target used in: ${prt.join(", ")} (review for untrusted code with secrets)`] : []),
        ]
      : ["No GitHub workflows to inspect; other CI systems need manual review."],
  };

  // ---------- architecture & ratchets
  const boundaryConfigs = [
    ...matching(/(^|\/)\.dependency-cruiser\.(c?js|json|mjs)$/),
    ...matching(/(^|\/)(\.importlinter|importlinter\.ini)$/),
    ...matching(/(^|\/)\.?eslintrc.*|eslint\.config\.[cm]?[jt]s$/).filter((f) => /boundaries|no-restricted-imports|import\/no-restricted-paths/.test(read(root, f))),
    ...files.filter((f) => /ArchTest|ArchUnit/.test(f)),
    ...matching(/(^|\/)(nx\.json|\.sheriff\.json|sheriff\.config\.ts|tach\.toml|deptry\.toml)$/),
  ];
  if (/\[tool\.importlinter\]/.test(pyproject)) boundaryConfigs.push("pyproject.toml [tool.importlinter]");
  facts.boundaryTooling = boundaryConfigs;
  probes.boundary_tooling = {
    status: boundaryConfigs.length ? "partial" : "failed",
    evidence: [boundaryConfigs.length ? `Boundary tooling: ${boundaryConfigs.join(", ")}` : "No module-boundary enforcement tooling detected."],
    note: "Confirm the rules are meaningful and that CI runs them.",
  };
  const baselines = matching(/(baseline|\.betterer|known[-_]violations|suppressions?)[^/]*\.(json|ya?ml|results|txt|xml)$/i);
  facts.baselines = baselines;
  probes.baselines = { status: baselines.length ? "partial" : "failed", evidence: [baselines.length ? `Baseline files: ${baselines.join(", ")}` : "No versioned violation baselines detected."] };
  const codeowners = [".github/CODEOWNERS", "CODEOWNERS", "docs/CODEOWNERS", ".gitlab/CODEOWNERS"].find(has);
  const coText = codeowners ? read(root, codeowners) : "";
  const policyCovered = /\.github|workflows|\.claude|CLAUDE\.md|baseline|eslint|dependency-cruiser/.test(coText);
  probes.codeowners = {
    status: !codeowners ? "failed" : policyCovered ? "partial" : "failed",
    evidence: [codeowners ? `${codeowners} ${policyCovered ? "covers some policy/CI paths" : "does not cover policy/CI/baseline paths"}` : "No CODEOWNERS file."],
    note: "Ownership only enforces review if branch protection requires code-owner review.",
  };

  // ---------- docs
  const adrs = matching(/(^|\/)(adr|adrs|decisions)\/.+\.md$/i);
  const archDocs = matching(/(^|\/)(ARCHITECTURE\.md|docs\/architecture[^/]*\/?.*\.md)$/i);
  facts.docs = { adrs, archDocs, markdownFiles: matching(/\.md$/).length };
  probes.architecture_docs = {
    status: archDocs.length && adrs.length ? "partial" : archDocs.length || adrs.length ? "partial" : "failed",
    evidence: [`architecture docs: ${archDocs.slice(0, 5).join(", ") || "none"}`, `ADRs: ${adrs.length}`],
  };
  const broken: string[] = [];
  for (const md of matching(/\.md$/).slice(0, 400)) {
    const text = read(root, md);
    for (const m of text.matchAll(/\]\(([^)\s#]+)(#[^)]*)?\)/g)) {
      const target = m[1]!;
      if (/^(https?:|mailto:|tel:|\/\/)/.test(target) || target.startsWith("<")) continue;
      const abs = resolve(root, dirname(md), decodeURI(target));
      if (!existsSync(abs)) broken.push(`${md} -> ${target}`);
    }
  }
  facts.brokenLinks = broken;

  // ---------- security
  const secretTools = [".gitleaks.toml", ".secrets.baseline", ".trufflehog.yml", ".github/secret_scanning.yml"].filter(has);
  const secretInCi = /(gitleaks|trufflehog|detect-secrets|secretlint|ggshield)/i.test(ciText);
  const envCommitted = files.filter((f) => /(^|\/)\.env(\.[\w-]+)?$/.test(f) && !/\.(example|sample|template)$/.test(f));
  const gitignore = read(root, ".gitignore");
  facts.security = { secretTools, secretInCi, envCommitted, envIgnored: /^\.env/m.test(gitignore) };
  probes.secret_scanning = {
    status: envCommitted.length ? "failed" : secretTools.length || secretInCi ? "partial" : "failed",
    evidence: [
      secretTools.length || secretInCi ? `Secret scanning: ${[...secretTools, secretInCi ? "CI step" : ""].filter(Boolean).join(", ")}` : "No secret scanning configured in repo or CI (GitHub-native scanning needs the API to verify).",
      ...(envCommitted.length ? [`Possible committed env files: ${envCommitted.join(", ")}`] : []),
    ],
  };
  const depScan = [".github/dependabot.yml", ".github/dependabot.yaml", "renovate.json", ".renovaterc", ".renovaterc.json", ".snyk"].filter(has);
  const depInCi = /(npm audit|pnpm audit|yarn audit|pip-audit|safety check|osv-scanner|trivy|grype|snyk|codeql|semgrep|cargo audit|govulncheck)/i.test(ciText);
  probes.dependency_scanning = {
    status: depScan.length && depInCi ? "partial" : depScan.length || depInCi ? "partial" : "failed",
    evidence: [`dependency update/scan config: ${depScan.join(", ") || "none"}`, `security scan in CI: ${depInCi}`],
  };

  // ---------- agent permissions & hooks
  const allow = settings.flatMap((s) => s?.permissions?.allow ?? []);
  const deny = settings.flatMap((s) => s?.permissions?.deny ?? []);
  const hooks = settings.flatMap((s) => Object.keys(s?.hooks ?? {}));
  facts.agentSettings = { allow, deny, hooks };
  probes.agent_settings = {
    status: settingsFiles.length === 0 ? "failed" : deny.length ? "partial" : "failed",
    evidence: [settingsFiles.length ? `${settingsFiles.join(", ")}: ${allow.length} allow, ${deny.length} deny, hooks: ${hooks.join(", ") || "none"}` : "No project .claude/settings.json."],
  };
  const policyHook = settings.some((s) => JSON.stringify(s?.hooks ?? {}).match(/PreToolUse/)) ;
  const denyPolicy = deny.some((d: string) => /\.github|workflows|baseline|CODEOWNERS|eslint|settings/.test(d));
  probes.policy_hooks = {
    status: policyHook || denyPolicy ? "partial" : "failed",
    evidence: [policyHook ? "PreToolUse hook present (confirm it guards policy files)." : "No PreToolUse hook.", denyPolicy ? "Deny rules reference policy paths." : "No deny rules protect policy/CI/baseline paths."],
  };

  // ---------- coverage & evals
  const coverageCfg = /(coverageThreshold|--coverage|coverage:|c8|nyc|pytest-cov|--cov|codecov|coveralls|jacoco)/i.test(ciText + JSON.stringify(scripts) + read(root, "vitest.config.ts") + read(root, "jest.config.js") + pyproject);
  probes.coverage = { status: coverageCfg ? "partial" : "failed", evidence: [coverageCfg ? "Coverage tooling referenced." : "No coverage tooling found."] };
  const evalFiles = matching(/(^|\/)(evals?|agent-evals?)\/.+\.(md|ya?ml|json|ts|py)$/i);
  facts.evals = evalFiles.slice(0, 50);
  probes.eval_cases = { status: evalFiles.length ? "partial" : "failed", evidence: [evalFiles.length ? `${evalFiles.length} eval files, e.g. ${evalFiles.slice(0, 3).join(", ")}` : "No agent evaluation cases found."] };

  // ---------- branch protection (external, read-only API)
  const remote = remoteUrl(root);
  const branch = defaultBranch(root);
  probes.branch_protection = { status: "unverified", evidence: ["Not checked. Re-run `agentic scan --github` with gh authenticated to verify."] };
  if (opts.github && remote && /github\.com[:/]/.test(remote) && branch) {
    const slug = remote.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
    const api = (path: string) => {
      try {
        return execFileSync("gh", ["api", path], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 20000 });
      } catch (e: any) {
        return { error: String(e.stderr || e.message).split("\n")[0] };
      }
    };
    const prot = api(`repos/${slug}/branches/${branch}/protection`);
    const rules = api(`repos/${slug}/rules/branches/${branch}`);
    facts.branchProtection = { slug, branch, protection: typeof prot === "string" ? JSON.parse(prot) : prot, rules: typeof rules === "string" ? JSON.parse(rules) : rules };
    const protOk = typeof prot === "string";
    const ruleList = typeof rules === "string" ? (JSON.parse(rules) as { type: string }[]) : [];
    const required = protOk ? JSON.parse(prot).required_status_checks?.contexts ?? [] : [];
    const rulesRequire = ruleList.some((r) => r.type === "required_status_checks");
    probes.branch_protection = {
      status: (protOk && required.length) || rulesRequire ? "passed" : protOk || ruleList.length ? "partial" : typeof prot === "object" && /404|Not Found|not protected/i.test(String(prot.error)) ? "failed" : "unverified",
      evidence: [
        protOk ? `Branch protection on ${branch}: required checks ${required.join(", ") || "none"}` : `Branch protection API: ${(prot as any).error}`,
        `Rulesets on ${branch}: ${ruleList.map((r) => r.type).join(", ") || "none"}`,
      ],
    };
  }

  const greenfield = sourceFiles.length < 30 && commits < 40;
  return {
    scannedAt: new Date().toISOString(),
    revision: headRevision(root),
    repo: { name: root.split("/").pop()!, remote, defaultBranch: branch },
    stats: { files: files.length, sourceFiles: sourceFiles.length, testFiles: testFiles.length, commits, truncated },
    suggestedMode: greenfield ? "greenfield" : "existing",
    modeReason: `${sourceFiles.length} source files, ${testFiles.length} test files, ${commits} commits (greenfield if < 30 source files and < 40 commits).`,
    facts,
    probes,
  };
}

