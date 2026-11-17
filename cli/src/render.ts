import { loadLibrary } from "./conventions.js";
import { computeScore } from "./score.js";
import { loadRubric } from "./rubric.js";
import type { AppStrictness, SuppressionReport } from "./strictness.js";
import { loadTesting, type AppTesting } from "./testing.js";
import { loadDocs, type DocsScan } from "./docs.js";
import { loadMaintenance, type MaintenanceScan } from "./maintenance.js";
import type { AssessmentRecord } from "./types.js";

/**
 * Self-contained, read-only Artifact view of the record. All data is embedded;
 * the page never fetches. Changes happen through Claude Code commands and a
 * republish, so the header always states which record revision it shows.
 */
export interface StrictnessSnapshot {
  scannedAt: string;
  revision: string | null;
  apps: AppStrictness[];
  suppressions: SuppressionReport;
  testing?: AppTesting[];
  docs?: DocsScan | null;
  maintenance?: MaintenanceScan | null;
}

export function renderHtml(record: AssessmentRecord, opts: { headRevision: string | null; commitsBehind: number | null; strictness?: StrictnessSnapshot | null }): string {
  const rubric = loadRubric();
  const payload = {
    record,
    score: computeScore(record),
    rubric: { levels: rubric.levels, dimensions: rubric.dimensions, criteria: rubric.criteria, priorities: rubric.priorities },
    library: Object.fromEntries(
      [...new Set(record.conventions.map((c) => c.rule))].flatMap((id) => {
        const r = loadLibrary().rules.get(id);
        return r ? [[id, { title: r.title, rule: r.rule, why: r.why, do: r.do, dont: r.dont, domain: r.domain, enforceable: r.enforceable, source: r.source }]] : [];
      }),
    ),
    strictness: opts.strictness ? { ...opts.strictness, testing: undefined, docs: undefined, maintenance: undefined } : null,
    testingScan: opts.strictness?.testing ?? [],
    testingLayers: Object.fromEntries(
      [...loadTesting().layers.values()].map((l) => [l.id, { layer: l.layer, title: l.title, tier: l.tier, kind: l.kind, source: l.source }]),
    ),
    docsScan: opts.strictness?.docs ?? null,
    docItems: Object.fromEntries(
      [...loadDocs().items.values()].map((i) => [i.id, { artifact: i.artifact, title: i.title, tier: i.tier, area: i.area, home: i.home, load: i.load, authority: i.authority, source: i.source }]),
    ),
    maintenanceScan: opts.strictness?.maintenance ?? null,
    janitors: Object.fromEntries(
      [...loadMaintenance().items.values()].map((j) => [j.id, { title: j.title, tier: j.tier, when: j.when, trigger: j.trigger, guards: j.guards, prerequisites: j.prerequisites, purpose: j.purpose, detector: j.detector, autofix: j.autofix, needs_human: j.needs_human, noise_controls: j.noise_controls, success: j.success, source: j.source }]),
    ),
    renderedAt: new Date().toISOString(),
    headRevision: opts.headRevision,
    commitsBehind: opts.commitsBehind,
  };
  const json = JSON.stringify(payload).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const title = `${record.repo.name} Readiness`.replace(/[<>&"]/g, "");
  return TEMPLATE.replace("__TITLE__", () => title).replace("__DATA__", () => json);
}

const TEMPLATE = String.raw`<title>__TITLE__</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap">
<style>
/* Layout: an instrument panel. Score and readiness ladder up top, then tabbed detail views (criteria, findings, conventions, roadmap, evidence). */
:root {
  --bg: #f5f6f8; --surface: #ffffff; --sunk: #eceef3; --line: #d9dde6;
  --fg: #161a23; --muted: #5b6273; --accent: #2f4bd6; --accent-soft: #e3e8fd;
  --ok: #1d7a4a; --ok-soft: #dcf1e5; --warn: #a3620a; --warn-soft: #fbecd2; --bad: #b42335; --bad-soft: #f9dde1; --idle: #737a8c; --idle-soft: #e6e8ee;
  --display: "Instrument Sans", "Helvetica Neue", Arial, sans-serif;
  --body: "Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg: #10131a; --surface: #171b24; --sunk: #1d2230; --line: #2b3242;
  --fg: #e7e9ef; --muted: #9aa2b5; --accent: #8a9dff; --accent-soft: #232c52;
  --ok: #5fcf91; --ok-soft: #173826; --warn: #f0b45a; --warn-soft: #3a2b13; --bad: #ff8593; --bad-soft: #43202a; --idle: #8c93a5; --idle-soft: #252a37;
  color-scheme: dark; } }
:root[data-theme="dark"] {
  --bg: #10131a; --surface: #171b24; --sunk: #1d2230; --line: #2b3242;
  --fg: #e7e9ef; --muted: #9aa2b5; --accent: #8a9dff; --accent-soft: #232c52;
  --ok: #5fcf91; --ok-soft: #173826; --warn: #f0b45a; --warn-soft: #3a2b13; --bad: #ff8593; --bad-soft: #43202a; --idle: #8c93a5; --idle-soft: #252a37;
  color-scheme: dark; }
* { box-sizing: border-box; }
body { background: var(--bg); color: var(--fg); font: 15px/1.5 var(--body); }
.wrap { max-width: 1120px; margin: 0 auto; padding-block: 28px 64px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); display: grid; gap: 24px; }
h1, h2, h3 { font-family: var(--display); text-wrap: balance; margin: 0; }
h1 { font-size: 1.75rem; font-weight: 700; letter-spacing: -0.01em; }
h2 { font-size: 1.1rem; font-weight: 600; }
h3 { font-size: 0.98rem; font-weight: 600; }
.mono, code { font-family: var(--mono); font-size: 0.82em; }
.muted { color: var(--muted); }
.label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; }
.num { font-variant-numeric: tabular-nums; }
header.top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: end; gap: 12px 24px; }
.meta { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 0.82rem; color: var(--muted); }
.banner { border: 1px solid var(--warn); background: var(--warn-soft); color: var(--fg); padding: 10px 14px; border-radius: 8px; font-size: 0.9rem; }
.panel { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 20px; min-width: 0; }
.hero { display: grid; grid-template-columns: minmax(0, 260px) minmax(0, 1fr); gap: 20px; }
@media (max-width: 760px) { .hero { grid-template-columns: minmax(0, 1fr); } }
.scorebox { display: grid; gap: 14px; align-content: start; }
.big { font-family: var(--display); font-size: 3.4rem; font-weight: 700; line-height: 1; letter-spacing: -0.03em; }
.big small { font-size: 1.1rem; color: var(--muted); font-weight: 500; letter-spacing: 0; }
.ladder { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
@media (max-width: 520px) { .ladder { grid-template-columns: minmax(0, 1fr); } }
.rung { border: 1px solid var(--line); border-radius: 8px; padding: 10px; background: var(--sunk); display: grid; gap: 2px; align-content: start; }
.rung.done { background: var(--accent-soft); border-color: var(--accent); }
.rung.current { outline: 2px solid var(--accent); outline-offset: 1px; }
.rung b { font-family: var(--mono); font-size: 0.78rem; color: var(--accent); }
.rung span { font-weight: 600; font-size: 0.9rem; }
.rung p { margin: 0; font-size: 0.78rem; color: var(--muted); }
.grid2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
@media (max-width: 760px) { .grid2 { grid-template-columns: minmax(0, 1fr); } }
.dims { display: grid; gap: 10px; }
.dim { display: grid; grid-template-columns: minmax(0, 1fr) 48px; gap: 4px 10px; align-items: center; }
.bar { grid-column: 1 / -1; height: 6px; background: var(--sunk); border-radius: 3px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--accent); border-radius: 3px; }
.pill { display: inline-flex; align-items: center; gap: 5px; padding: 1px 8px; border-radius: 999px; font-size: 0.74rem; font-weight: 600; white-space: nowrap; background: var(--idle-soft); color: var(--idle); }
.pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.s-passed, .s-completed, .s-pass { background: var(--ok-soft); color: var(--ok); }
.s-partial, .s-in_progress, .s-verification_required { background: var(--warn-soft); color: var(--warn); }
.s-failed, .s-blocked, .s-fail { background: var(--bad-soft); color: var(--bad); }
.s-P0 { background: var(--bad-soft); color: var(--bad); }
.s-P1 { background: var(--warn-soft); color: var(--warn); }
.s-P2 { background: var(--idle-soft); color: var(--idle); }
.s-verified, .s-followed { background: var(--accent-soft); color: var(--accent); }
.s-documented { background: var(--ok-soft); color: var(--ok); }
.s-contradicted { background: var(--bad-soft); color: var(--bad); }
.s-absent, .s-wrong-layer { background: var(--warn-soft); color: var(--warn); }
.s-present, .s-covered { background: var(--ok-soft); color: var(--ok); }
.s-uncovered { background: var(--bad-soft); color: var(--bad); }
.s-misplaced, .s-relocate, .s-consolidate, .s-investigate { background: var(--warn-soft); color: var(--warn); }
.s-create, .s-generate { background: var(--accent-soft); color: var(--accent); }
.s-retain, .s-reachable { background: var(--ok-soft); color: var(--ok); }
.s-unreachable { background: var(--bad-soft); color: var(--bad); }
.s-now { background: var(--accent-soft); color: var(--accent); }
.s-after-prerequisites { background: var(--warn-soft); color: var(--warn); }
.promote { font-family: var(--mono); font-size: 0.74rem; color: var(--accent); white-space: nowrap; }
.legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.82rem; color: var(--muted); }
nav.tabs { display: flex; flex-wrap: wrap; gap: 4px; border-bottom: 1px solid var(--line); }
nav.tabs a { padding: 8px 14px; color: var(--muted); text-decoration: none; font-weight: 600; font-size: 0.9rem; border-bottom: 2px solid transparent; margin-bottom: -1px; }
nav.tabs a[aria-current="page"] { color: var(--fg); border-color: var(--accent); }
nav.tabs a:focus-visible, button:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.list { display: grid; gap: 10px; }
.item { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; display: grid; gap: 8px; min-width: 0; }
.item.att { border-left: 3px solid var(--bad); }
.row { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; }
.row .grow { flex: 1 1 240px; min-width: 0; }
.item p { margin: 0; }
.kv { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 14px; font-size: 0.88rem; }
.kv dt { color: var(--muted); }
.kv dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
ul.ev { margin: 0; padding-left: 18px; font-size: 0.86rem; overflow-wrap: anywhere; }
details > summary { cursor: pointer; color: var(--muted); font-size: 0.86rem; }
.board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
@media (max-width: 900px) { .board { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 520px) { .board { grid-template-columns: minmax(0, 1fr); } }
.col { background: var(--sunk); border-radius: 10px; padding: 10px; display: grid; gap: 8px; align-content: start; min-width: 0; }
.card { background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; display: grid; gap: 6px; font-size: 0.88rem; min-width: 0; }
.filters { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
select { font: inherit; font-size: 0.86rem; padding: 4px 8px; border-radius: 6px; border: 1px solid var(--line); background: var(--surface); color: var(--fg); }
.table { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
svg text { fill: var(--muted); font: 11px var(--mono); }
.empty { color: var(--muted); padding: 18px; text-align: center; border: 1px dashed var(--line); border-radius: 10px; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 10px; }
.stat { background: var(--sunk); border-radius: 8px; padding: 10px 12px; }
.stat b { display: block; font-family: var(--display); font-size: 1.4rem; }
@media (prefers-reduced-motion: no-preference) { .bar i { transition: width .4s ease; } }
</style>

<div class="wrap" id="app"></div>
<script id="data" type="application/json">__DATA__</script>
<script>
(function () {
  var D = JSON.parse(document.getElementById("data").textContent);
  var R = D.record, S = D.score, RB = D.rubric;
  var crit = {}; RB.criteria.forEach(function (c) { crit[c.id] = c; });
  var state = {}; R.criteria.forEach(function (c) { state[c.id] = c; });
  var dimName = {}; RB.dimensions.forEach(function (d) { dimName[d.id] = d.name; });
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var pill = function (s, text) { return '<span class="pill s-' + esc(s) + '">' + esc(text || String(s).replace(/_/g, " ")) + "</span>"; };
  var short = function (sha) { return sha ? String(sha).slice(0, 7) : "none"; };
  var when = function (iso) { try { return new Date(iso).toLocaleString(); } catch (e) { return iso; } };
  var app = document.getElementById("app");
  var filters = { status: "all", milestone: "all", dimension: "all", kind: "all" };

  function header() {
    var stale = [];
    if (D.commitsBehind) stale.push("HEAD is " + D.commitsBehind + " commit" + (D.commitsBehind === 1 ? "" : "s") + " ahead of the assessed revision. Run /agentic:reassess to refresh the score.");
    return '<header class="top"><div><div class="label">Agentic readiness</div><h1>' + esc(R.repo.name) + '</h1></div>' +
      '<div class="meta"><span>Mode <b>' + esc(R.mode) + '</b></span><span>Assessed at <code>' + short(R.assessedRevision) + '</code></span>' +
      '<span>Record rev <b class="num">' + R.recordRevision + '</b></span><span>Rendered ' + esc(when(D.renderedAt)) + '</span></div></header>' +
      (stale.length ? '<div class="banner">' + stale.map(esc).join("<br>") + "</div>" : "");
  }

  function sparkline() {
    var h = R.scoreHistory.slice(-24);
    if (h.length < 2) return '<p class="muted" style="margin:0;font-size:.86rem">Score history appears after the next rescore.</p>';
    var W = 320, H = 90, pl = 30, pr = 10, pt = 10, pb = 20;
    var x = function (i) { return pl + (i * (W - pl - pr)) / (h.length - 1); };
    var y = function (v) { return pt + (1 - v / 100) * (H - pt - pb); };
    var pts = h.map(function (e, i) { return x(i).toFixed(1) + "," + y(e.score).toFixed(1); });
    var area = "M" + x(0) + "," + y(0) + " L" + pts.join(" L") + " L" + x(h.length - 1) + "," + y(0) + " Z";
    var last = h[h.length - 1];
    var grid = [0, 50, 100].map(function (v) { return '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--line)" stroke-width="1"/><text x="' + (pl - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + "</text>"; }).join("");
    return '<svg viewBox="0 0 ' + W + " " + H + '" width="100%" role="img" aria-label="Score history">' + grid +
      '<path d="' + area + '" fill="var(--accent-soft)" stroke="none"/><polyline points="' + pts.join(" ") + '" fill="none" stroke="var(--accent)" stroke-width="2"/>' +
      '<circle cx="' + x(h.length - 1) + '" cy="' + y(last.score) + '" r="3.5" fill="var(--accent)"/>' +
      '<text x="' + pl + '" y="' + (H - 4) + '">' + esc(String(h[0].at).slice(0, 10)) + '</text><text x="' + (W - pr) + '" y="' + (H - 4) + '" text-anchor="end">' + esc(String(last.at).slice(0, 10)) + "</text></svg>";
  }

  function overview() {
    var achieved = Number(S.level.slice(1));
    var ladder = RB.levels.map(function (l, i) {
      return '<div class="rung' + (i <= achieved ? " done" : "") + (i === achieved ? " current" : "") + '"><b>' + esc(l.id) + "</b><span>" + esc(l.name) + "</span><p>" + esc(l.summary) + "</p></div>";
    }).join("");
    var dims = S.dimensions.map(function (d) {
      return '<div class="dim"><span>' + esc(d.name) + ' <span class="muted" style="font-size:.8rem">' + d.passed + "/" + d.applicable + ' passed</span></span><b class="num" style="text-align:right">' + (d.score == null ? "n/a" : d.score) + '</b><div class="bar"><i style="width:' + (d.score || 0) + '%"></i></div></div>';
    }).join("");
    var tasks = R.tasks;
    var count = function (s) { return tasks.filter(function (t) { return t.status === s; }).length; };
    var openP0 = R.findings.filter(function (f) { return f.priority === "P0" && !f.resolved && f.kind !== "deferred"; }).length;
    var blockers = S.nextLevel ? S.nextLevel.blocking.map(function (b) {
      return '<li><code>' + esc(b.id) + "</code> " + esc(b.title) + " " + pill(b.status) + "</li>";
    }).join("") : "";
    return '<section class="hero"><div class="panel scorebox"><div class="label">Readiness score</div><div class="big num">' + S.score + '<small> / 100</small></div>' +
      '<div class="row">' + pill("verified", S.level + " " + S.levelName) + '<span class="muted" style="font-size:.84rem">Confidence ' + S.confidence + "%</span></div>" +
      sparkline() + '</div><div class="panel" style="display:grid;gap:14px"><div class="label">Readiness ladder</div><div class="ladder">' + ladder + "</div>" +
      (S.nextLevel ? '<div><h3>To reach ' + esc(S.nextLevel.level + " " + S.nextLevel.name) + '</h3><ul class="ev" style="margin-top:6px">' + blockers + "</ul></div>" : '<p class="muted">Every gated criterion is passed.</p>') +
      '</div></section><section class="grid2"><div class="panel" style="display:grid;gap:14px"><h2>By dimension</h2><div class="dims">' + dims + '</div></div>' +
      '<div class="panel" style="display:grid;gap:14px"><h2>Work</h2><div class="stats">' +
      [["Tasks", tasks.length], ["In progress", count("in_progress")], ["Awaiting verification", count("verification_required")], ["Blocked", count("blocked")], ["Completed", count("completed")], ["Open P0 findings", openP0]]
        .map(function (s) { return '<div class="stat"><span class="label">' + s[0] + '</span><b class="num">' + s[1] + "</b></div>"; }).join("") +
      "</div>" + milestoneSummary() + "</div></section>";
  }

  function milestoneSummary() {
    if (!R.milestones.length) return '<p class="muted" style="margin:0">No milestones yet. Run /agentic:plan to build the roadmap.</p>';
    return '<div class="list">' + R.milestones.map(function (m) {
      var ts = R.tasks.filter(function (t) { return t.milestoneId === m.id; });
      var done = ts.filter(function (t) { return t.status === "completed"; }).length;
      var pct = ts.length ? Math.round((done / ts.length) * 100) : 0;
      return '<div class="dim"><span><code>' + esc(m.id) + "</code> " + esc(m.title) + " " + pill(m.status) + '</span><b class="num" style="text-align:right">' + done + "/" + ts.length + '</b><div class="bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join("") + "</div>";
  }

  function criteriaView() {
    var dims = RB.dimensions.map(function (d) {
      var rows = RB.criteria.filter(function (c) { return c.dimension === d.id; }).map(function (c) {
        var s = state[c.id] || { status: "unverified", evidence: [] };
        var detail = s.evidence.length ? '<ul class="ev">' + s.evidence.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>" : "";
        var why = s.reason || s.trigger || "";
        return "<tr><td><code>" + esc(c.id) + "</code></td><td>" + esc(c.title) + (why ? '<div class="muted" style="font-size:.8rem">' + esc(why) + "</div>" : "") +
          (detail ? "<details><summary>Evidence</summary>" + detail + "</details>" : "") + "</td><td>" + pill(c.priority) + "</td><td>" + esc(c.gate || "") + "</td><td>" + pill(s.status) + "</td></tr>";
      }).join("");
      return '<div class="panel" style="display:grid;gap:10px"><h2>' + esc(d.name) + '</h2><div class="table"><table><thead><tr><th>ID</th><th>Criterion</th><th>Priority</th><th>Gate</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
    }).join("");
    return dims + strictnessPanel();
  }

  function strictnessPanel() {
    var ST = D.strictness;
    if (!ST || !ST.apps || !ST.apps.length) return "";
    var sup = (ST.suppressions && ST.suppressions.byApp) || {};
    var apps = ST.apps.map(function (a) {
      var shown = a.checks.filter(function (c) { return c.tier < 3 || c.status === "on"; });
      var t1 = a.checks.filter(function (c) { return c.tier === 1; });
      var on1 = t1.filter(function (c) { return c.status === "on"; }).length;
      var rows = shown.map(function (c) {
        var st = c.status === "on" ? pill("passed", "on") : c.tier === 1 ? pill("failed", "off") : pill("deferred", "not yet");
        return "<tr><td><code>" + esc(c.id) + "</code></td><td>" + esc(c.title) + (c.evidence ? '<div class="muted" style="font-size:.8rem">' + esc(c.evidence) + "</div>" : "") + '</td><td class="num">' + esc(c.tier) + "</td><td>" + st + "</td></tr>";
      }).join("");
      var kinds = sup[a.root] || {};
      var supLine = Object.keys(kinds).map(function (k) { return esc(kinds[k].total) + " " + esc(k) + (kinds[k].undescribed ? " (" + esc(kinds[k].undescribed) + " without reason)" : ""); }).join(", ") || "none found";
      return '<div style="display:grid;gap:6px"><h3 style="margin:0;font-size:1rem"><code>' + esc(a.root) + '</code> <span class="muted" style="font-weight:500;font-size:.85rem">Tier 1: ' + on1 + "/" + t1.length + ' on</span></h3>' +
        '<div class="muted" style="font-size:.84rem">Inline suppressions: ' + supLine + "</div>" +
        '<div class="table"><table><thead><tr><th>Check</th><th>Title</th><th>Tier</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
    }).join("");
    return '<div class="panel" style="display:grid;gap:14px"><h2>Strictness profile</h2><p class="muted" style="margin:0;font-size:.84rem">From the scan of ' + esc(short(ST.revision)) + " at " + esc(when(ST.scannedAt)) +
      ". Tier 1 is always worth it; Tier 2 when the repository needs it; Tier 3 only after a recurring defect. Config presence only: the auditor confirms CI enforcement.</p>" + apps + "</div>";
  }

  function sel(key, opts) {
    return '<select id="f-' + key + '" data-f="' + key + '"><option value="all">All ' + key + "s</option>" + opts.map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (filters[key] === o[0] ? " selected" : "") + ">" + esc(o[1]) + "</option>";
    }).join("") + "</select>";
  }

  function findingsView() {
    var fs = R.findings.filter(function (f) { return (filters.dimension === "all" || f.dimension === filters.dimension) && (filters.kind === "all" || f.kind === filters.kind); });
    var order = { P0: 0, P1: 1, P2: 2 };
    fs.sort(function (a, b) { return order[a.priority] - order[b.priority] || a.id.localeCompare(b.id); });
    var bar = '<div class="filters">' + sel("dimension", RB.dimensions.map(function (d) { return [d.id, d.name]; })) +
      sel("kind", ["verified", "inferred", "recommendation", "unknown", "deferred"].map(function (k) { return [k, k]; })) + '<span class="muted" style="font-size:.84rem">' + fs.length + " shown</span></div>";
    if (!R.findings.length) return bar + '<div class="empty">No findings yet. Run /agentic:assess.</div>';
    return bar + '<div class="list">' + fs.map(function (f) {
      return '<article class="item' + (f.priority === "P0" && !f.resolved ? " att" : "") + '"><div class="row"><code>' + esc(f.id) + '</code><h3 class="grow">' + esc(f.title) + "</h3>" + pill(f.priority) + pill(f.kind === "verified" ? "verified" : "idle", f.kind) + (f.resolved ? pill("completed", "resolved") : "") + "</div>" +
        (f.description ? "<p>" + esc(f.description) + "</p>" : "") +
        '<dl class="kv"><dt>Dimension</dt><dd>' + esc(dimName[f.dimension]) + "</dd><dt>Current</dt><dd>" + esc(f.currentState) + "</dd><dt>Desired</dt><dd>" + esc(f.desiredState) + "</dd><dt>Remediation</dt><dd>" + esc(f.remediation) + "</dd>" +
        (f.criterionIds.length ? "<dt>Criteria</dt><dd><code>" + f.criterionIds.map(esc).join(", ") + "</code></dd>" : "") +
        (f.taskIds.length ? "<dt>Tasks</dt><dd><code>" + f.taskIds.map(esc).join(", ") + "</code></dd>" : "") +
        (f.reason ? "<dt>Reason</dt><dd>" + esc(f.reason) + "</dd>" : "") + "</dl>" +
        (f.evidence.length ? '<details><summary>Evidence (' + f.evidence.length + ')</summary><ul class="ev">' + f.evidence.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul></details>" : "") + "</article>";
    }).join("") + "</div>";
  }

  function conventionsView() {
    var CV = R.conventions || [], L = D.library || {};
    if (!CV.length) return '<div class="empty">No conventions review yet. Run /agentic:conventions (it also runs at the end of /agentic:assess).</div>';
    var safeUrl = function (u) { return /^https:\/\//.test(String(u)) ? esc(u) : "#"; };
    var order = { contradicted: 0, absent: 1, followed: 2, documented: 3, n_a: 4 };
    var scopes = [];
    CV.forEach(function (c) { if (scopes.indexOf(c.scope) < 0) scopes.push(c.scope); });
    var legend = '<div class="legend">' + pill("documented") + " stated in the app's conventions and followed" + pill("followed") + " followed in code, not written down" +
      pill("contradicted") + " the code does the opposite" + pill("absent") + " neither stated nor practised" + '<span class="promote">→ lint</span> a tool could enforce it</div>';
    return legend + scopes.map(function (scope) {
      var rows = CV.filter(function (c) { return c.scope === scope; }).sort(function (a, b) { return order[a.status] - order[b.status] || a.rule.localeCompare(b.rule); });
      var counts = {}; rows.forEach(function (c) { counts[c.status] = (counts[c.status] || 0) + 1; });
      var body = rows.map(function (c) {
        var r = L[c.rule] || { title: c.rule, source: {} };
        var srcs = '<a href="' + safeUrl(r.source.url) + '" target="_blank" rel="noopener noreferrer">' + esc(r.source.title || "source") + "</a>" +
          (c.extraSources || []).map(function (u) { return ' · <a href="' + safeUrl(u) + '" target="_blank" rel="noopener noreferrer">' + esc(u.replace(/^https:\/\//, "").slice(0, 48)) + "</a>"; }).join("");
        var detail = "<details><summary>Rule, evidence and source</summary>" +
          '<dl class="kv"><dt>Rule</dt><dd>' + esc(r.rule) + "</dd><dt>Why</dt><dd>" + esc(r.why) + "</dd><dt>Do</dt><dd><code>" + esc(r.do) + "</code></dd><dt>Don't</dt><dd><code>" + esc(r.dont) + "</code></dd>" +
          (c.reason ? "<dt>Reason</dt><dd>" + esc(c.reason) + "</dd>" : "") + (c.notes ? "<dt>Notes</dt><dd>" + esc(c.notes) + "</dd>" : "") + "<dt>Source</dt><dd>" + srcs + "</dd></dl>" +
          (c.evidence.length ? '<ul class="ev">' + c.evidence.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>" : "") + "</details>";
        return "<tr><td><code>" + esc(c.rule) + "</code></td><td>" + esc(r.title) + (c.promoteTo ? ' <span class="promote">→ ' + esc(c.promoteTo) + "</span>" : "") + detail + "</td><td>" + esc(r.domain || "") + "</td><td>" + pill(c.status) + "</td><td>" + esc(c.decision || "proposed") + "</td></tr>";
      }).join("");
      return '<div class="panel" style="display:grid;gap:10px"><div class="row"><h2 class="grow"><code>' + esc(scope) + "</code></h2>" +
        ["contradicted", "absent", "followed", "documented"].filter(function (k) { return counts[k]; }).map(function (k) { return pill(k, counts[k] + " " + k); }).join("") +
        '</div><div class="table"><table><thead><tr><th>Rule</th><th>Convention</th><th>Domain</th><th>Status</th><th>Decision</th></tr></thead><tbody>' + body + "</tbody></table></div></div>";
    }).join("");
  }

  function testingView() {
    var TS = R.testing || [], SC = D.testingScan || [], TL = D.testingLayers || {};
    var roots = [];
    TS.forEach(function (t) { if (roots.indexOf(t.scope) < 0) roots.push(t.scope); });
    SC.forEach(function (a) { if (roots.indexOf(a.root) < 0) roots.push(a.root); });
    if (!roots.length) return '<div class="empty">No testing assessment yet. Run /agentic:testing (it also runs inside /agentic:assess).</div>';
    var safeUrl = function (u) { return /^https:\/\//.test(String(u)) ? esc(u) : "#"; };
    var gaps = R.findings.filter(function (f) { return !f.resolved && f.criterionIds.some(function (c) { return c === "VER-11" || c === "VER-12"; }); });
    var legend = '<div class="legend">Layers come from the sourced testing profiles. Tier 1 is expected for the app\'s kind; Tier 2 only when its trigger holds; Tier 3 only after a recurring defect. Coverage is judged on changed code, never as a global target.</div>';
    return legend + roots.map(function (root) {
      var t = TS.filter(function (x) { return x.scope === root; })[0];
      var sc = SC.filter(function (x) { return x.root === root; })[0];
      var judged = {}; (t ? t.layers : []).forEach(function (l) { judged[l.id] = l; });
      var layerIds = (sc ? sc.layers.map(function (l) { return l.id; }) : []);
      Object.keys(judged).forEach(function (id) { if (layerIds.indexOf(id) < 0) layerIds.push(id); });
      var rows = layerIds.map(function (id) {
        var meta = TL[id] || { layer: id, title: id, tier: "", source: {} };
        var j = judged[id], d = sc ? sc.layers.filter(function (l) { return l.id === id; })[0] : null;
        var status = j ? j.status : d ? d.status : "absent";
        if (!j && status === "absent" && meta.tier !== 1) return "";
        var ev = j ? j.evidence.concat(j.reason ? [j.reason] : []) : d ? d.examples : [];
        var basis = j ? "auditor" : "scan";
        return "<tr><td><code>" + esc(id) + "</code></td><td>" + esc(meta.layer) + '<div class="muted" style="font-size:.8rem">' + esc(meta.title) + ' · <a href="' + safeUrl(meta.source && meta.source.url) + '" target="_blank" rel="noopener noreferrer">' + esc((meta.source && meta.source.title) || "source") + "</a></div>" +
          (ev.length ? '<details><summary>Evidence (' + basis + ")</summary><ul class=\"ev\">" + ev.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul></details>" : "") +
          '</td><td class="num">' + esc(meta.tier) + '</td><td class="num">' + (d ? esc(d.count) : "") + "</td><td>" + pill(status) + "</td></tr>";
      }).join("");
      var cp = t ? t.criticalPaths : null;
      var candidates = sc ? sc.criticalCandidates : [];
      var cpLine = cp ? "<strong>" + esc(cp.covered) + " of " + esc(cp.total) + "</strong> critical paths covered at the right layer (auditor)" :
        candidates.length ? esc(candidates.filter(function (c) { return c.referencedBy.length; }).length) + " of " + esc(candidates.length) + " critical-path candidates mentioned by a test (scan hint, not yet judged)" : "No critical-path candidates found";
      var uncovered = cp ? cp.uncovered : candidates.filter(function (c) { return !c.referencedBy.length; }).map(function (c) { return c.file + " (" + c.name + ")"; });
      var meta = [
        "<dt>Kind</dt><dd>" + esc((t ? t.kinds : sc ? sc.kinds : []).join(", ") || "unknown") + "</dd>",
        "<dt>Strategy</dt><dd>" + (t ? (t.strategy.documented ? pill("documented", "stated") + " " + esc(t.strategy.path || "") : pill("absent", "not stated")) + (t.strategy.summary ? '<div class="muted" style="font-size:.84rem">' + esc(t.strategy.summary) + "</div>" : "") : '<span class="muted">not yet judged</span>') + "</dd>",
        sc ? "<dt>Volume</dt><dd>" + esc(sc.testFiles) + " test files, " + esc(sc.sourceFiles) + " source files" + (sc.runners.length ? " · " + esc(sc.runners.join(", ")) : "") + "</dd>" : "",
        "<dt>Coverage</dt><dd>" + esc((t && t.coverage) || (sc && sc.coverage.join("; ")) || "none found") + "</dd>",
        sc && sc.untestedDirs.length ? "<dt>No tests</dt><dd><code>" + sc.untestedDirs.map(esc).join("</code>, <code>") + "</code></dd>" : "",
      ].join("");
      var appGaps = gaps.filter(function (f) { return f.evidence.concat([f.currentState, f.title]).join(" ").indexOf(root === "." ? "" : root) >= 0; });
      return '<div class="panel" style="display:grid;gap:10px"><h2><code>' + esc(root) + "</code></h2>" + (t && t.summary ? "<p>" + esc(t.summary) + "</p>" : "") + '<dl class="kv">' + meta + "</dl>" +
        '<div class="table"><table><thead><tr><th>Layer</th><th>What it proves</th><th>Tier</th><th>Files</th><th>Status</th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        '<div style="display:grid;gap:4px"><div>' + cpLine + "</div>" + (uncovered.length ? '<details><summary>Uncovered (' + uncovered.length + ')</summary><ul class="ev">' + uncovered.map(function (u) { return "<li>" + esc(u) + "</li>"; }).join("") + "</ul></details>" : "") + "</div>" +
        (appGaps.length ? '<div class="muted" style="font-size:.84rem">Gaps: ' + appGaps.map(function (f) { return "<code>" + esc(f.id) + "</code> " + esc(f.title); }).join(" · ") + "</div>" : "") + "</div>";
    }).join("");
  }

  function docsView() {
    var J = R.docs || null, SC = D.docsScan || null, DI = D.docItems || {};
    if (!J && !SC) return '<div class="empty">No documentation assessment yet. Run /agentic:docs (it also runs inside /agentic:assess).</div>';
    var safeUrl = function (u) { return /^https:\/\//.test(String(u)) ? esc(u) : "#"; };
    var list = function (xs) { return '<ul class="ev">' + xs.map(function (e) { return "<li>" + esc(e) + "</li>"; }).join("") + "</ul>"; };
    var legend = '<div class="legend">Items come from the sourced documentation library. Tier 1 is always expected; Tier 2 only when its condition holds; Tier 3 only after a recurring problem. ' + (J ? "Statuses and actions are the auditor's target layout." : "Statuses are scan hints; the context-auditor has not judged them yet.") + "</div>";
    var entries = J ? J.target.map(function (t) { return { id: t.id, scope: t.scope, status: t.status, action: t.action, home: t.home, paths: t.currentPaths || [], evidence: t.evidence.concat(t.reason ? [t.reason] : []), findingIds: t.findingIds || [] }; })
      : SC.items.filter(function (i) { return i.tier === 1 || i.status === "present"; }).map(function (i) { return { id: i.id, scope: i.scope, status: i.status, action: "", home: "", paths: i.paths, evidence: [], findingIds: [] }; });
    var scopes = [];
    entries.forEach(function (e) { if (scopes.indexOf(e.scope) < 0) scopes.push(e.scope); });
    scopes.sort(function (a, b) { return a === "repo" ? -1 : b === "repo" ? 1 : a < b ? -1 : 1; });
    var target = scopes.map(function (sc) {
      var rows = entries.filter(function (e) { return e.scope === sc; }).map(function (e) {
        var m = DI[e.id] || { artifact: e.id, title: "", tier: "", home: "", load: "", authority: "", source: {} };
        var where = e.paths.length ? e.paths.map(function (p) { return "<code>" + esc(p) + "</code>"; }).join(", ") : "";
        var home = e.home || m.home;
        var moveTo = e.action && e.action !== "retain" && e.action !== "none" && home ? ' → <code>' + esc(home) + "</code>" : "";
        return "<tr><td><code>" + esc(e.id) + "</code></td><td><b>" + esc(m.artifact) + '</b><div class="muted" style="font-size:.8rem">' + esc(m.authority) + " · loads " + esc(m.load) + ' · <a href="' + safeUrl(m.source && m.source.url) + '" target="_blank" rel="noopener noreferrer">' + esc((m.source && m.source.title) || "source") + "</a></div>" +
          (where || moveTo ? '<div style="font-size:.84rem">' + where + moveTo + "</div>" : "") +
          (e.evidence.length ? "<details><summary>Evidence</summary>" + list(e.evidence) + "</details>" : "") +
          (e.findingIds.length ? '<div class="muted" style="font-size:.8rem">Findings: ' + e.findingIds.map(esc).join(", ") + "</div>" : "") +
          '</td><td class="num">' + esc(m.tier) + "</td><td>" + pill(e.status) + "</td><td>" + (e.action ? pill(e.action) : '<span class="muted">not judged</span>') + "</td></tr>";
      }).join("");
      return "<h3>" + (sc === "repo" ? "Repository" : "<code>" + esc(sc) + "</code>") + '</h3><div class="table"><table><thead><tr><th>ID</th><th>Document</th><th>Tier</th><th>Status</th><th>Action</th></tr></thead><tbody>' + rows + "</tbody></table></div>";
    }).join("");
    var loadLines = J && J.loading ? J.loading.alwaysLoadedLines : SC ? SC.alwaysLoadedLines : 0;
    var ctx = [
      "<dt>Always loaded</dt><dd>" + esc(loadLines) + " lines" + (SC && SC.alwaysLoaded.length ? ' <span class="muted">(' + SC.alwaysLoaded.map(function (a) { return esc(a.file) + " " + esc(a.lines); }).join(", ") + ")</span>" : "") + "</dd>",
      J && J.loading && J.loading.issues.length ? "<dt>Loading issues</dt><dd>" + list(J.loading.issues) + "</dd>" : "",
      SC ? "<dt>Docs</dt><dd>" + esc(SC.docFileCount) + " documentation files</dd>" : "",
      SC && SC.brokenLinks.length ? "<dt>Broken links</dt><dd><details><summary>" + esc(SC.brokenLinks.length) + " relative links do not resolve</summary>" + list(SC.brokenLinks) + "</details></dd>" : "",
      SC && SC.duplicates.length ? "<dt>Repeated</dt><dd><details><summary>" + esc(SC.duplicates.length) + " instruction lines appear in more than one guidance file</summary>" + list(SC.duplicates.map(function (d) { return d.files.join(" + ") + ": " + d.line; })) + "</details></dd>" : "",
    ].join("");
    var nav = J && J.navigation && J.navigation.length ? '<div class="table"><table><thead><tr><th>From CLAUDE.md to</th><th>Result</th><th>Route</th></tr></thead><tbody>' + J.navigation.map(function (n) {
      return "<tr><td>" + esc(n.goal) + "</td><td>" + pill(n.reachable ? "reachable" : "unreachable") + "</td><td>" + n.route.map(function (r) { return "<code>" + esc(r) + "</code>"; }).join(" → ") + (n.note ? '<div class="muted" style="font-size:.8rem">' + esc(n.note) + "</div>" : "") + "</td></tr>";
    }).join("") + "</tbody></table></div>" : "";
    var inv = J && J.inventory.length ? '<details class="panel"><summary><b>Inventory</b> (' + J.inventory.length + ' documents)</summary><div class="table"><table><thead><tr><th>Location</th><th>Purpose</th><th>Authority</th><th>Owner</th><th>Disposition</th></tr></thead><tbody>' + J.inventory.map(function (i) {
      return "<tr><td><code>" + esc(i.location) + "</code></td><td>" + esc(i.purpose) + (i.issue ? '<div class="muted" style="font-size:.8rem">' + esc(i.issue) + "</div>" : "") + "</td><td>" + esc(i.authority || "") + "</td><td>" + esc(i.owner || "") + "</td><td>" + pill(i.disposition) + "</td></tr>";
    }).join("") + "</tbody></table></div></details>" : "";
    var gaps = R.findings.filter(function (f) { return !f.resolved && f.dimension === "CTX"; });
    return legend + (J && J.summary ? '<div class="panel"><p>' + esc(J.summary) + "</p></div>" : "") +
      '<div class="panel" style="display:grid;gap:10px"><h2>Target layout</h2>' + target + "</div>" +
      '<div class="panel" style="display:grid;gap:10px"><h2>Agent context</h2><dl class="kv">' + ctx + "</dl>" + nav + "</div>" + inv +
      (gaps.length ? '<div class="muted" style="font-size:.84rem">Open documentation findings: ' + gaps.map(function (f) { return "<code>" + esc(f.id) + "</code> " + esc(f.title); }).join(" · ") + "</div>" : "");
  }

  function maintenanceView() {
    var J = R.maintenance || null, SC = D.maintenanceScan || null, JL = D.janitors || {};
    var ids = Object.keys(JL);
    if (!ids.length) return '<div class="empty">No maintenance library loaded.</div>';
    var safeUrl = function (u) { return /^https:\/\//.test(String(u)) ? esc(u) : "#"; };
    var crit = {};
    R.criteria.forEach(function (c) { crit[c.id] = c.status; });
    var blocking = function (id) { return (JL[id].prerequisites || []).filter(function (p) { return crit[p] !== "passed" && crit[p] !== "n_a"; }); };
    var scanOf = function (id) { return SC ? SC.items.find(function (i) { return i.id === id; }) : null; };
    var entries = J ? J.roster.map(function (r) { return { id: r.id, status: r.status, recommend: r.recommend, blockedBy: r.blockedBy || blocking(r.id), trigger: r.trigger, environment: r.environment, detector: r.detector, autofix: r.autofix, needsHuman: r.needsHuman, noiseControls: r.noiseControls, success: r.success, reason: r.reason, evidence: r.evidence || [], findingIds: r.findingIds || [] }; })
      : ids.filter(function (id) { return JL[id].tier === 1 || (scanOf(id) && scanOf(id).status === "present"); }).map(function (id) {
        var sc = scanOf(id), b = blocking(id);
        return { id: id, status: sc ? sc.status : "absent", recommend: "", blockedBy: b, evidence: sc ? sc.paths : [], findingIds: [] };
      });
    var groups = [
      ["Running", function (e) { return e.status === "present"; }],
      ["Ready to set up", function (e) { return e.status !== "present" && (e.recommend === "now" || (!e.recommend && !e.blockedBy.length)); }],
      ["Waiting on prerequisites", function (e) { return e.status !== "present" && (e.recommend === "after-prerequisites" || (!e.recommend && e.blockedBy.length)); }],
      ["Not yet", function (e) { return e.status !== "present" && (e.recommend === "not-yet" || e.recommend === "none" || e.status === "n_a"); }],
    ];
    var card = function (e) {
      var j = JL[e.id] || { title: e.id, tier: "", trigger: [], source: {} };
      var kv = [
        ["Trigger", (e.trigger || (j.trigger || []).join(", ")) + (e.environment ? " · " + e.environment : "")],
        ["Guards", (j.guards || []).join(", ")],
        ["Detector", (e.detector && e.detector.length ? e.detector : j.detector || []).join("; ")],
        ["Fixes alone", e.autofix || j.autofix],
        ["Needs a human", e.needsHuman || j.needs_human],
        ["Noise limits", e.noiseControls || j.noise_controls],
        ["Success", e.success || j.success],
      ].map(function (x) { return x[1] ? "<dt>" + x[0] + "</dt><dd>" + esc(x[1]) + "</dd>" : ""; }).join("");
      return '<div class="item"><div class="row"><code>' + esc(e.id) + '</code><h3 class="grow">' + esc(j.title) + "</h3>" + pill("T" + j.tier) + (e.recommend ? pill(e.recommend) : "") + pill(e.status) + "</div>" +
        (j.purpose ? '<p class="muted" style="font-size:.88rem">' + esc(j.purpose) + "</p>" : "") +
        (e.blockedBy.length && e.status !== "present" ? '<div style="font-size:.84rem">Waiting on ' + e.blockedBy.map(function (b) { return "<code>" + esc(b) + "</code> " + (crit[b] ? pill(crit[b]) : ""); }).join(" ") + "</div>" : "") +
        (e.reason ? '<div style="font-size:.84rem">' + esc(e.reason) + "</div>" : "") +
        '<details><summary>How it runs</summary><dl class="kv">' + kv + '</dl><div class="muted" style="font-size:.8rem"><a href="' + safeUrl(j.source && j.source.url) + '" target="_blank" rel="noopener noreferrer">' + esc((j.source && j.source.title) || "source") + "</a></div></details>" +
        (e.evidence.length ? '<details><summary>Evidence</summary><ul class="ev">' + e.evidence.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></details>" : "") +
        (e.findingIds.length ? '<div class="muted" style="font-size:.8rem">Findings: ' + e.findingIds.map(esc).join(", ") + "</div>" : "") + "</div>";
    };
    var legend = '<div class="legend">Janitors keep the repository from drifting once the roadmap has fixed it. Each one guards an accepted contract and waits until its prerequisite criteria pass. Tier 1 is expected at L4; Tier 2 only when its condition holds; Tier 3 only after a recurring problem. ' + (J ? "The roster is the workflow-auditor's proposal." : "Statuses are scan hints; the workflow-auditor has not proposed a roster yet.") + "</div>";
    var body = groups.map(function (g) {
      var xs = entries.filter(g[1]);
      return xs.length ? '<div class="panel" style="display:grid;gap:10px"><h2>' + g[0] + ' <span class="muted num">' + xs.length + '</span></h2><div class="list">' + xs.map(card).join("") + "</div></div>" : "";
    }).join("");
    var where = SC ? '<div class="muted" style="font-size:.84rem">Places a janitor could run here: ' + (SC.runners.length ? SC.runners.map(esc).join(", ") : "none found") + "</div>" : "";
    var gaps = R.findings.filter(function (f) { return !f.resolved && f.dimension === "WF"; });
    return legend + (J && J.summary ? '<div class="panel"><p>' + esc(J.summary) + "</p></div>" : "") + where + body +
      (gaps.length ? '<div class="muted" style="font-size:.84rem">Open workflow findings: ' + gaps.map(function (f) { return "<code>" + esc(f.id) + "</code> " + esc(f.title); }).join(" · ") + "</div>" : "");
  }

  function roadmapView() {
    if (!R.milestones.length) return '<div class="empty">No roadmap yet. Run /agentic:plan after the assessment.</div>';
    var ts = R.tasks.filter(function (t) { return filters.milestone === "all" || t.milestoneId === filters.milestone; });
    var cols = [["pending", "Pending"], ["in_progress", "In progress"], ["verification_required", "Awaiting verification"], ["completed", "Completed"]];
    var other = ts.filter(function (t) { return t.status === "blocked" || t.status === "deferred"; });
    var card = function (t) {
      var unmet = t.dependsOn.filter(function (d) { var x = R.tasks.find(function (y) { return y.id === d; }); return !x || x.status !== "completed"; });
      return '<div class="card"><div class="row"><code>' + esc(t.id) + "</code>" + pill(t.priority) + (t.status === "blocked" || t.status === "deferred" ? pill(t.status) : "") + "</div><b>" + esc(t.title) + "</b>" +
        (unmet.length ? '<span class="muted" style="font-size:.8rem">Waiting on ' + unmet.map(esc).join(", ") + "</span>" : "") +
        (t.blockedReason ? '<span style="font-size:.8rem;color:var(--bad)">' + esc(t.blockedReason) + "</span>" : "") +
        '<details><summary>Acceptance and verification</summary><ul class="ev">' + t.acceptanceCriteria.map(function (a) {
          var ok = R.evidence.some(function (e) { return e.taskId === t.id && e.result === "pass" && e.covers.indexOf(a.id) >= 0 && e.verifier !== t.implementer; });
          return "<li>" + (ok ? "✓ " : "") + "<code>" + esc(a.id) + "</code> " + esc(a.text) + "</li>";
        }).join("") + '</ul><ul class="ev">' + t.verification.map(function (v) { return '<li class="muted">' + esc(v) + "</li>"; }).join("") + "</ul></details></div>";
    };
    var ms = '<div class="list">' + R.milestones.filter(function (m) { return filters.milestone === "all" || m.id === filters.milestone; }).map(function (m) {
      return '<div class="item"><div class="row"><code>' + esc(m.id) + '</code><h3 class="grow">' + esc(m.title) + "</h3>" + pill(m.status) + "</div><p>" + esc(m.objective) + "</p>" +
        (m.dependsOn.length ? '<span class="muted" style="font-size:.84rem">Depends on ' + m.dependsOn.map(esc).join(", ") + "</span>" : "") +
        '<details><summary>Exit criteria</summary><ul class="ev">' + m.exitCriteria.map(function (x) {
          var ok = R.evidence.some(function (e) { return e.result === "pass" && e.covers.indexOf(x.id) >= 0; });
          return "<li>" + (ok ? "✓ " : "") + "<code>" + esc(x.id) + "</code> " + esc(x.text) + "</li>";
        }).join("") + "</ul></details></div>";
    }).join("") + "</div>";
    return '<div class="filters">' + sel("milestone", R.milestones.map(function (m) { return [m.id, m.id + " " + m.title]; })) + "</div>" + ms +
      '<div class="board">' + cols.map(function (c) {
        var items = ts.filter(function (t) { return t.status === c[0]; });
        return '<div class="col"><div class="row"><span class="label grow">' + c[1] + '</span><b class="num">' + items.length + "</b></div>" + items.map(card).join("") + "</div>";
      }).join("") + "</div>" +
      (other.length ? '<div class="panel" style="display:grid;gap:10px"><h2>Blocked and deferred</h2><div class="board">' + other.map(card).join("") + "</div></div>" : "");
  }

  function evidenceView() {
    if (!R.evidence.length) return '<div class="empty">No verification evidence recorded yet. Evidence appears here after /agentic:verify.</div>';
    var rows = R.evidence.slice().reverse().map(function (e) {
      return "<tr><td><code>" + esc(e.id) + "</code></td><td><code>" + esc(e.taskId || e.milestoneId || "") + "</code></td><td>" + pill(e.result) + "</td><td>" + esc(e.verifier) + "</td><td>" + esc(e.action) +
        (e.location ? '<div class="muted" style="font-size:.8rem">' + esc(e.location) + "</div>" : "") + "</td><td><code>" + short(e.revision) + "</code></td><td>" + esc(String(e.at).slice(0, 10)) + "</td></tr>";
    }).join("");
    return '<div class="panel"><div class="table"><table><thead><tr><th>ID</th><th>For</th><th>Result</th><th>Verifier</th><th>Action</th><th>Rev</th><th>Date</th></tr></thead><tbody>' + rows + "</tbody></table></div></div>";
  }

  var views = { overview: ["Overview", overview], criteria: ["Criteria", criteriaView], findings: ["Findings", findingsView], conventions: ["Conventions", conventionsView], testing: ["Testing", testingView], docs: ["Docs", docsView], maintenance: ["Maintenance", maintenanceView], roadmap: ["Roadmap", roadmapView], evidence: ["Evidence", evidenceView] };
  function render() {
    var key = (location.hash || "#overview").slice(1);
    if (!views[key]) key = "overview";
    app.innerHTML = header() + '<nav class="tabs" aria-label="Views">' + Object.keys(views).map(function (k) {
      return '<a href="#' + k + '"' + (k === key ? ' aria-current="page"' : "") + ">" + views[k][0] + "</a>";
    }).join("") + "</nav>" + views[key][1]() +
      '<footer class="muted" style="font-size:.8rem">This view is read-only. The authoritative record is <code>.agentic/record.json</code> in the repository (or the staging copy before adoption). Change it through the /agentic commands in Claude Code, which republish this page.</footer>';
    app.querySelectorAll("select[data-f]").forEach(function (s) {
      s.addEventListener("change", function () { filters[s.getAttribute("data-f")] = s.value; render(); });
    });
  }
  window.addEventListener("hashchange", render);
  render();
})();
</script>
`;
