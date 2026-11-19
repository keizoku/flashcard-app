import base from "../playwright.config.mjs";

// 販売促進用の画面写真を撮る（テストではない）。画面のテストと同じしくみ（テスト用の DB・ポート 3200 のアプリ）を使う。
//   docker compose run --rm e2e npx playwright test -c promo/playwright.config.mjs
export default {
  ...base,
  testDir: ".",
  testMatch: "capture.mjs",
  globalSetup: "../e2e/global-setup.mjs",
  // アプリはリポジトリの一番上で起動する
  webServer: { ...base.webServer, cwd: ".." },
};
