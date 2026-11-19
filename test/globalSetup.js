import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { testDatabaseUrl } from "./dbUrl.js";

// テストの最初に1回だけ実行する: テスト用の DB を作り直して、db/migrations を最初から当てる。
// （マイグレーションが空の DB に正しく当たるかの確認にもなる）
export default async function setup() {
  const url = new URL(testDatabaseUrl());
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
    const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
    for (const file of files) {
      try {
        await client.query(await readFile(path.join(dir, file), "utf8"));
      } catch (err) {
        throw new Error(`migration ${file} failed: ${err.message}`);
      }
    }
  } finally {
    await client.end();
  }
}
