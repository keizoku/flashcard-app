// テスト結果レポートの、結果をまとめる部分（単体テスト: test/unit/report.test.js）
import { stripAnsi } from "../test-runner/lib.mjs";

// Playwright の JSON の結果を、ID ごとにまとめる（vitest の summarize と同じ形）
//   → { byId: { "UI-01": { status, duration, file, tests: [{ title, status, duration, failures, shots }] } }, errors, passed, failed }
//   shots: [{ name, image(base64 の PNG) }] … テストの中で testInfo.attach した画像（手順のスクリーンショット）
export function summarizePlaywright(report) {
  const byId = {};
  const errors = (report?.errors ?? []).map((e) => ({ file: "", message: stripAnsi(e.message ?? e.stack ?? "") }));
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const result = t.results?.at(-1);
        if (!result || (result.status !== "passed" && result.status !== "failed" && result.status !== "timedOut")) continue;
        const status = result.status === "passed" ? "passed" : "failed";
        const id = spec.title.split(" ")[0];
        const entry = (byId[id] ??= { status: "passed", duration: 0, file: spec.file ? `e2e/${spec.file}` : suite.file, tests: [] });
        entry.tests.push({
          title: spec.title,
          status,
          duration: Math.round(result.duration ?? 0),
          failures: (result.errors ?? []).map((e) => stripAnsi(e.message ?? "")),
          shots: (result.attachments ?? [])
            .filter((a) => a.contentType === "image/png" && a.body)
            .map((a) => ({ name: a.name, image: a.body })),
        });
        entry.duration += Math.round(result.duration ?? 0);
        if (status === "failed") entry.status = "failed";
      }
    }
    (suite.suites ?? []).forEach(visit);
  };
  (report?.suites ?? []).forEach(visit);
  const values = Object.values(byId);
  return {
    byId,
    errors,
    passed: values.filter((v) => v.status === "passed").length,
    failed: values.filter((v) => v.status === "failed").length,
  };
}

// 仕様書の1行の結果。ID のどれかが失敗なら失敗、全部成功なら成功、結果がない ID があれば「実行していない」
export function rowStatus(row, results) {
  if (row.untested) return "untested";
  if (row.ids.length === 0) return "none";
  const st = row.ids.map((id) => results[id]?.status ?? "missing");
  if (st.includes("failed")) return "failed";
  if (st.includes("missing")) return "missing";
  return "passed";
}

// 節ごとの数（成功・失敗・実行していない・未）
export function sectionCounts(spec, results) {
  return spec.sections.map((s) => {
    const counts = { title: s.title, total: 0, passed: 0, failed: 0, missing: 0, untested: 0 };
    for (const t of s.tables) {
      for (const row of t.rows) {
        const st = rowStatus(row, results);
        counts.total++;
        if (st in counts) counts[st]++;
      }
    }
    return counts;
  });
}
