import { expect, test } from "vitest";
import { burnPasswordCheck, checkPasswordRule, hashPassword, verifyPassword } from "@/lib/password";

test("PW-08 checkPasswordRule は 8〜200 文字", () => {
  expect(checkPasswordRule("1234567")).toMatch(/8文字以上/);
  expect(checkPasswordRule("12345678")).toBeNull();
  expect(checkPasswordRule("x".repeat(200))).toBeNull();
  expect(checkPasswordRule("x".repeat(201))).toMatch(/200文字以内/);
});

test("PW-09 ハッシュは scrypt$salt$hash の形で、毎回ちがう salt になる", async () => {
  const a = await hashPassword("correct horse");
  const b = await hashPassword("correct horse");
  expect(a).toMatch(/^scrypt\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  expect(a).not.toBe(b);
  expect(a).not.toContain("correct horse");
});

test("PW-10 verifyPassword", async () => {
  const stored = await hashPassword("correct horse");
  expect(await verifyPassword("correct horse", stored)).toBe(true);
  expect(await verifyPassword("wrong horse", stored)).toBe(false);
  expect(await verifyPassword("correct horse", "plain")).toBe(false);
  expect(await verifyPassword("correct horse", null)).toBe(false);
  expect(await verifyPassword("x", "bcrypt$a$b")).toBe(false);
});

test("PW-11 burnPasswordCheck はいつも false", async () => {
  expect(await burnPasswordCheck("anything")).toBe(false);
});
