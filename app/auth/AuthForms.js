"use client";

import { useActionState } from "react";
import Link from "next/link";
import { TermsCheckbox } from "@/app/agree/AgreeForm";
import { USERNAME_HINT, USERNAME_MAX } from "@/lib/username";
import { changePassword, login, recoverPassword, regenerateRecoveryCode, signup } from "./actions";

const MIN = 8;
const LOGIN_ID_MAX = 254; // メールアドレスの長さの上限

// maxLength: 新規登録は ID の決まりの長さまで。ログイン・パスワードを忘れたときは、
// 前からのアカウントの ID（メールアドレス）も入るよう長くする
function UsernameField({ defaultValue, autoFocus = true, hint, maxLength = LOGIN_ID_MAX }) {
  return (
    <label>
      ID
      <input
        name="username"
        type="text"
        defaultValue={defaultValue}
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        maxLength={maxLength}
        autoFocus={autoFocus}
      />
      {hint && <span className="note small field-hint">{hint}</span>}
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

// 復旧コードを一度だけ見せる。パスワードを忘れたときに必要なので、メモしてもらう
export function RecoveryCode({ code, children }) {
  return (
    <div className="recovery-code" role="status">
      <p>
        <strong>復旧コード</strong>（パスワードを忘れたときに、パスワードを作り直すのに使います）
      </p>
      <p className="recovery-code-value" aria-label="復旧コード">
        {code}
      </p>
      <p className="note small">
        このコードは、今だけ表示します。紙に書くか、パスワード管理アプリに保存してください。
        メールアドレスを登録していないので、コードもパスワードもなくすと、アカウントに戻れません。
      </p>
      {children}
    </div>
  );
}

export function LoginForm({ next }) {
  const [state, action, pending] = useActionState(login, { error: null, username: "" });
  return (
    <form action={action} className="add-form auth-form">
      <input type="hidden" name="next" value={next ?? ""} />
      <UsernameField defaultValue={state.username} />
      <PasswordField autoComplete="current-password" />
      <Error state={state} />
      <button type="submit" disabled={pending}>
        {pending ? "ログイン中…" : "ログイン"}
      </button>
    </form>
  );
}

export function SignupForm({ loggedIn = false }) {
  const [state, action, pending] = useActionState(signup, { error: null, username: "" });
  if (state.done) {
    return (
      <>
        <p className="success" role="status">
          登録しました。ID は <strong>{state.username}</strong> です。
        </p>
        <RecoveryCode code={state.recoveryCode}>
          <p>
            <Link href="/?notice=welcome" className="button-link">
              メモしたので、はじめる
            </Link>
          </p>
        </RecoveryCode>
      </>
    );
  }
  if (loggedIn) {
    return (
      <p className="note" role="status">
        いまログインしています。別のアカウントを作るときは、ログアウトしてから開いてください。{" "}
        <Link href="/">トップへ</Link>
      </p>
    );
  }
  return (
    <form action={action} className="add-form auth-form">
      <UsernameField
        defaultValue={state.username}
        maxLength={USERNAME_MAX}
        hint={`${USERNAME_HINT}。ログインに使います（ほかの人には見えません）`}
      />
      <PasswordField autoComplete="new-password" hint={`${MIN}文字以上`} />
      <PasswordField name="password2" label="パスワード（確認）" autoComplete="new-password" />
      <TermsCheckbox />
      <Error state={state} />
      <button type="submit" disabled={pending}>
        {pending ? "登録中…" : "同意して登録する"}
      </button>
    </form>
  );
}

export function RecoverForm() {
  const [state, action, pending] = useActionState(recoverPassword, { error: null, username: "" });
  if (state.done) {
    return (
      <>
        <p className="success" role="status">
          新しいパスワードにしました。ほかの端末のログインは切れました。使った復旧コードは、もう使えません。
        </p>
        <RecoveryCode code={state.recoveryCode}>
          <p>
            <Link href="/" className="button-link">
              メモしたので、つづける
            </Link>
          </p>
        </RecoveryCode>
      </>
    );
  }
  return (
    <form action={action} className="add-form auth-form">
      <UsernameField defaultValue={state.username} />
      <label>
        復旧コード
        <input name="code" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} required maxLength={40} />
      </label>
      <PasswordField label="新しいパスワード" autoComplete="new-password" hint={`${MIN}文字以上`} />
      <PasswordField name="password2" label="新しいパスワード（確認）" autoComplete="new-password" />
      <Error state={state} />
      <button type="submit" disabled={pending}>
        {pending ? "設定中…" : "パスワードを作り直してログイン"}
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

// 復旧コードを作り直す（アカウントの画面）
export function RegenerateRecoveryForm() {
  const [state, action, pending] = useActionState(regenerateRecoveryCode, { error: null, version: 0 });
  return (
    <>
      {state.recoveryCode && <RecoveryCode code={state.recoveryCode} />}
      <form action={action} className="add-form auth-form" key={state.version}>
        <PasswordField name="current" label="今のパスワード" autoComplete="current-password" />
        <Error state={state} />
        <button type="submit" disabled={pending}>
          {pending ? "作成中…" : "復旧コードを作り直す"}
        </button>
      </form>
    </>
  );
}
