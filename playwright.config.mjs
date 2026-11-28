import { defineConfig, devices } from "@playwright/test";
import { e2eDatabaseUrl } from "./e2e/db.mjs";

// 画面のテスト（E2E）の設定。e2e コンテナ（docker compose run --rm e2e）の中で動かす。
// テスト用の DB（flashcard_e2e）につないだアプリを、ポート 3200 で別に起動して、Chromium で操作する。
// 詳しくは docs/testing.md
const PORT = 3200;

export default defineConfig({
  testDir: "e2e",
  testMatch: "*.spec.mjs",
  // DB を共有するので、1つずつ順に実行する
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  globalSetup: "./e2e/global-setup.mjs",
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1100, height: 800 } } }],
  webServer: {
    command: `npx next dev --port ${PORT} --hostname 0.0.0.0`,
    url: `http://localhost:${PORT}/login`,
    timeout: 180_000,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "pipe",
    env: {
      DATABASE_URL: e2eDatabaseUrl(),
      APP_URL: `http://localhost:${PORT}`,
      NEXT_TELEMETRY_DISABLED: "1",
      // 管理者の画面のテスト（UI-27）で使う管理者
      ADMIN_USERNAMES: "admin",
    },
  },
});
