// テスト実行ツールの、画面に依存しない部分（単体テスト: test/unit/test-runner.test.js）
//   - テスト仕様書（docs/test-spec.md）を、節・表・行に分けて読む
//   - 実行するテストの ID から、vitest に渡す条件を作る
//   - vitest の JSON の結果を、ID ごとにまとめる

export const ID_RE = /\b[A-Z]{2,3}-\d{2}\b/g;
const isSeparator = (line) => /^\|\s*:?-+/.test(line);
const splitRow = (line) =>
  line
    .replace(/\\\|/g, "\u0000") // 表の中の「\|」は区切りではない
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim().replace(/\u0000/g, "|"));

// 仕様書を読む → { sections: [{ title, number, tables: [{ heading, headers, rows: [{ cells, ids, untested }] }] }] }
// 番号付きの節（## 1. …）だけを読む。### の見出しは、その下の表の heading になる
export function parseSpec(md) {
  const lines = md.split("\n");
  const sections = [];
  let section = null;
  let heading = null;
  let table = null;
  lines.forEach((line, i) => {
    const h2 = line.match(/^## ((\d+)\. .+)$/);
    if (h2) {
      section = { title: h2[1].trim(), number: Number(h2[2]), tables: [] };
      sections.push(section);
      heading = null;
      table = null;
      return;
    }
    if (/^## /.test(line)) {
      section = null;
      return;
    }
    if (!section) return;
    const h3 = line.match(/^### (.+)$/);
    if (h3) {
      heading = h3[1].trim();
      table = null;
      return;
    }
    if (!line.startsWith("|")) {
      table = null;
      return;
    }
    if (isSeparator(line)) return;
    if (isSeparator(lines[i + 1] ?? "")) {
      table = { heading, headers: splitRow(line), rows: [] };
      section.tables.push(table);
      return;
    }
    if (!table) return;
    const cells = splitRow(line);
    const last = cells.at(-1) ?? "";
    table.rows.push({ cells, ids: last.match(ID_RE) ?? [], untested: last === "未" });
  });
  return { sections };
}

// vitest の -t に渡す条件（テストの名前は「ID 名前」なので、ID のあとに空白があるものに絞る）
export function namePattern(ids) {
  const valid = [...new Set(ids)].filter((id) => /^[A-Z]{2,3}-\d{2}$/.test(id));
  if (valid.length === 0) throw new Error("実行するテストの ID がありません");
  return `\\b(?:${valid.join("|")}) `;
}

// vitest で実行するテストのファイルか（画面のテスト e2e/*.spec.mjs は Playwright で実行する）
export const isUnitTestFile = (file) => file.startsWith("test/") && file.endsWith(".test.js");

// その ID のテストが入っているファイルだけを実行する（速くするため）
export function filesFor(ids, titles) {
  const want = new Set(ids);
  return [...new Set(titles.filter((t) => want.has(t.title.split(" ")[0])).map((t) => t.file))].sort();
}

// vitest の JSON の結果を ID ごとにまとめる
//   → { byId: { "ST-01": { status, duration, tests: [{ title, status, duration, failures }] } }, errors, passed, failed }
// test.each のように同じ ID のテストがいくつもあるときは、1つでも失敗すれば失敗
export function summarize(report, root = "/app/") {
  const byId = {};
  const errors = [];
  for (const file of report?.testResults ?? []) {
    const name = file.name.startsWith(root) ? file.name.slice(root.length) : file.name;
    if (file.status === "failed" && file.message) errors.push({ file: name, message: stripAnsi(file.message) });
    for (const a of file.assertionResults ?? []) {
      if (a.status !== "passed" && a.status !== "failed") continue; // 実行しなかったもの
      const id = a.title.split(" ")[0];
      const entry = (byId[id] ??= { status: "passed", duration: 0, file: name, tests: [] });
      entry.tests.push({
        title: a.title,
        status: a.status,
        duration: Math.round(a.duration ?? 0),
        failures: (a.failureMessages ?? []).map(stripAnsi),
      });
      entry.duration += Math.round(a.duration ?? 0);
      if (a.status === "failed") entry.status = "failed";
    }
  }
  const values = Object.values(byId);
  return {
    byId,
    errors,
    passed: values.filter((v) => v.status === "passed").length,
    failed: values.filter((v) => v.status === "failed").length,
  };
}

export const stripAnsi = (s) => String(s ?? "").replace(/\u001b\[[0-9;]*m/g, "");
