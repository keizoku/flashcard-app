import { describe, expect, test } from "vitest";
import { hashRecoveryCode, newRecoveryCode, normalizeRecoveryCode } from "@/lib/recovery";
import { checkUsernameRule, normalizeUsername } from "@/lib/username";

// ログインの ID の決まりと、復旧コード（パスワードを忘れたときの合言葉）

describe("ログインの ID", () => {
  test("UN-01 前後の空白を除いて小文字にする。英小文字・数字・「_」「-」で3〜20文字、最初は英小文字か数字", () => {
    expect(normalizeUsername("  Taro_01 ")).toBe("taro_01");
    for (const ok of ["abc", "a".repeat(20), "taro-01", "1st_user", "fcadmin"]) {
      expect(checkUsernameRule(ok)).toBeNull();
    }
    for (const bad of ["", "ab", "a".repeat(21), "_taro", "-taro", "taro@example.com", "たろう", "ta ro", "Taro"]) {
      expect(checkUsernameRule(bad)).toMatch(/ID は/);
    }
  });

  test("UN-02 「guest」で始まる ID は使えない（おためしユーザーのため）", () => {
    for (const bad of ["guest", "guest-1", "guests", "guest_abc"]) {
      expect(checkUsernameRule(bad)).toMatch(/guest/);
    }
    expect(checkUsernameRule("myguest")).toBeNull();
  });
});

describe("復旧コード", () => {
  test("UN-03 コードは4文字×4つ。読み間違えやすい文字（0・O・1・I・L・U）は使わない。毎回ちがう", () => {
    const codes = new Set();
    for (let i = 0; i < 200; i++) {
      const c = newRecoveryCode();
      expect(c).toMatch(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
      expect(c).not.toMatch(/[01OILU]/);
      codes.add(c);
    }
    expect(codes.size).toBe(200);
  });

  test("UN-04 ハッシュは、小文字・空白・「-」のちがいを気にしない。コードそのものは入っていない。ちがうコードなら別のハッシュ", () => {
    const c = newRecoveryCode();
    expect(normalizeRecoveryCode(c.toLowerCase().replace(/-/g, " "))).toBe(c.replace(/-/g, ""));
    expect(hashRecoveryCode(c.toLowerCase())).toBe(hashRecoveryCode(c));
    expect(hashRecoveryCode(c)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashRecoveryCode(c)).not.toContain(c.replace(/-/g, ""));
    expect(hashRecoveryCode(c)).not.toBe(hashRecoveryCode(newRecoveryCode()));
  });
});
