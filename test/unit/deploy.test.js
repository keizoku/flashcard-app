import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "vitest";
import nextConfig from "../../next.config.mjs";
import { TIMEOUT_MS } from "@/lib/imageGen";

// Vercel に公開するための設定（docs/deploy.md）
const root = path.join(__dirname, "..", "..");

test("DP-01 data/ の語のリストを、公開するファイルに含める（実行中に読むので）", () => {
  const includes = nextConfig.outputFileTracingIncludes ?? {};
  expect(Object.values(includes).flat()).toContain("./data/**/*");
});

test("DP-02 Vercel のビルドでは、先に DB のマイグレーションを当てる", () => {
  const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  expect(pkg.scripts["vercel-build"]).toBe("node scripts/migrate.mjs && next build");
});

test("DP-03 デッキの画面の処理は、絵を自動で作るのを待てる長さまで動ける（Hobby の上限 300 秒以内）", async () => {
  const src = readFileSync(path.join(root, "app/decks/[id]/page.js"), "utf8");
  const m = src.match(/export const maxDuration = (\d+);/);
  expect(m).not.toBeNull();
  const seconds = Number(m[1]);
  expect(seconds * 1000).toBeGreaterThan(TIMEOUT_MS);
  expect(seconds).toBeLessThanOrEqual(300);
});
