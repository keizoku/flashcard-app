import { describe, expect, test } from "vitest";
import { renderReport } from "@/tools/report/render.mjs";
import { rowStatus, sectionCounts, summarizePlaywright } from "@/tools/report/results.mjs";
import { parseSpec } from "@/tools/test-runner/lib.mjs";

// テスト結果レポート（tools/report）の、結果をまとめる部分と HTML を作る部分

const PNG = Buffer.from("fake-png").toString("base64");

const PLAYWRIGHT = {
  suites: [
    {
      title: "app.spec.mjs",
      file: "app.spec.mjs",
      specs: [
        {
          title: "UI-01 ログイン",
          file: "app.spec.mjs",
          tests: [
            {
              results: [
                {
                  status: "passed",
                  duration: 1234.4,
                  errors: [],
                  attachments: [
                    { name: "1. ログイン画面", contentType: "image/png", body: PNG },
                    { name: "trace", contentType: "application/zip", path: "/tmp/x.zip" },
                  ],
                },
              ],
            },
          ],
        },
      ],
      suites: [
        {
          title: "入れ子",
          specs: [
            {
              title: "UI-02 404",
              file: "app.spec.mjs",
              tests: [{ results: [{ status: "timedOut", duration: 90000, errors: [{ message: "\u001b[31mTimeout\u001b[39m" }], attachments: [] }] }],
            },
            { title: "UI-03 飛ばした", file: "app.spec.mjs", tests: [{ results: [{ status: "skipped", duration: 0 }] }] },
          ],
        },
      ],
    },
  ],
  errors: [],
};

describe("画面のテストの結果をまとめる（summarizePlaywright）", () => {
  test("RP-01 ID ごとにまとめ、スクリーンショットを持つ。失敗・時間切れは失敗、スキップは入れない", () => {
    const r = summarizePlaywright(PLAYWRIGHT);
    expect(Object.keys(r.byId)).toEqual(["UI-01", "UI-02"]);
    expect(r.byId["UI-01"]).toEqual({
      status: "passed",
      duration: 1234,
      file: "e2e/app.spec.mjs",
      tests: [{ title: "UI-01 ログイン", status: "passed", duration: 1234, failures: [], shots: [{ name: "1. ログイン画面", image: PNG }] }],
    });
    expect(r.byId["UI-02"]).toMatchObject({ status: "failed", tests: [{ failures: ["Timeout"], shots: [] }] });
    expect(r).toMatchObject({ passed: 1, failed: 1, errors: [] });
    expect(summarizePlaywright(null)).toEqual({ byId: {}, errors: [], passed: 0, failed: 0 });
  });
});

const SPEC = parseSpec(
  [
    "## 1. 画面",
    "| 条件 | 期待する結果 | テスト |",
    "| --- | --- | --- |",
    "| <b>太字</b> と `code` | 出る | UI-01 |",
    "| 2つ | どちらも | UI-01、ST-01 |",
    "| 失敗 | 失敗 | UI-02 |",
    "| 実行していない | – | ZZ-01 |",
    "| まだ | – | 未 |",
  ].join("\n")
);

describe("仕様書の行の結果", () => {
  test("RP-02 1つでも失敗なら失敗、結果のない ID があれば実行していない、全部成功なら成功、未は未。節ごとに数える", () => {
    const results = { "UI-01": { status: "passed" }, "ST-01": { status: "passed" }, "UI-02": { status: "failed" } };
    const rows = SPEC.sections[0].tables[0].rows;
    expect(rows.map((r) => rowStatus(r, results))).toEqual(["passed", "passed", "failed", "missing", "untested"]);
    expect(rowStatus({ ids: ["UI-01", "UI-02"], untested: false }, results)).toBe("failed");
    expect(rowStatus({ ids: ["UI-01", "ZZ-01"], untested: false }, results)).toBe("missing");
    expect(sectionCounts(SPEC, results)).toEqual([
      { title: "1. 画面", total: 5, passed: 2, failed: 1, missing: 1, untested: 1 },
    ]);
  });
});

describe("HTML を作る（renderReport）", () => {
  const base = {
    createdAt: "2026-11-18 09:00:00",
    commit: { hash: "abc1234", subject: "<script>x</script>", branch: "main", dirty: false },
    env: { node: "v22.0.0", platform: "linux/arm64" },
    spec: SPEC,
    unit: { byId: { "ST-01": { status: "passed", file: "test/unit/a.test.js", tests: [{ title: "ST-01 a", status: "passed", duration: 1, failures: [] }] } }, errors: [], passed: 1, failed: 0, ok: true, seconds: 1 },
    runner: null,
  };

  test("RP-03 仕様書の文字はエスケープし、画像は中に入れる。失敗があれば失敗の表示と詳細を出す", () => {
    const e2e = { ...summarizePlaywright(PLAYWRIGHT), ok: false, seconds: 2 };
    const html = renderReport({ ...base, e2e });
    expect(html).toContain("&lt;b&gt;太字&lt;/b&gt; と <code>code</code>");
    expect(html).not.toContain("<b>太字</b>");
    expect(html).not.toContain("<script>x</script>");
    expect(html).toContain(`src="data:image/png;base64,${PNG}"`);
    expect(html).toContain("1. ログイン画面");
    expect(html).toContain("失敗したテストがあります（1 件）");
    expect(html).toContain('id="failures"');
    expect(html).toContain("Timeout");

    const passedOnly = { byId: { "UI-01": summarizePlaywright(PLAYWRIGHT).byId["UI-01"] }, errors: [], passed: 1, failed: 0, ok: true, seconds: 2 };
    const ok = renderReport({ ...base, e2e: passedOnly });
    expect(ok).toContain("すべてのテストが成功しました");
    expect(ok).not.toContain('id="failures"');
  });
});
