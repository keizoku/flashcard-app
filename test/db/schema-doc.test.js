import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, test } from "vitest";
import { pool } from "@/lib/db";

// テーブル定義書（docs/tables.md）が、マイグレーションを全部当てた DB と同じかを確かめる。
// テーブルや列を変えたのに定義書を直し忘れると、ここで失敗する

// schema_migrations は scripts/migrate.mjs が作る（テスト用の DB にはない）
const NOT_IN_TEST_DB = new Set(["schema_migrations"]);

// information_schema の型名 → 定義書での書き方
const TYPE_NAMES = { "timestamp with time zone": "timestamptz" };

// 定義書から { テーブル名: [{ name, type, nullable }] } を読み取る
function readDoc() {
  const md = readFileSync(path.join(process.cwd(), "docs/tables.md"), "utf8");
  const tables = {};
  let current = null;
  for (const line of md.split("\n")) {
    const heading = line.match(/^## ([a-z_]+)\s*$/);
    if (heading) {
      current = tables[heading[1]] = [];
      continue;
    }
    if (/^## /.test(line)) current = null;
    if (!current) continue;
    const cells = line.match(/^\| (.+) \|$/)?.[1].split(" | ").map((c) => c.trim());
    if (!cells || cells[0] === "列" || /^-+$/.test(cells[0])) continue;
    current.push({ name: cells[0], type: cells[1], nullable: cells[2] === "○" });
  }
  return tables;
}

async function readDb() {
  const { rows } = await pool.query(
    `SELECT table_name, column_name, data_type, is_nullable = 'YES' AS nullable
     FROM information_schema.columns WHERE table_schema = 'public'
     ORDER BY table_name, ordinal_position`
  );
  const tables = {};
  for (const r of rows) {
    (tables[r.table_name] ??= []).push({
      name: r.column_name,
      type: TYPE_NAMES[r.data_type] ?? r.data_type,
      nullable: r.nullable,
    });
  }
  return tables;
}

const sortByName = (cols) => [...cols].sort((a, b) => a.name.localeCompare(b.name));

describe("テーブル定義書（docs/tables.md）", () => {
  test("DOC-01 DB のテーブルが、すべて定義書にある（余分もない）", async () => {
    const doc = Object.keys(readDoc()).filter((t) => !NOT_IN_TEST_DB.has(t));
    expect(doc.sort()).toEqual(Object.keys(await readDb()).sort());
  });

  test("DOC-02 各テーブルの列の名前・型・NULL の可否が DB と同じ", async () => {
    const doc = readDoc();
    const db = await readDb();
    for (const [table, columns] of Object.entries(db)) {
      expect(sortByName(doc[table] ?? []), `テーブル ${table}`).toEqual(sortByName(columns));
    }
  });
});
