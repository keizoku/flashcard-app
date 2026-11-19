import { Pool } from "pg";

// 開発中のホットリロードで接続が増えすぎないよう、1つの Pool を使い回す
const globalForDb = globalThis;

export const pool =
  globalForDb.pgPool ??
  new Pool({ connectionString: process.env.DATABASE_URL });

if (!globalForDb.pgPool) {
  // DB が再起動したときなど、待機中の接続のエラーでアプリが落ちないようにする
  pool.on("error", (err) => console.error("PostgreSQL pool error:", err.message));
}

if (process.env.NODE_ENV !== "production") globalForDb.pgPool = pool;
