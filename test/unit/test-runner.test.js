import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { filesFor, isUnitTestFile, namePattern, parseSpec, summarize } from "@/tools/test-runner/lib.mjs";
import { readSpecSections, readTestTitles, SPEC_PATH } from "../specDoc.mjs";

// テスト実行ツール（tools/test-runner）の、画面に依存しない部分

const SPEC = [
  "# テスト仕様書",
  "## 網羅の状況",
  "| 節 | 条件 |",
  "| --- | --- |",
  "| 1. A | 2 |",
  "## 1. 登録",
  "`app/x.js`",
  "",
  "| 条件 | 期待する結果 | テスト |",
  "| --- | --- | --- |",
  "| 正しい | 登録する（`a \\| b`） | SU-01 |",
  "| 60秒以内 | 送らない | 未 |",
  "## 2. ログイン",
  "### 転送",
  "| 画面 | 結果 | テスト |",
  "| --- | --- | --- |",
  "| `/` | ログインへ | MW-03、SS-04 |",
].join("\n");

describe("テスト仕様書を読む（parseSpec）", () => {
  test("RN-01 番号付きの節ごとに、見出し・表の列・行・ID・「未」を読む", () => {
    const { sections } = parseSpec(SPEC);
    expect(sections.map((s) => s.title)).toEqual(["1. 登録", "2. ログイン"]);
    expect(sections[0].tables[0]).toEqual({
      heading: null,
      headers: ["条件", "期待する結果", "テスト"],
      rows: [
        { cells: ["正しい", "登録する（`a | b`）", "SU-01"], ids: ["SU-01"], untested: false },
        { cells: ["60秒以内", "送らない", "未"], ids: [], untested: true },
      ],
    });
    expect(sections[1].tables[0]).toMatchObject({ heading: "転送", rows: [{ ids: ["MW-03", "SS-04"] }] });
  });

  test("RN-02 本物の仕様書を、網羅の数を数える読み方（DOC-04）と同じ行数で読む", () => {
    const { sections } = parseSpec(readFileSync(SPEC_PATH, "utf8"));
    const counts = sections.map((s) => s.tables.reduce((n, t) => n + t.rows.length, 0));
    expect(counts).toEqual(readSpecSections().map((s) => s.rows.length));
  });
});

describe("実行するテストを選ぶ", () => {
  test("RN-03 ID から vitest の -t の条件を作る（ID のあとに空白があるものだけ）", () => {
    const re = new RegExp(namePattern(["ST-01", "YT-05", "ST-01"]));
    expect(re.test("次に出す日時 ST-01 夜 21:00")).toBe(true);
    expect(re.test("YT-05 formatTime")).toBe(true);
    expect(re.test("ST-02 0日")).toBe(false);
    expect(re.test("XST-01 x")).toBe(false);
    expect(() => namePattern([])).toThrow();
    expect(() => namePattern(["rm -rf", "ST-1"])).toThrow(); // ID の形でないものは使わない
  });

  test("RN-04 その ID のテストが入っているファイルだけを選ぶ", () => {
    const titles = [
      { file: "test/unit/a.test.js", title: "ST-01 x" },
      { file: "test/unit/a.test.js", title: "ST-02 y" },
      { file: "test/db/b.test.js", title: "SU-01 z" },
    ];
    expect(filesFor(["ST-02", "SU-01"], titles)).toEqual(["test/db/b.test.js", "test/unit/a.test.js"]);
    expect(filesFor(["NO-01"], titles)).toEqual([]);
  });
});

describe("結果をまとめる（summarize）", () => {
  test("RN-05 ID ごとにまとめる。同じ ID が1つでも失敗なら失敗。実行しなかったものは入れない", () => {
    const report = {
      testResults: [
        {
          name: "/app/test/unit/a.test.js",
          status: "failed",
          message: "",
          assertionResults: [
            { title: "ST-01 夜", status: "passed", duration: 3.4 },
            { title: "ST-01 朝", status: "failed", duration: 1.2, failureMessages: ["\u001b[31mexpected 1\u001b[39m"] },
            { title: "ST-02 すぐ", status: "skipped" },
            { title: "YT-05 時刻", status: "passed", duration: 2 },
          ],
        },
        { name: "/app/test/db/b.test.js", status: "failed", message: "SyntaxError: x", assertionResults: [] },
      ],
    };
    const r = summarize(report, "/app/");
    expect(Object.keys(r.byId).sort()).toEqual(["ST-01", "YT-05"]);
    expect(r.byId["ST-01"]).toMatchObject({ status: "failed", file: "test/unit/a.test.js", duration: 4 });
    expect(r.byId["ST-01"].tests[1]).toEqual({ title: "ST-01 朝", status: "failed", duration: 1, failures: ["expected 1"] });
    expect(r).toMatchObject({ passed: 1, failed: 1, errors: [{ file: "test/db/b.test.js", message: "SyntaxError: x" }] });
    expect(summarize(null)).toEqual({ byId: {}, errors: [], passed: 0, failed: 0 });
  });
});

describe("画面のテストを分ける", () => {
  test("RN-06 画面のテスト（e2e/*.spec.mjs）は、vitest で実行するファイルに入れない", () => {
    expect(isUnitTestFile("test/unit/a.test.js")).toBe(true);
    expect(isUnitTestFile("test/db/b.test.js")).toBe(true);
    expect(isUnitTestFile("e2e/app.spec.mjs")).toBe(false);
    const titles = readTestTitles();
    expect(titles.some((t) => t.file === "e2e/app.spec.mjs" && t.title.startsWith("UI-01 "))).toBe(true);
    const unitFiles = filesFor(["UI-01", "RN-06"], titles.filter((t) => isUnitTestFile(t.file)));
    expect(unitFiles).toEqual(["test/unit/test-runner.test.js"]);
  });
});
