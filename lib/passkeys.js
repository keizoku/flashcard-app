import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { isAllowedEmail } from "./allowlist.js";
import { appOrigin } from "./appUrl.js";
import { pool } from "./db.js";

// パスキー（パスワードの代わりに、端末の指紋・顔・PIN でログインする。WebAuthn）。
// 端末の中で作った鍵の、公開鍵だけを保存する（秘密の鍵は端末から出ない）。
// 登録・ログインのたびに、1回だけ使える「合言葉」（challenge）を出し、端末はそれに署名して返す。
// 合言葉は DB に保存し、ブラウザの Cookie にはその場所を示すランダムな値（token）だけを入れる。
// 詳しくは docs/auth.md の「パスキー」

export const MAX_PASSKEY_NAME_LENGTH = 30;
const CHALLENGE_MINUTES = 5;
const LOGIN_ERROR = "パスキーでログインできませんでした";
const REGISTER_ERROR = "パスキーを登録できませんでした。もう一度お試しください";

// このアプリのドメインと URL（APP_URL から。lib/appUrl.js）。パスキーはこのドメインに結びつき、ほかのサイトでは使えない
function relyingParty() {
  const url = new URL(appOrigin());
  return { rpID: url.hostname, origin: url.origin, rpName: "フラッシュカード" };
}

const hash = (token) => createHash("sha256").update(String(token)).digest("hex");

// 端末に渡す利用者の ID。同じ人ならいつも同じ（同じ端末にもう一度登録すると上書きになる）。
// DB の番号をそのまま見せないよう、ハッシュにする
const userHandle = (userId) => createHash("sha256").update(`flashcard-user:${userId}`).digest().subarray(0, 16);

async function saveChallenge(challenge, purpose, userId = null) {
  const token = randomBytes(32).toString("base64url");
  await pool.query("DELETE FROM passkey_challenges WHERE expires_at < now()");
  await pool.query(
    `INSERT INTO passkey_challenges (token_hash, challenge, purpose, user_id, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
    [hash(token), challenge, purpose, userId, CHALLENGE_MINUTES]
  );
  return token;
}

// 合言葉を取り出して消す（成功しても失敗しても、1回しか使えない）
async function takeChallenge(token, purpose, userId = null) {
  if (!token) return null;
  const { rows } = await pool.query(
    "DELETE FROM passkey_challenges WHERE token_hash = $1 RETURNING challenge, purpose, user_id, expires_at > now() AS valid",
    [hash(token)]
  );
  const c = rows[0];
  if (!c || !c.valid || c.purpose !== purpose || (c.user_id ?? null) !== userId) return null;
  return c.challenge;
}

// ---- 登録 ----------------------------------------------------------------
// user: { id, email, displayName? }。返す値: { options（ブラウザに渡す）, token（Cookie に入れる）}
export async function beginPasskeyRegistration(user) {
  const { rpID, rpName } = relyingParty();
  const { rows } = await pool.query("SELECT id, transports FROM passkeys WHERE user_id = $1", [user.id]);
  const options = await generateRegistrationOptions({
    rpName,
    rpID,
    userName: user.email,
    userDisplayName: user.displayName || user.email,
    userID: userHandle(user.id),
    attestationType: "none",
    // 端末に保存するパスキー（メールアドレスを入れずにログインできる）
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    excludeCredentials: rows.map((r) => ({ id: r.id, transports: r.transports })),
  });
  return { options, token: await saveChallenge(options.challenge, "register", user.id) };
}

export function cleanPasskeyName(name) {
  const n = String(name ?? "").trim().slice(0, MAX_PASSKEY_NAME_LENGTH);
  return n || "パスキー";
}

// 端末の答えを確かめて保存する。{ passkey: { id, name } } / { error }
export async function finishPasskeyRegistration(userId, token, response, name) {
  const challenge = await takeChallenge(token, "register", userId);
  if (!challenge) return { error: REGISTER_ERROR };
  const { rpID, origin } = relyingParty();
  let result;
  try {
    result = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: false,
    });
  } catch {
    return { error: REGISTER_ERROR };
  }
  if (!result.verified) return { error: REGISTER_ERROR };
  const { credential } = result.registrationInfo;
  const { rows } = await pool.query(
    `INSERT INTO passkeys (id, user_id, public_key, counter, transports, name)
     VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING RETURNING id, name`,
    [credential.id, userId, Buffer.from(credential.publicKey), credential.counter, credential.transports ?? [], cleanPasskeyName(name)]
  );
  if (!rows[0]) return { error: "このパスキーは、もう登録されています" };
  return { passkey: rows[0] };
}

// ---- ログイン --------------------------------------------------------------
// メールアドレスは聞かない。端末が、このドメインのパスキーを選ばせる
export async function beginPasskeyLogin() {
  const { rpID } = relyingParty();
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  return { options, token: await saveChallenge(options.challenge, "login") };
}

// 端末の答えを確かめる。{ userId } / { error }
export async function finishPasskeyLogin(token, response) {
  const challenge = await takeChallenge(token, "login");
  if (!challenge || typeof response?.id !== "string") return { error: LOGIN_ERROR };
  const { rows } = await pool.query(
    `SELECT p.id, p.user_id, p.public_key, p.counter, p.transports, u.email, u.verified_at
     FROM passkeys p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
    [response.id]
  );
  const p = rows[0];
  // 登録が完了していない人・使える人でなくなった人は、パスキーがあってもログインさせない
  if (!p || !p.verified_at || !isAllowedEmail(p.email)) return { error: LOGIN_ERROR };

  const { rpID, origin } = relyingParty();
  let result;
  try {
    result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: { id: p.id, publicKey: new Uint8Array(p.public_key), counter: Number(p.counter), transports: p.transports },
      requireUserVerification: false,
    });
  } catch {
    // 署名が合わない、回数が戻った（鍵の複製の疑い）など
    return { error: LOGIN_ERROR };
  }
  if (!result.verified) return { error: LOGIN_ERROR };
  await pool.query("UPDATE passkeys SET counter = $2, last_used_at = now() WHERE id = $1", [
    p.id,
    result.authenticationInfo.newCounter,
  ]);
  return { userId: p.user_id };
}

// ---- 一覧・削除（自分のものだけ） ------------------------------------------
export async function listPasskeys(userId) {
  const { rows } = await pool.query(
    `SELECT id, name, created_at AS "createdAt", last_used_at AS "lastUsedAt"
     FROM passkeys WHERE user_id = $1 ORDER BY created_at, id`,
    [userId]
  );
  return rows;
}

export async function deletePasskey(userId, id) {
  const { rowCount } = await pool.query("DELETE FROM passkeys WHERE id = $1 AND user_id = $2", [String(id), userId]);
  return { deleted: rowCount > 0 };
}
