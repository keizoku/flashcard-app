import { expect, test } from "vitest";
import { normalizeEmail } from "@/lib/accounts";

test("AC-12 normalizeEmail は前後の空白を除いて小文字にする", () => {
  expect(normalizeEmail("  Foo@Example.COM ")).toBe("foo@example.com");
});

test.each([[""], [null], ["foo"], ["foo@bar"], ["a b@example.com"], ["@example.com"], [`${"a".repeat(250)}@x.com`]])(
  "AC-13 正しくないアドレス %s は null",
  (input) => {
    expect(normalizeEmail(input)).toBeNull();
  }
);
