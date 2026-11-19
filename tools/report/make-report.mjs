// テスト結果レポートを作る。e2e コンテナ（docker compose run --rm e2e）の中で動かす。
//   1. 単体テスト（vitest）を全部実行する
//   2. 画面のテスト（Playwright）を全部実行する。各手順のスクリーンショットが付いてくる
//   3. テスト実行ツール（tools/test-runner）で「全部実行」した画面のスクリーンショットを撮る
//   4. テスト仕様書（docs/test-spec.md）と結果を合わせて、1つの HTML（画像も中に入れる）にする
// できたもの: reports/<日時>/index.html（git には入れない）
// テストはテスト用の DB（flashcard_unittest / flashcard_e2e）だけを使う。開発用の DB には触れない。
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SPEC_PATH } from "../../test/specDoc.mjs";
import { parseSpec, summarize } from "../test-runner/lib.mjs";
import { renderReport } from "./render.mjs";
import { summarizePlaywright } from "./results.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "../..");
const RUNNER_PORT = 3101;

function log(text) {
  console.log(`\n▶ ${text}`);
}

// コマンドを実行し、終わるまで待つ（出力はそのまま表示する）
function run(cmd, args, env = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
    child.on("close", (code) => resolve({ code, seconds: Math.round((Date.now() - started) / 100) / 10 }));
  });
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function git(...args) {
  const r = spawnSync("git", ["-c", `safe.directory=${ROOT}`, "-C", ROOT, ...args], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// 日本時間の「2026-11-18 09:30:15」と「20261118-093015」
function jstStamp(date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const { year, month, day, hour, minute, second } = parts;
  return { text: `${year}-${month}-${day} ${hour}:${minute}:${second}`, dir: `${year}${month}${day}-${hour}${minute}${second}` };
}

// テスト実行ツールを起動し、ブラウザで「全部実行」を押した結果の画面を撮る
async function captureTestRunner() {
  const { chromium } = await import("@playwright/test");
  const server = spawn("node", ["tools/test-runner/server.mjs"], {
    cwd: ROOT,
    env: { ...process.env, TEST_RUNNER_PORT: String(RUNNER_PORT) },
    stdio: "ignore",
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, locale: "ja-JP" });
    const url = `http://localhost:${RUNNER_PORT}/`;
    for (let i = 0; ; i++) {
      try {
        await page.goto(url);
        break;
      } catch (err) {
        if (i > 50) throw err;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    await page.locator("#run-all").click();
    await page.waitForFunction(() => document.querySelector("#run-all")?.disabled === false, null, { timeout: 180_000 });
    await page.evaluate(() => window.scrollTo(0, 0));
    return { image: (await page.screenshot({ fullPage: false })).toString("base64"), status: await page.locator("#status-line").textContent() };
  } finally {
    await browser.close();
    server.kill();
  }
}

async function main() {
  const startedAt = new Date();
  const stamp = jstStamp(startedAt);
  const outDir = path.join(ROOT, "reports", stamp.dir);
  const work = mkdtempSync(path.join(tmpdir(), "report-"));

  log("単体テスト（vitest）を実行します");
  const vitestFile = path.join(work, "vitest.json");
  const unitRun = await run("npx", ["vitest", "run", "--reporter=default", "--reporter=json", `--outputFile.json=${vitestFile}`], {
    NO_COLOR: "1",
  });
  const unit = summarize(readJson(vitestFile), `${ROOT}/`);

  log("画面のテスト（Playwright）を実行します");
  const pwFile = path.join(work, "playwright.json");
  const e2eRun = await run("npx", ["playwright", "test", "--reporter=list,json"], { PLAYWRIGHT_JSON_OUTPUT_NAME: pwFile });
  const e2e = summarizePlaywright(readJson(pwFile));

  log("テスト実行ツールの画面を撮ります（単体テストをもう一度、ツールから全部実行します）");
  let runner = null;
  try {
    runner = await captureTestRunner();
  } catch (err) {
    console.error(`  テスト実行ツールの画面を撮れませんでした: ${err.message}`);
  }

  const spec = parseSpec(readFileSync(SPEC_PATH, "utf8"));
  const status = git("status", "--porcelain");
  const html = renderReport({
    createdAt: stamp.text,
    commit: {
      hash: git("rev-parse", "--short", "HEAD"),
      subject: git("log", "-1", "--format=%s"),
      branch: git("rev-parse", "--abbrev-ref", "HEAD"),
      dirty: status === null ? null : status.length > 0,
    },
    env: { node: process.version, platform: `${process.platform}/${process.arch}` },
    spec,
    unit: { ...unit, ok: unitRun.code === 0, seconds: unitRun.seconds },
    e2e: { ...e2e, ok: e2eRun.code === 0, seconds: e2eRun.seconds },
    runner,
  });

  mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, "index.html");
  writeFileSync(file, html);
  rmSync(work, { recursive: true, force: true });

  const ok = unitRun.code === 0 && e2eRun.code === 0;
  console.log(`\n${ok ? "✓ すべて成功" : "✗ 失敗したテストがあります"}`);
  console.log(`レポート: ${path.relative(ROOT, file)}（ブラウザで開いてください）`);
  process.exitCode = ok ? 0 : 1;
}

if (!existsSync(SPEC_PATH)) throw new Error(`テスト仕様書がありません: ${SPEC_PATH}`);
await main();
