"use client";

import { useActionState } from "react";
import Link from "next/link";
import { changePassword, login, requestReset, resendVerify, resetPassword, signup } from "./actions";

const MIN = 8;

function EmailField({ defaultValue, autoFocus = true }) {
  return (
    <label>
      メールアドレス
      <input
        name="email"
        type="email"
        defaultValue={defaultValue}
        autoComplete="email"
        required
        maxLength={254}
        autoFocus={autoFocus}
      />
    </label>
  );
}

function PasswordField({ name = "password", label = "パスワード", autoComplete, hint, autoFocus }) {
  return (
    <label>
      {label}
      <input
        name={name}
        type="password"
        autoComplete={autoComplete}
        required
        minLength={autoComplete === "new-password" ? MIN : undefined}
        maxLength={200}
        autoFocus={autoFocus}
      />
      {hint && <span className="note small field-hint">{hint}</span>}
    </label>
  );
}

function Error({ state }) {
  return state.error ? (
    <p className="error" role="alert">
      {state.error}
    </p>
  ) : null;
}

// メールを送ったあとの表示
function Sent({ email, children }) {
  return (
    <div className="auth-sent" role="status">
      <p>
        <strong>{email}</strong> にメールを送りました。
      </p>
      {children}
      <p className="note small">
        メールが届かないときは、迷惑メールのフォルダも確認してください。
        {process.env.NODE_ENV !== "production" && (
          <>
            {" "}
            （開発中は <a href="http://localhost:8025" target="_blank" rel="noreferrer">開発用の受信箱</a> に届きます）
          </>
        )}
      </p>
    </div>
  );
}

export function LoginForm({ next }) {
  const [state, action, pending] = useActionState(login, { error: null, email: "" });
  return (
    <form action={action} className="add-form auth-form">
      <input type="hidden" name="next" value={next ?? ""} />
      <EmailField defaultValue={state.email} />
      <PasswordField autoComplete="current-password" />
      <Error state={state} />
      {state.unverified && (
        <p className="note small">
          メールが見つからないときは <Link href="/resend">確認メールを送り直す</Link>
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, { error: null, email: "" });
  if (state.sent) {
    return (
      <Sent email={state.email}>
        <p>メールのリンクを開くと登録が完了し、そのままログインします（リンクは24時間有効）。</p>
      </Sent>
    );
  }
  return (
    <form action={action} className="add-form auth-form">
      <EmailField defaultValue={state.email} />
      <PasswordField autoComplete="new-password" hint={`${MIN}文字以上`} />
      <PasswordField name="password2" label="パスワード（確認）" autoComplete="new-password" />
      <Error state={state} />
      <button type="submit" disabled={pending}>
        {pending ? "送信中…" : "登録して確認メールを受け取る"}
      </button>
    </form>
  );
}

export function ResendForm() {
  const [state, action, pending] = useActionState(resendVerify, { error: null, email: "" });
  if (state.sent) {
    return (
      <Sent email={state.email}>
        <p>まだ登録が完了していないアドレスなら、確認メールが届きます。リンクを開くと登録が完了します。</p>
      </Sent>
    );
  }
  return (
    <form action={action} className="add-form auth-form">
      <EmailField defaultValue={state.email} />
      <Error state={state} />
      <button type="submit" disabled={pending}>
        {pending ? "送信中…" : "確認メールを送り直す"}
      </button>
    </form>
  );
}

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, { error: null, email: "" });
  if (state.sent) {
    return (
      <Sent email={state.email}>
        <p>登録されているアドレスなら、パスワードを再設定するリンクが届きます（リンクは1時間有効）。</p>
      </Sent>
    );
  }
  return (
    <form action={action} className="add-form auth-form">
      <EmailField defaultValue={state.email} />
      <Error state={state} />
      <button type="submit" disabled={pending}>
        {pending ? "送信中…" : "再設定のメールを送る"}
      </button>
    </form>
  );
}

export function ResetForm({ token }) {
  const [state, action, pending] = useActionState(resetPassword.bind(null, token), { error: null });
  return (
    <form action={action} className="add-form auth-form">
      <PasswordField label="新しいパスワード" autoComplete="new-password" hint={`${MIN}文字以上`} autoFocus />
      <PasswordField name="password2" label="新しいパスワード（確認）" autoComplete="new-password" />
      <Error state={state} />
      {state.expired && (
        <p className="note small">
          <Link href="/forgot-password">再設定のメールをもう一度送る</Link>
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "設定中…" : "パスワードを設定してログイン"}
      </button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, { error: null, saved: false, version: 0 });
  return (
    // 変更できたら、入力欄を空にする
    <form action={action} className="add-form auth-form" key={state.version}>
      <PasswordField name="current" label="今のパスワード" autoComplete="current-password" />
      <PasswordField label="新しいパスワード" autoComplete="new-password" hint={`${MIN}文字以上`} />
      <PasswordField name="password2" label="新しいパスワード（確認）" autoComplete="new-password" />
      <Error state={state} />
      {state.saved && (
        <p className="success" role="status">
          パスワードを変更しました。ほかの端末のログインは切れました。
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? "変更中…" : "パスワードを変更"}
      </button>
    </form>
  );
}
