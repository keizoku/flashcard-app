// テスト用 DB の接続先。本番・開発の DB を消さないよう、名前が _test で終わるものしか使わない
export function testDatabaseUrl() {
  const fromEnv = process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL ?? "postgres://flashcard:flashcard@db:5432/flashcard";
  const url = new URL(fromEnv ?? base);
  if (!fromEnv) url.pathname = "/flashcard_unittest";
  if (!/_(unit)?test$/.test(url.pathname)) {
    throw new Error(`テスト用 DB の名前は _test / _unittest で終わる必要があります: ${url.pathname}`);
  }
  return url.toString();
}
