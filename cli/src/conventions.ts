import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { parse } from "yaml";
import { playbookRoot } from "./paths.js";

/**
 * The conventions baseline library (reference/conventions/*.yaml) and per-app
 * stack detection. Recommendations made by the conventions-advisor must refer
 * to a rule in this library, so every recommendation carries a vetted public
 * source and nothing is invented.
 */

export const SIGNALS = [
  "any", "web", "react", "next", "vue", "svelte", "angular", "server", "http-api", "db",
  "node", "typescript", "python", "go", "java", "rust", "worker", "cli", "pipeline", "library",
] as const;
export type Signal = (typeof SIGNALS)[number];

export interface LibraryRule {
  id: string;
  title: string;
  rule: string;
  why: string;
  do: string;
  dont: string;
  applies_when?: Signal[];
  enforceable: string | false;
  source: { title: string; url: string };
  domain: string;
}

export interface LibraryDomain {
  domain: string;
  title: string;
  reviewed: string;
  applies_when: Signal[];
  rules: LibraryRule[];
  file: string;
  parseError?: string;
}

export interface Library {
  domains: LibraryDomain[];
  rules: Map<string, LibraryRule>;
}

const cache = new Map<string, Library>();

export function loadLibrary(root = playbookRoot()): Library {
  const hit = cache.get(root);
  if (hit) return hit;
  const dir = join(root, "reference", "conventions");
  const domains: LibraryDomain[] = [];
  const rules = new Map<string, LibraryRule>();
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".yaml")).sort()) {
      let raw: Partial<LibraryDomain> = {};
      let parseError: string | undefined;
      try {
        raw = (parse(readFileSync(join(dir, f), "utf8")) ?? {}) as Partial<LibraryDomain>;
      } catch (e) {
        parseError = (e as Error).message.split("\n")[0];
      }
      const d: LibraryDomain = {
        domain: String(raw.domain ?? ""),
        title: String(raw.title ?? ""),
        reviewed: String(raw.reviewed ?? ""),
        applies_when: (raw.applies_when ?? []) as Signal[],
        rules: [],
        file: `reference/conventions/${f}`,
        ...(parseError ? { parseError } : {}),
      };
      for (const r of raw.rules ?? []) {
        const rule = { ...r, domain: d.domain } as LibraryRule;
        d.rules.push(rule);
        if (!rules.has(rule.id)) rules.set(rule.id, rule);
      }
      domains.push(d);
    }
  }
  const lib = { domains, rules };
  cache.set(root, lib);
  return lib;
}

/** Whole months between a YYYY-MM review date and today, or null if the date is malformed. */
export function monthsSince(reviewed: string, today = new Date()): number | null {
  const m = reviewed.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  return (today.getUTCFullYear() - Number(m[1])) * 12 + (today.getUTCMonth() + 1 - Number(m[2]));
}

/** Problems fail lint-playbook; warnings (stale review dates) are printed but do not fail. */
export function lintLibrary(root: string, today = new Date()): { problems: string[]; warnings: string[] } {
  const problems: string[] = [];
  const warnings: string[] = [];
  cache.delete(root);
  const lib = loadLibrary(root);
  if (!lib.domains.length) return { problems: ["conventions: reference/conventions has no library files"], warnings };
  const seen = new Set<string>();
  const known = new Set<string>(SIGNALS);
  for (const d of lib.domains) {
    const where = d.file;
    if (d.parseError) {
      problems.push(`conventions: ${where} is not valid YAML: ${d.parseError}`);
      continue;
    }
    if (d.domain !== basename(d.file, ".yaml")) problems.push(`conventions: ${where} domain "${d.domain}" does not match its file name`);
    if (!d.title) problems.push(`conventions: ${where} has no title`);
    const months = monthsSince(d.reviewed, today);
    if (months === null) problems.push(`conventions: ${where} reviewed must be YYYY-MM (got "${d.reviewed}")`);
    else if (months > 12) warnings.push(`conventions: ${where} was last reviewed ${d.reviewed} (${months} months ago); re-check its rules and sources`);
    if (!d.applies_when.length) problems.push(`conventions: ${where} has no applies_when`);
    for (const s of d.applies_when) if (!known.has(s)) problems.push(`conventions: ${where} uses unknown signal "${s}"`);
    if (!d.rules.length) problems.push(`conventions: ${where} has no rules`);
    for (const r of d.rules) {
      const at = `${where} ${r.id ?? "(rule without id)"}`;
      if (!/^[A-Z]+-\d{2}$/.test(String(r.id ?? ""))) problems.push(`conventions: ${at} id must look like PREFIX-NN`);
      if (seen.has(r.id)) problems.push(`conventions: duplicate rule id ${r.id}`);
      seen.add(r.id);
      for (const k of ["title", "rule", "why", "do", "dont"] as const) if (!r[k] || typeof r[k] !== "string") problems.push(`conventions: ${at} is missing "${k}"`);
      if (!r.source || typeof r.source.url !== "string" || !/^https:\/\//.test(r.source.url) || !r.source.title)
        problems.push(`conventions: ${at} needs a source with a title and an https url`);
      if (r.enforceable !== false && !(typeof r.enforceable === "string" && r.enforceable.trim()))
        problems.push(`conventions: ${at} must state enforceable: false or name the tool`);
      for (const s of r.applies_when ?? []) if (!known.has(s)) problems.push(`conventions: ${at} uses unknown signal "${s}"`);
    }
  }
  return { problems, warnings };
}

/** A rule applies when its domain applies and, if the rule narrows further, its own signals match too. */
export function ruleApplies(rule: LibraryRule, domain: LibraryDomain, signals: Set<string>): boolean {
  const match = (need: readonly string[]) => need.some((s) => s === "any" || signals.has(s));
  return match(domain.applies_when) && (!rule.applies_when?.length || match(rule.applies_when));
}

export function applicableRules(lib: Library, signals: Set<string>): LibraryRule[] {
  return lib.domains.flatMap((d) => d.rules.filter((r) => ruleApplies(r, d, signals)));
}

// ------------------------------------------------------------------ app detection

export interface AppInfo {
  root: string;
  manifests: string[];
  signals: string[];
  conventions: string[];
}

const MANIFEST = /(^|\/)(package\.json|go\.mod|pyproject\.toml|requirements\.txt|pom\.xml|build\.gradle(\.kts)?|Cargo\.toml)$/;
const IGNORED_APP_DIR = /(^|\/)(fixtures?|examples?|__tests__|tests?|e2e|docs|scripts|tools|\.claude|\.github)(\/|$)/;

const has = (deps: Set<string>, ...names: (string | RegExp)[]) =>
  names.some((n) => (typeof n === "string" ? deps.has(n) : [...deps].some((d) => n.test(d))));

function signalsFor(dir: string, manifests: string[], files: string[], read: (rel: string) => string): Set<string> {
  const s = new Set<string>(["any"]);
  for (const m of manifests) {
    const text = read(m);
    const name = basename(m);
    if (name === "package.json") {
      s.add("node");
      let pkg: Record<string, Record<string, string> | undefined> = {};
      try {
        pkg = JSON.parse(text);
      } catch {
        /* ignore */
      }
      const deps = new Set(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }));
      if (has(deps, "typescript") || files.some((f) => f === (dir === "." ? "tsconfig.json" : `${dir}/tsconfig.json`))) s.add("typescript");
      if (has(deps, "react", "react-dom") && !has(deps, "react-native")) s.add("react").add("web");
      if (has(deps, "next")) {
        s.add("next").add("react").add("web").add("server");
        // A Next.js app is an HTTP API only when it defines route handlers or API routes.
        const own = dir === "." ? "" : `${dir}/`;
        if (files.some((f) => f.startsWith(own) && /^(src\/)?(app\/(.+\/)?route\.[cm]?[jt]sx?|pages\/api\/.+)$/.test(f.slice(own.length)))) s.add("http-api");
      }
      if (has(deps, "vue", "nuxt")) s.add("vue").add("web");
      if (has(deps, "nuxt", "@sveltejs/kit", "@remix-run/node", "@remix-run/react", "astro")) s.add("server").add("http-api").add("web");
      if (has(deps, "svelte", "@sveltejs/kit")) s.add("svelte").add("web");
      if (has(deps, "@angular/core")) s.add("angular").add("web");
      if (has(deps, "solid-js", "preact", "lit")) s.add("web");
      if (has(deps, "express", "fastify", "@nestjs/core", "koa", "hono", "@hapi/hapi", "@trpc/server", "@apollo/server", "apollo-server", "restify", "elysia"))
        s.add("server").add("http-api");
      if (has(deps, "prisma", "@prisma/client", "typeorm", "drizzle-orm", "sequelize", "knex", "pg", "postgres", "mysql2", "mongoose", "mongodb", "kysely", "better-sqlite3", "@neondatabase/serverless", "@supabase/supabase-js", "@planetscale/database"))
        s.add("db");
      if (has(deps, "bullmq", "bull", "bee-queue", "agenda", "kafkajs", "amqplib", "sqs-consumer", "@aws-sdk/client-sqs", "@temporalio/worker", "graphile-worker", "pg-boss", "inngest")) s.add("worker");
      if (pkg.bin || has(deps, "commander", "yargs", "@oclif/core", "cac", "clipanion", "citty", "meow")) s.add("cli");
    } else if (name === "pyproject.toml" || name === "requirements.txt") {
      s.add("python");
      if (/\bdjango\b/i.test(text)) s.add("server").add("http-api").add("db");
      if (/\b(fastapi|flask|starlette|aiohttp|litestar|sanic)\b/i.test(text)) s.add("server").add("http-api");
      if (/\b(sqlalchemy|psycopg2?|psycopg|asyncpg|alembic|peewee|tortoise-orm|pymongo|sqlmodel)\b/i.test(text)) s.add("db");
      if (/\b(celery|rq|dramatiq|arq|faust|temporalio|kombu)\b/i.test(text)) s.add("worker");
      if (/\b(click|typer)\b/i.test(text) || /^\[project\.scripts\]/m.test(text)) s.add("cli");
      if (/\b(apache-airflow|dagster|prefect|pyspark|apache-beam|luigi|dbt-core)\b/i.test(text)) s.add("pipeline");
    } else if (name === "go.mod") {
      s.add("go");
      if (/(gin-gonic\/gin|labstack\/echo|go-chi\/chi|gorilla\/mux|gofiber\/fiber|google\.golang\.org\/grpc|connectrpc)/.test(text)) s.add("server").add("http-api");
      if (/(gorm\.io|jmoiron\/sqlx|jackc\/pgx|entgo\.io|go-sql-driver|uptrace\/bun|mongo-driver)/.test(text)) s.add("db");
      if (/(hibiken\/asynq|RichardKnop\/machinery|IBM\/sarama|Shopify\/sarama|segmentio\/kafka-go|go\.temporal\.io)/.test(text)) s.add("worker");
      if (/(spf13\/cobra|urfave\/cli)/.test(text)) s.add("cli");
    } else if (name === "pom.xml" || name.startsWith("build.gradle")) {
      s.add("java");
      if (/spring-boot|quarkus|micronaut|dropwizard|ktor/.test(text)) s.add("server").add("http-api");
      if (/(jpa|hibernate|jdbc|flyway|liquibase|jooq|mybatis)/i.test(text)) s.add("db");
      if (/(spring-kafka|spring-amqp|spring-rabbit|spring-cloud-stream|temporal-sdk)/.test(text)) s.add("worker");
    } else if (name === "Cargo.toml") {
      s.add("rust");
      if (/\b(axum|actix-web|rocket|warp|poem|tonic)\b/.test(text)) s.add("server").add("http-api");
      if (/\b(sqlx|diesel|sea-orm|tokio-postgres|mongodb)\b/.test(text)) s.add("db");
      if (/^\s*(lapin|rdkafka|apalis)\s*=/m.test(text)) s.add("worker");
      if (/^\s*clap\s*=/m.test(text) || /^\[\[bin\]\]/m.test(text)) s.add("cli");
    }
  }
  const prefix = dir === "." ? "" : `${dir}/`;
  if (files.some((f) => f.startsWith(prefix) && /(^|\/)(migrations|migrate|alembic)\//.test(f.slice(prefix.length)))) s.add("db");
  if (files.includes(`${prefix}dbt_project.yml`)) s.add("pipeline");
  // An app that is none of the deployable kinds is treated as a library.
  if (manifests.length && !["web", "http-api", "worker", "cli", "pipeline"].some((k) => s.has(k))) s.add("library");
  return s;
}

/** Static prefix of a glob, e.g. "apps/web/**" -> "apps/web/", "**\/*.tsx" -> "". */
function globPrefix(glob: string): string {
  const g = glob.replace(/^\.\//, "");
  const i = g.search(/[*?[{]/);
  const p = i < 0 ? g : g.slice(0, i);
  return p.includes("/") ? p.slice(0, p.lastIndexOf("/") + 1) : i < 0 ? `${p}/` : "";
}

export function frontmatterPaths(text: string): string[] | null {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  try {
    const fm = parse(m[1]!) as { paths?: string | string[]; globs?: string | string[] } | null;
    const p = fm?.paths ?? fm?.globs;
    if (!p) return null;
    return (Array.isArray(p) ? p : String(p).split(",")).map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * Find deployable app roots and the conventions sources that load for each.
 * Heuristic: confirms nothing about content quality; the auditors judge that.
 */
export function detectApps(files: string[], read: (rel: string) => string): AppInfo[] {
  const manifests = files.filter((f) => MANIFEST.test(f) && !IGNORED_APP_DIR.test(dirname(f)));
  const byDir = new Map<string, string[]>();
  for (const m of manifests) {
    const d = dirname(m);
    byDir.set(d, [...(byDir.get(d) ?? []), m]);
  }
  const nested = [...byDir.keys()].filter((d) => d !== ".").sort();
  // keep the shallowest manifest directory on each branch
  const roots = nested.filter((d) => !nested.some((o) => o !== d && d.startsWith(`${o}/`)));
  const rootPkg = (() => {
    try {
      return JSON.parse(read("package.json") || "{}");
    } catch {
      return {};
    }
  })();
  const workspaceRoot = !!rootPkg.workspaces || ["pnpm-workspace.yaml", "lerna.json", "nx.json", "turbo.json", "go.work", "rush.json"].some((f) => files.includes(f));
  const appRoots = roots.length === 0 || !workspaceRoot ? [".", ...roots] : roots;
  if (!byDir.has(".") && roots.length > 0 && appRoots[0] === ".") appRoots.shift();

  // conventions sources
  const ruleFiles = files.filter((f) => /(^|\/)\.claude\/rules\/.+\.md$/.test(f));
  const nestedGuides = files.filter((f) => /(^|\/)(CLAUDE|AGENTS)\.md$/.test(f) && f.includes("/") && !f.startsWith(".claude/"));
  const convFiles = files.filter((f) => /(^|\/)CONVENTIONS\.md$/i.test(f));
  const convDocs = files.filter((f) => /(^|\/)docs\/conventions\/.+\.md$/i.test(f));
  // In a single-app repository the root guide loads exactly where an unscoped rules file would,
  // so it can be the conventions home. Whether it holds judgment rules is the auditor's call (CTX-12).
  const rootGuides = appRoots.length === 1 ? files.filter((f) => /^(CLAUDE|AGENTS)\.md$|^\.claude\/CLAUDE\.md$/.test(f)) : [];

  return appRoots.map((root) => {
    const own = root === "." ? (byDir.get(".") ?? []) : (byDir.get(root) ?? []);
    const covered = new Set<string>();
    const under = (f: string) => root !== "." && f.startsWith(`${root}/`);
    for (const f of ruleFiles) {
      if (under(f)) {
        covered.add(f);
        continue;
      }
      if (!f.startsWith(".claude/")) continue;
      const paths = frontmatterPaths(read(f));
      if (!paths) {
        if (root === "." || appRoots.length === 1) covered.add(f);
        continue;
      }
      for (const p of paths) {
        const pre = globPrefix(p);
        if (pre === "" || root === "." || pre.startsWith(`${root}/`) || `${root}/`.startsWith(pre)) {
          covered.add(f);
          break;
        }
      }
    }
    for (const f of nestedGuides) {
      const d = dirname(f).replace(/\/\.claude$/, "");
      if (d === root) covered.add(f);
    }
    if (root === ".") for (const f of rootGuides) covered.add(f);
    for (const f of convFiles) {
      const d = dirname(f);
      if (d === root || (d === "." && (root === "." || appRoots.length === 1))) covered.add(f);
    }
    for (const f of convDocs) {
      const name = basename(f, ".md").toLowerCase();
      const slug = root.replace(/\//g, "-").toLowerCase();
      if (name === basename(root).toLowerCase() || name === slug || (["readme", "index"].includes(name) && (root === "." || appRoots.length === 1))) covered.add(f);
    }
    return {
      root,
      manifests: own,
      signals: [...signalsFor(root, own, files, read)].sort(),
      conventions: [...covered].sort(),
    };
  });
}
