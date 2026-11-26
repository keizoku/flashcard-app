"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { rpIdFitsHost } from "@/lib/appUrl";
import {
  completePasskeyLogin,
  completePasskeyRegistration,
  removePasskey,
  startPasskeyLogin,
  startPasskeyRegistration,
} from "./passkeyActions";

// パスキーの画面の部品。端末とのやりとり（指紋・顔・PIN の確認）は、ブラウザが出す画面で行う

// アプリの設定（APP_URL）のドメインと、開いているページのドメインが違うと、ブラウザはパスキーを使わせない。
// そのときは、原因がわかる言葉で知らせる
class WrongDomainError extends Error {}
function checkDomain(rpId) {
  if (!rpIdFitsHost(rpId, window.location.hostname)) {
    throw new WrongDomainError(
      `アプリの設定（APP_URL）のドメイン「${rpId}」と、開いているページ「${window.location.hostname}」が違うため、パスキーを使えません。` +
        "管理する人が APP_URL を直してください"
    );
  }
}

// 端末の画面で「キャンセル」を押したときなど
function messageOf(err, fallback) {
  if (err instanceof WrongDomainError) return err.message;
  if (err?.name === "NotAllowedError" || err?.name === "AbortError") return "キャンセルしました（または時間切れです）";
  if (err?.name === "InvalidStateError") return "この端末のパスキーは、もう登録されています";
  return fallback;
}

// パスキーを使えるブラウザか（画面の最初の表示では、わかるまで出さない）
function useSupported() {
  const [supported, setSupported] = useState(null);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);
  return supported;
}

// ---- ログインの画面: 「パスキーでログイン」 ----
export function PasskeyLoginButton({ next }) {
  const supported = useSupported();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  if (!supported) return null;

  async function login() {
    setPending(true);
    setError(null);
    try {
      const options = await startPasskeyLogin();
      checkDomain(options.rpId);
      const answer = await startAuthentication({ optionsJSON: options });
      // うまくいけば、サーバーが元の画面へ移す（ここには戻らない）
      const r = await completePasskeyLogin(answer, next);
      if (r?.error) setError(r.error);
    } catch (err) {
      if (err?.digest?.startsWith?.("NEXT_REDIRECT")) throw err;
      setError(messageOf(err, "パスキーでログインできませんでした"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="passkey-login">
      <p className="or-line">または</p>
      <button type="button" className="secondary-button" onClick={login} disabled={pending}>
        {pending ? "確認中…" : "パスキーでログイン"}
      </button>
      <p className="note small">登録した端末の指紋・顔・PIN でログインします（アカウントの画面で登録できます）。</p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

// ---- アカウントの画面: 登録したパスキーの一覧・登録・削除 ----
// passkeys: [{ id, name, createdAt, lastUsedAt }]
export function PasskeyManager({ passkeys, maxNameLength }) {
  const supported = useSupported();
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  async function register() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const options = await startPasskeyRegistration();
      if (options?.error) {
        setError(options.error);
        return;
      }
      checkDomain(options.rp?.id);
      const answer = await startRegistration({ optionsJSON: options });
      const r = await completePasskeyRegistration(answer, name);
      if (r.error) {
        setError(r.error);
      } else {
        setName("");
        setMessage("パスキーを登録しました。次からは、ログインの画面の「パスキーでログイン」で入れます");
        router.refresh();
      }
    } catch (err) {
      setError(messageOf(err, "パスキーを登録できませんでした"));
    } finally {
      setPending(false);
    }
  }

  async function remove(p) {
    if (!window.confirm(`パスキー「${p.name}」を削除します。その端末ではパスキーでログインできなくなります。`)) return;
    setError(null);
    setMessage(null);
    const r = await removePasskey(p.id);
    if (r.error) setError(r.error);
    else router.refresh();
  }

  const day = (d) => (d ? new Date(d).toLocaleDateString("ja-JP") : "まだ使っていない");

  return (
    <div className="passkeys">
      <p className="note small">
        パスキーを登録すると、パスワードを入れずに、この端末の指紋・顔・PIN でログインできます。
        パスワードも今までどおり使えます。
      </p>
      {passkeys.length > 0 ? (
        <ul className="passkey-list">
          {passkeys.map((p) => (
            <li key={p.id}>
              <span>
                <strong>{p.name}</strong>
                <span className="note small">
                  登録 {day(p.createdAt)}・最後に使った日 {day(p.lastUsedAt)}
                </span>
              </span>
              <button type="button" className="link-button danger" onClick={() => remove(p)}>
                削除
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="note small">まだ登録していません。</p>
      )}
      {supported === false ? (
        <p className="note small">このブラウザでは、パスキーを使えません。</p>
      ) : (
        <div className="add-form auth-form">
          <label>
            名前（任意。どの端末かわかるように）
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={maxNameLength}
              placeholder="iPhone・Mac など"
            />
          </label>
          <button type="button" onClick={register} disabled={pending || !supported}>
            {pending ? "確認中…" : "この端末にパスキーを登録"}
          </button>
        </div>
      )}
      {message && <p className="success small">{message}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
