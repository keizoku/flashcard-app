import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { e2eDatabaseUrl } from "./db.mjs";

// 画面のテストの最初に1回だけ: テスト用の DB（flashcard_e2e）を作り直して、db/migrations を当てる
// （test/globalSetup.js と同じ手順。アプリはこの DB につないで起動する）
export default async function setup() {
  const url = new URL(e2eDatabaseUrl());
  const dbName = url.pathname.slice(1);
  const admin = new pg.Client({ connectionString: Object.assign(new URL(url), { pathname: "/postgres" }).toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const dir = path.join(process.cwd(), "db", "migrations");
    for (const file of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
      await client.query(await readFile(path.join(dir, file), "utf8"));
    }
  } finally {
    await client.end();
  }
}
