import path from "node:path";
import { transformWithOxc } from "vite";
import { defineConfig } from "vitest/config";

// 画面（app/ の .js）は JSX で書いてあるので、JSX として読む（画面のテストで使う）
function appJsx() {
  return {
    name: "app-jsx",
    enforce: "pre",
    async transform(code, id) {
      const file = id.split("?")[0];
      if (!file.startsWith(path.join(root, "app") + path.sep) || !file.endsWith(".js")) return null;
      return transformWithOxc(code, id, { lang: "jsx", jsx: { runtime: "automatic" } });
    },
  };
}

// 単体テストの設定。テスト用の DB（flashcard_unittest）を毎回作り直して使う。
// 実行: docker compose exec app npm test（詳しくは docs/testing.md）
const root = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  resolve: {
    alias: {
      "@": root,
      // "server-only" は Next.js の外で読み込むとエラーになるので、空のモジュールに置き換える
      "server-only": path.join(root, "test/stubs/empty.js"),
    },
  },
  plugins: [appJsx()],
  test: {
    environment: "node",
    include: ["test/**/*.test.js"],
    globalSetup: ["test/globalSetup.js"],
    setupFiles: ["test/setup.js"],
    // DB を共有するので、テストファイルは1つずつ順に実行する
    fileParallelism: false,
    testTimeout: 15000,
  },
});
