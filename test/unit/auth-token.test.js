import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { hashToken, newToken } from "@/lib/auth";

test("SS-08 newToken は推測できない長さのランダムな値", () => {
  const a = newToken();
  expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  expect(newToken()).not.toBe(a);
});

test("SS-09 hashToken は sha256 の16進（DB にはこれだけを保存する）", () => {
  expect(hashToken("abc")).toBe(createHash("sha256").update("abc").digest("hex"));
});
