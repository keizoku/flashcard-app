import "server-only";
import { KEY_LENGTH, verifyPassword } from "./passwordHash.js";

// パスワードの決まりとハッシュは passwordHash.js（Next.js の外の道具からも使うため、分けてある）
export { checkPasswordRule, hashPassword, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, verifyPassword } from "./passwordHash.js";

// 登録されていないメールアドレスでも、同じくらい時間をかける（登録の有無を推測されにくくする）
const DUMMY_HASH = `scrypt$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(KEY_LENGTH).toString("base64")}`;
export async function burnPasswordCheck(password) {
  await verifyPassword(password, DUMMY_HASH);
  return false;
}
