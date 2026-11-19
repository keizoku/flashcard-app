// テスト仕様書（docs/test-spec.md）とテストのファイルを読み取る道具。
// test/unit/test-spec.test.js で使う。網羅の状況の表を作り直すときは:
//   docker compose exec app node test/specDoc.mjs
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
export const SPEC_PATH = path.join(ROOT, "docs/test-spec.md");
export const ID_PATTERN = /\b[A-Z]{2,3}-\d{2}\b/g;
const UNTESTED = "未";

// テストのファイルにある、すべてのテストの名前 [{ file, title }]
//   単体テスト test/**/*.test.js と、画面のテスト e2e/*.spec.mjs
export function readTestTitles() {
  const files = [];
  const walk = (dir, suffix) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p, suffix);
      else if (e.name.endsWith(suffix)) files.push(p);
    }
  };
  walk(path.join(ROOT, "test"), ".test.js");
  walk(path.join(ROOT, "e2e"), ".spec.mjs");
  const titles = [];
  for (const file of files.sort()) {
    const src = readFileSync(file, "utf8");
    // test("名前", …) と test.each(…)("名前", …)。re.test("…") のようなメソッドは数えない
    for (const m of src.matchAll(/(?:(?<![.\w$])test|\))\(\s*"([^"]*)"/g)) {
      titles.push({ file: path.relative(ROOT, file), title: m[1] });
    }
  }
  return titles;
}

// 仕様書の番号付きの節（## 1. …）ごとに、表の行の「テスト」の列を読む
//   → [{ section, rows: [{ line, ids, untested, cell }] }]
export function readSpecSections(md = readFileSync(SPEC_PATH, "utf8")) {
  const lines = md.split("\n");
  const sections = [];
  let current = null;
  lines.forEach((line, i) => {
    const heading = line.match(/^## (\d+\. .+)$/);
    if (heading) {
      current = { section: heading[1].trim(), rows: [] };
      sections.push(current);
      return;
    }
    if (/^## /.test(line)) current = null;
    if (!current || !line.startsWith("|")) return;
    if (/^\|\s*-+/.test(line)) return; // 区切りの行
    if (/^\|\s*-+/.test(lines[i + 1] ?? "")) return; // 見出しの行
    const cells = line.replace(/\\\|/g, "").split("|").slice(1, -1).map((c) => c.trim());
    const last = cells.at(-1) ?? "";
    current.rows.push({ line: i + 1, ids: last.match(ID_PATTERN) ?? [], untested: last === UNTESTED, cell: last });
  });
  return sections;
}

// 節ごとの数 → [{ section, total, tested, untested }]
export function countCoverage(sections = readSpecSections()) {
  return sections.map(({ section, rows }) => ({
    section,
    total: rows.length,
    tested: rows.filter((r) => r.ids.length > 0).length,
    untested: rows.filter((r) => r.untested).length,
  }));
}

// 網羅の状況の表（データの行）を作る
export function coverageTable(counts = countCoverage()) {
  const sum = (k) => counts.reduce((n, c) => n + c[k], 0);
  return [
    ...counts.map((c) => `| ${c.section} | ${c.total} | ${c.tested} | ${c.untested} |`),
    `| **合計** | **${sum("total")}** | **${sum("tested")}** | **${sum("untested")}** |`,
  ].join("\n");
}

// 仕様書に書いてある網羅の状況の表（データの行だけ）
export function readCoverageTable(md = readFileSync(SPEC_PATH, "utf8")) {
  const start = md.indexOf("## 網羅の状況");
  const end = md.indexOf("\n## ", start + 1);
  return md
    .slice(start, end)
    .split("\n")
    .filter((l) => l.startsWith("|") && !/^\|\s*-+/.test(l) && !l.startsWith("| 節 "))
    .join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(coverageTable());
}
