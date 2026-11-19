// 販売促進用のパンフレット（promo/brochure.html）を PDF にする。e2e コンテナ（Chromium 入り）で動かす:
//   docker compose run --rm e2e node promo/make-pdf.mjs
// 環境変数 PROMO_URL があれば、最後のページの「APP_URL」をその URL に置き換える。
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const html = readFileSync(path.join(HERE, "brochure.html"), "utf8").replace(
  "<span class=\"url\">APP_URL</span>",
  process.env.PROMO_URL ? `<span class="url">${process.env.PROMO_URL}</span>` : ""
);
const tmp = path.join(HERE, ".brochure-build.html");
writeFileSync(tmp, html);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(`file://${tmp}`, { waitUntil: "load" });
  const out = path.join(HERE, "flashcard-brochure.pdf");
  await page.pdf({ path: out, format: "A4", printBackground: true, preferCSSPageSize: true });
  console.log(`PDF: ${path.relative(path.join(HERE, ".."), out)}`);
  // 確かめる用に、各ページの画像も作る（git には入れない）
  if (process.env.PROMO_PREVIEW) {
    const pages = page.locator("section.page");
    for (let i = 0; i < (await pages.count()); i++) await pages.nth(i).screenshot({ path: path.join(HERE, `.preview-${i + 1}.png`) });
  }
} finally {
  await browser.close();
  rmSync(tmp, { force: true });
}
