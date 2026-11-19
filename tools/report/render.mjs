// テスト結果レポートの HTML を作る（画像も中に入れた、1つのファイル）
import { rowStatus, sectionCounts } from "./results.mjs";

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// 仕様書の中の `コード` と **太字** だけを HTML にする
export const md = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

const LABEL = { passed: "成功", failed: "失敗", missing: "実行していない", untested: "未（テストなし）", none: "" };
const ICON = { passed: "✓", failed: "✗", missing: "–", untested: "未", none: "" };
const pct = (n, total) => (total > 0 ? Math.round((n / total) * 100) : 0);
const sec = (ms) => `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} 秒`;
const testCount = (r) => Object.values(r.byId).reduce((n, v) => n + v.tests.length, 0);
const failedTests = (r) => Object.values(r.byId).flatMap((v) => v.tests.filter((t) => t.status === "failed").map((t) => ({ ...t, file: v.file })));

function chip(id, status, href) {
  const inner = `<span aria-hidden="true">${ICON[status]}</span> ${esc(id)}`;
  const title = `${id}: ${LABEL[status]}`;
  return href
    ? `<a class="chip ${status}" href="${href}" title="${esc(title)}">${inner}</a>`
    : `<span class="chip ${status}" title="${esc(title)}">${inner}</span>`;
}

function kpi(label, value, sub, status) {
  return `<div class="kpi ${status ?? ""}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub}</div></div>`;
}

function coverageBars(counts) {
  const seg = (key, n, total) =>
    n > 0 ? `<span class="seg ${key}" style="flex-grow:${n}" title="${LABEL[key]} ${n}"></span>` : "";
  const rows = counts
    .map((c) => {
      const tested = c.passed + c.failed + c.missing;
      return `<li>
        <div class="bar-head"><a href="#sec-${c.title.split(".")[0]}">${md(c.title)}</a>
          <span class="muted">${tested} / ${c.total} 条件（${pct(tested, c.total)}%）${c.failed ? ` · <strong class="fail-text">失敗 ${c.failed}</strong>` : ""}</span></div>
        <div class="bar" role="img" aria-label="${esc(`${c.title}: 成功 ${c.passed}、失敗 ${c.failed}、実行していない ${c.missing}、未 ${c.untested}`)}">
          ${seg("passed", c.passed)}${seg("failed", c.failed)}${seg("missing", c.missing)}${seg("untested", c.untested)}
        </div>
      </li>`;
    })
    .join("");
  return `<ul class="bars">${rows}</ul>`;
}

function legend() {
  return `<div class="legend">${["passed", "failed", "missing", "untested"]
    .map((k) => `<span><span class="sw ${k}" aria-hidden="true"></span>${LABEL[k]}</span>`)
    .join("")}</div>`;
}

function evidence(e2e) {
  const ids = Object.keys(e2e.byId).sort();
  if (ids.length === 0) return `<p class="muted">画面のテストの結果がありません。</p>`;
  return ids
    .map((id) => {
      const r = e2e.byId[id];
      return r.tests
        .map((t) => {
          const figures = t.shots
            .map(
              (s, i) => `<figure>
                <button type="button" class="shot" data-full="${id}-${i}" aria-label="${esc(s.name)}を大きく見る">
                  <img id="img-${id}-${i}" src="data:image/png;base64,${s.image}" alt="${esc(s.name)}" loading="lazy">
                </button>
                <figcaption>${esc(s.name)}</figcaption>
              </figure>`
            )
            .join("");
          const failures = t.failures.length ? `<pre class="failure">${esc(t.failures.join("\n\n"))}</pre>` : "";
          return `<article class="evidence ${t.status}" id="ev-${id}">
            <header>${chip(id, t.status)}<h3>${esc(t.title.slice(id.length + 1))}</h3>
              <span class="muted">${sec(t.duration)} · ${esc(r.file)}</span></header>
            ${failures}
            <div class="shots">${figures || `<p class="muted">スクリーンショットはありません。</p>`}</div>
          </article>`;
        })
        .join("");
    })
    .join("");
}

function matrix(spec, results, isE2e) {
  return spec.sections
    .map((s) => {
      const number = s.title.split(".")[0];
      const tables = s.tables
        .map((t) => {
          const head = t.headers.slice(0, -1).map((h) => `<th scope="col">${md(h)}</th>`).join("");
          const body = t.rows
            .map((row) => {
              const st = rowStatus(row, results);
              const cells = row.cells.slice(0, -1).map((c) => `<td>${md(c)}</td>`).join("");
              const result = row.untested
                ? `<span class="chip untested">未（テストなし）</span>`
                : row.ids.map((id) => chip(id, results[id]?.status ?? "missing", isE2e(id) ? `#ev-${id}` : null)).join(" ");
              return `<tr data-status="${st}">${cells}<td class="result">${result}</td></tr>`;
            })
            .join("");
          return `${t.heading ? `<h4>${md(t.heading)}</h4>` : ""}
            <div class="table-wrap"><table><thead><tr>${head}<th scope="col">テストと結果</th></tr></thead><tbody>${body}</tbody></table></div>`;
        })
        .join("");
      const statuses = s.tables.flatMap((t) => t.rows.map((r) => rowStatus(r, results)));
      const failed = statuses.filter((x) => x === "failed").length;
      const untested = statuses.filter((x) => x === "untested").length;
      return `<details class="spec-section" id="sec-${number}" ${failed ? "open" : ""}>
        <summary><span class="sec-title">${md(s.title)}</span>
          <span class="muted">${statuses.length} 条件${failed ? ` · <strong class="fail-text">失敗 ${failed}</strong>` : ""}${untested ? ` · 未 ${untested}` : ""}</span></summary>
        ${tables}
      </details>`;
    })
    .join("");
}

function failureList(unit, e2e) {
  const items = [
    ...unit.errors.map((e) => ({ title: `${e.file}（読み込めなかった）`, failures: [e.message] })),
    ...e2e.errors.map((e) => ({ title: "画面のテストの準備", failures: [e.message] })),
    ...failedTests(unit),
    ...failedTests(e2e),
  ];
  if (items.length === 0) return "";
  return `<section id="failures"><h2>失敗の詳細</h2>${items
    .map((t) => `<article class="failure-item"><h3>${esc(t.title)}${t.file ? ` <span class="muted">${esc(t.file)}</span>` : ""}</h3><pre class="failure">${esc(t.failures.join("\n\n"))}</pre></article>`)
    .join("")}</section>`;
}

export function renderReport({ createdAt, commit, env, spec, unit, e2e, runner }) {
  const results = { ...unit.byId, ...e2e.byId };
  const isE2e = (id) => id in e2e.byId || id.startsWith("UI-");
  const counts = sectionCounts(spec, results);
  const total = counts.reduce((a, c) => ({
    total: a.total + c.total, passed: a.passed + c.passed, failed: a.failed + c.failed,
    missing: a.missing + c.missing, untested: a.untested + c.untested,
  }), { total: 0, passed: 0, failed: 0, missing: 0, untested: 0 });
  const tested = total.passed + total.failed + total.missing;
  const ok = unit.ok && e2e.ok && unit.failed === 0 && e2e.failed === 0;
  const failCount = unit.failed + e2e.failed + unit.errors.length + e2e.errors.length;
  const commitText = commit.hash
    ? `<code>${esc(commit.hash)}</code> ${esc(commit.subject ?? "")}（${esc(commit.branch ?? "")}）${commit.dirty ? ` · <strong>まだコミットしていない変更を含む</strong>` : ""}`
    : "不明";

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>テスト結果レポート ${esc(createdAt)}</title>
<style>
  :root {
    --bg: #f6f7f9; --surface: #ffffff; --text: #1d2330; --muted: #5d6675; --border: #dde1e7;
    --accent: #2f6fde;
    --pass: #1f8a4c; --pass-bg: #e3f4ea; --fail: #c62f2f; --fail-bg: #fbe5e5;
    --miss: #8a93a3; --miss-bg: #eceef2; --untested: #b26b00; --untested-bg: #fcf0dc;
    --code-bg: #eef1f5;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1218; --surface: #181c24; --text: #e6e9ef; --muted: #9aa3b2; --border: #2b313c;
      --accent: #6c9cf2;
      --pass: #4cc283; --pass-bg: #163524; --fail: #f07272; --fail-bg: #3d1a1c;
      --miss: #7d8696; --miss-bg: #262b35; --untested: #e8a64a; --untested-bg: #3a2b12;
      --code-bg: #232833;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.6 system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif; }
  main { max-width: 1180px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 26px; margin: 0 0 4px; }
  h2 { font-size: 20px; margin: 40px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
  h3 { font-size: 16px; margin: 0; }
  h4 { font-size: 14px; margin: 14px 0 6px; color: var(--muted); }
  a { color: var(--accent); }
  code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-size: .9em; }
  .muted { color: var(--muted); font-size: 13px; }
  .fail-text { color: var(--fail); }
  .meta { color: var(--muted); font-size: 13px; display: flex; flex-wrap: wrap; gap: 4px 16px; }
  .verdict { margin: 20px 0; padding: 14px 18px; border-radius: 10px; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
  .verdict.passed { background: var(--pass-bg); color: var(--pass); }
  .verdict.failed { background: var(--fail-bg); color: var(--fail); }
  .verdict small { font-weight: 400; font-size: 13px; color: var(--text); }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 14px 16px; }
  .kpi-label { color: var(--muted); font-size: 13px; }
  .kpi-value { font-size: 28px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .kpi-sub { color: var(--muted); font-size: 13px; }
  .kpi.failed .kpi-value { color: var(--fail); }
  nav.toc { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  nav.toc a { font-size: 13px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface); text-decoration: none; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 13px; color: var(--muted); margin-bottom: 8px; }
  .legend > span { display: inline-flex; align-items: center; gap: 6px; }
  .sw { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .bars { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
  .bar-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 14px; }
  .bar { display: flex; gap: 2px; height: 12px; margin-top: 4px; }
  .seg { border-radius: 3px; min-width: 4px; }
  .passed.seg, .sw.passed { background: var(--pass); }
  .failed.seg, .sw.failed { background: var(--fail); }
  .missing.seg, .sw.missing { background: var(--miss); }
  .untested.seg, .sw.untested { background: repeating-linear-gradient(135deg, var(--untested) 0 3px, transparent 3px 6px); border: 1px solid var(--untested); }
  .chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; white-space: nowrap; text-decoration: none; border: 1px solid transparent; }
  .chip.passed { background: var(--pass-bg); color: var(--pass); }
  .chip.failed { background: var(--fail-bg); color: var(--fail); border-color: var(--fail); }
  .chip.missing { background: var(--miss-bg); color: var(--muted); }
  .chip.untested { background: var(--untested-bg); color: var(--untested); }
  a.chip:hover { border-color: currentColor; }
  .evidence { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 16px; margin-bottom: 16px; }
  .evidence.failed { border-color: var(--fail); }
  .evidence > header { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-bottom: 12px; }
  .evidence > header h3 { flex: 1 1 320px; }
  .shots { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
  figure { margin: 0; }
  .shot { display: block; padding: 0; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; background: var(--bg); cursor: zoom-in; width: 100%; aspect-ratio: 11 / 8; }
  .shot img { width: 100%; height: 100%; object-fit: cover; object-position: top; display: block; }
  .shot:hover, .shot:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
  figcaption { font-size: 13px; margin-top: 6px; }
  .runner img { max-width: 100%; border: 1px solid var(--border); border-radius: 8px; display: block; }
  .filters { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
  .filters button { font: inherit; font-size: 13px; padding: 4px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
  .filters button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
  details.spec-section { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; margin-bottom: 8px; padding: 0 14px; }
  details.spec-section > summary { cursor: pointer; padding: 10px 0; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
  .sec-title { font-weight: 600; }
  .table-wrap { overflow-x: auto; margin-bottom: 12px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { text-align: left; vertical-align: top; padding: 6px 8px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; }
  td.result { white-space: normal; min-width: 120px; }
  td.result .chip { margin: 1px 0; }
  tr[data-status="failed"] td { background: var(--fail-bg); }
  body.only-failed tr[data-status]:not([data-status="failed"]),
  body.only-untested tr[data-status]:not([data-status="untested"]) { display: none; }
  pre.failure { background: var(--fail-bg); color: var(--text); border-left: 3px solid var(--fail); padding: 10px 12px; overflow-x: auto; font-size: 12px; white-space: pre-wrap; margin: 8px 0; }
  .failure-item { margin-bottom: 16px; }
  footer { margin-top: 48px; color: var(--muted); font-size: 13px; }
  dialog { max-width: 96vw; max-height: 96vh; padding: 0; border: 0; border-radius: 10px; background: var(--surface); color: var(--text); }
  dialog::backdrop { background: rgba(0, 0, 0, .7); }
  dialog img { display: block; max-width: 94vw; height: auto; }
  dialog .dlg-bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 8px 12px; font-size: 14px; position: sticky; top: 0; background: var(--surface); }
  dialog button { font: inherit; padding: 4px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; }
  @media print { details.spec-section { break-inside: avoid; } .filters, nav.toc { display: none; } }
</style>
</head>
<body>
<main>
  <h1>テスト結果レポート</h1>
  <div class="meta">
    <span>作成: ${esc(createdAt)}（日本時間）</span>
    <span>コミット: ${commitText}</span>
    <span>Node.js ${esc(env.node)}（${esc(env.platform)}）</span>
  </div>

  <div class="verdict ${ok ? "passed" : "failed"}" role="status">
    <span aria-hidden="true">${ok ? "✓" : "✗"}</span>
    <span>${ok ? "すべてのテストが成功しました" : `失敗したテストがあります（${failCount} 件）`}</span>
  </div>

  <div class="kpis">
    ${kpi("単体テスト（vitest）", `${unit.passed} / ${unit.passed + unit.failed}`, `ID ごとの成功数 · テスト ${testCount(unit)} 件 · ${unit.seconds} 秒`, unit.failed || !unit.ok ? "failed" : "")}
    ${kpi("画面のテスト（Playwright）", `${e2e.passed} / ${e2e.passed + e2e.failed}`, `スクリーンショット ${Object.values(e2e.byId).reduce((n, v) => n + v.tests.reduce((m, t) => m + t.shots.length, 0), 0)} 枚 · ${e2e.seconds} 秒`, e2e.failed || !e2e.ok ? "failed" : "")}
    ${kpi("仕様書の条件の網羅", `${pct(tested, total.total)}%`, `${total.total} 条件のうち ${tested} 条件にテストあり · 未 ${total.untested}`)}
    ${kpi("失敗", `${failCount}`, failCount ? "下の「失敗の詳細」を見てください" : "なし", failCount ? "failed" : "")}
  </div>

  <nav class="toc" aria-label="目次">
    <a href="#coverage">節ごとの網羅</a>
    <a href="#evidence">画面のテスト（スクリーンショット）</a>
    ${runner ? `<a href="#runner">テスト実行ツール</a>` : ""}
    <a href="#matrix">テスト仕様書と結果</a>
    ${failCount ? `<a href="#failures">失敗の詳細</a>` : ""}
  </nav>

  <section id="coverage">
    <h2>節ごとの網羅</h2>
    <p class="muted">テスト仕様書（docs/test-spec.md）の条件ごとに、テストの結果を数えた。「未」はまだテストがない条件。</p>
    ${legend()}
    ${coverageBars(counts)}
  </section>

  <section id="evidence">
    <h2>画面のテスト（スクリーンショット）</h2>
    <p class="muted">本物のブラウザ（Chromium）でアプリを操作し、手順ごとに画面を撮った。画像を押すと大きく見られる。テスト用の DB（flashcard_e2e）を使っている。</p>
    ${evidence(e2e)}
  </section>

  ${runner ? `<section id="runner" class="runner">
    <h2>テスト実行ツール</h2>
    <p class="muted">テスト実行ツール（docker compose exec app npm run test:ui）で「全部実行」した直後の画面。${esc(runner.status ?? "")}</p>
    <img src="data:image/png;base64,${runner.image}" alt="テスト実行ツールで全部実行した画面">
  </section>` : ""}

  <section id="matrix">
    <h2>テスト仕様書と結果</h2>
    <div class="filters" role="group" aria-label="表示する行">
      <button type="button" data-filter="" aria-pressed="true">すべて（${total.total}）</button>
      <button type="button" data-filter="only-failed" aria-pressed="false">失敗（${total.failed}）</button>
      <button type="button" data-filter="only-untested" aria-pressed="false">未（${total.untested}）</button>
    </div>
    <p id="filter-empty" class="muted" hidden>当てはまる行はありません。</p>
    ${matrix(spec, results, isE2e)}
  </section>

  ${failureList(unit, e2e)}

  <footer>
    このレポートは <code>docker compose run --rm e2e</code> で自動で作った（tools/report/make-report.mjs）。
    単体テストは vitest、画面のテストは Playwright の結果。条件と期待する結果は docs/test-spec.md による。
  </footer>
</main>

<dialog id="viewer" aria-label="スクリーンショット">
  <div class="dlg-bar"><span id="viewer-title"></span><button type="button" id="viewer-close">閉じる（Esc）</button></div>
  <img id="viewer-img" alt="">
</dialog>

<script>
  const viewer = document.getElementById("viewer");
  document.addEventListener("click", (e) => {
    const shot = e.target.closest(".shot");
    if (shot) {
      const img = document.getElementById("img-" + shot.dataset.full);
      document.getElementById("viewer-img").src = img.src;
      document.getElementById("viewer-img").alt = img.alt;
      document.getElementById("viewer-title").textContent = img.alt;
      viewer.showModal();
      return;
    }
    if (e.target.id === "viewer-close" || e.target === viewer) viewer.close();
    const f = e.target.closest("[data-filter]");
    if (f) {
      document.body.classList.remove("only-failed", "only-untested");
      if (f.dataset.filter) document.body.classList.add(f.dataset.filter);
      // 絞り込んだときは、当てはまる行がある節だけを開いて出す
      const want = f.dataset.filter.replace("only-", "");
      document.querySelectorAll("details.spec-section").forEach((d) => {
        const has = !want || d.querySelector('tr[data-status="' + want + '"]') !== null;
        d.hidden = !has;
        if (want) d.open = has;
      });
      const empty = document.getElementById("filter-empty");
      if (empty) empty.hidden = !want || document.querySelector("details.spec-section:not([hidden])") !== null;
      document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b === f)));
    }
  });
</script>
</body>
</html>
`;
}
