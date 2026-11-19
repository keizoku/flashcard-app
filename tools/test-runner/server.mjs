// テスト実行ツールのサーバー。テスト仕様書を読み、ブラウザから選んだテストを vitest で実行する。
//   起動: docker compose exec app npm run test:ui → http://localhost:3100
// テストはテスト用の DB（flashcard_unittest）を使う。開発用の DB には触れない。
// テストを実行できるので、このサーバーはこのパソコンからだけ開ける（compose.yaml で 127.0.0.1 に限っている）
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readTestTitles, SPEC_PATH } from "../../test/specDoc.mjs";
import { filesFor, isUnitTestFile, namePattern, parseSpec, stripAnsi, summarize } from "./lib.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "../..");
const PORT = Number(process.env.TEST_RUNNER_PORT ?? 3100);
const MAX_BODY = 100_000;

let running = null; // 実行中のテスト（同時には1つだけ。テスト用の DB を作り直すため）

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > MAX_BODY) reject(new Error("too large"));
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

// 仕様書と、ID ごとのテストの名前
function specPayload() {
  const spec = parseSpec(readFileSync(SPEC_PATH, "utf8"));
  const titles = {};
  const e2e = {}; // 画面のテスト（e2e/）。このツールでは実行しない
  for (const t of readTestTitles()) {
    const id = t.title.split(" ")[0];
    const into = isUnitTestFile(t.file) ? titles : e2e;
    (into[id] ??= { file: t.file, names: [] }).names.push(t.title.slice(id.length + 1));
  }
  return { ...spec, titles, e2e };
}

// vitest を実行して、ID ごとの結果を返す。ids が null なら全部
function runVitest(ids) {
  const dir = mkdtempSync(path.join(tmpdir(), "test-runner-"));
  const out = path.join(dir, "result.json");
  const args = ["vitest", "run", "--reporter=json", `--outputFile=${out}`];
  if (ids) {
    args.push("-t", namePattern(ids), ...filesFor(ids, readTestTitles().filter((t) => isUnitTestFile(t.file))));
  }
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn("npx", args, { cwd: ROOT, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" } });
    let log = "";
    const keep = (chunk) => {
      log = (log + chunk).slice(-20_000);
    };
    child.stdout.on("data", keep);
    child.stderr.on("data", keep);
    child.on("close", (code) => {
      let report = null;
      try {
        report = JSON.parse(readFileSync(out, "utf8"));
      } catch {
        // 設定の誤りなどで、結果のファイルができなかった
      }
      rmSync(dir, { recursive: true, force: true });
      const summary = summarize(report, ROOT.endsWith("/") ? ROOT : `${ROOT}/`);
      resolve({
        ...summary,
        ok: code === 0,
        seconds: Math.round((Date.now() - started) / 100) / 10,
        finishedAt: new Date().toISOString(),
        log: report ? "" : stripAnsi(log),
      });
    });
  });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      return send(res, 200, readFileSync(path.join(HERE, "index.html"), "utf8"), "text/html; charset=utf-8");
    }
    if (req.method === "GET" && url.pathname === "/api/spec") {
      return send(res, 200, specPayload());
    }
    if (req.method === "POST" && url.pathname === "/api/run") {
      if (running) return send(res, 409, { error: "ほかのテストを実行中です。終わってから、もう一度押してください" });
      const body = JSON.parse((await readBody(req)) || "{}");
      const ids = body.all ? null : Array.isArray(body.ids) ? body.ids.map(String) : [];
      if (ids && ids.length === 0) return send(res, 400, { error: "実行するテストを選んでください" });
      try {
        running = runVitest(ids);
        return send(res, 200, await running);
      } finally {
        running = null;
      }
    }
    send(res, 404, { error: "not found" });
  } catch (err) {
    send(res, 500, { error: err.message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`テスト実行ツール: http://localhost:${PORT} （止めるときは Ctrl+C）`);
});
