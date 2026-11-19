import { describe, expect, test } from "vitest";
import { countCoverage, coverageTable, ID_PATTERN, readCoverageTable, readSpecSections, readTestTitles } from "../specDoc.mjs";

// テスト仕様書（docs/test-spec.md）とテストのファイルが食い違っていないかを確かめる

describe("テスト仕様書（docs/test-spec.md）", () => {
  test("DOC-03 テストの ID と仕様書の ID が同じ（書き忘れ・消し忘れがない）", () => {
    const titles = readTestTitles();
    const withoutId = titles.filter((t) => !/^[A-Z]{2,3}-\d{2} /.test(t.title));
    expect(withoutId, "ID のないテスト（名前の先頭に「XX-00 」を付ける）").toEqual([]);

    const testIds = titles.map((t) => t.title.slice(0, t.title.indexOf(" ")));
    const dup = testIds.filter((id, i) => testIds.indexOf(id) !== i);
    expect(dup, "同じ ID のテストが2つある").toEqual([]);

    const sections = readSpecSections();
    const specIds = new Set(sections.flatMap((s) => s.rows.flatMap((r) => r.ids)));
    expect(testIds.filter((id) => !specIds.has(id)).sort(), "仕様書に書いていないテスト").toEqual([]);
    expect([...specIds].filter((id) => !testIds.includes(id)).sort(), "仕様書にあるが、テストがない ID").toEqual([]);

    const broken = sections.flatMap((s) => s.rows.filter((r) => !r.untested && r.ids.length === 0));
    expect(broken.map((r) => `${r.line}行目: ${r.cell}`), "「テスト」の列は ID か「未」").toEqual([]);
  });

  test("DOC-04 網羅の状況の数が、各節の行の数と同じ", () => {
    expect(readCoverageTable(), "数が違うときは docker compose exec app node test/specDoc.mjs の結果に書き換える")
      .toBe(coverageTable(countCoverage()));
  });

  test("DOC-05 ID の形は「英大文字2〜3字-2桁の数字」", () => {
    expect("ST-01 x".match(ID_PATTERN)).toEqual(["ST-01"]);
    expect("DOC-03、SS-04".match(ID_PATTERN)).toEqual(["DOC-03", "SS-04"]);
    expect("未".match(ID_PATTERN)).toBeNull();
  });
});
