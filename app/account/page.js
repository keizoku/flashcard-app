import { ChangePasswordForm } from "@/app/auth/AuthForms";
import { logout } from "@/app/auth/actions";
import { PasskeyManager } from "@/app/auth/PasskeyButtons";
import { requireUser } from "@/lib/auth";
import { listPasskeys, MAX_PASSKEY_NAME_LENGTH } from "@/lib/passkeys";
import { getDisplayName, MAX_DISPLAY_NAME_LENGTH } from "@/lib/sharing";
import DisplayNameForm from "./DisplayNameForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "アカウント | フラッシュカード" };

export default async function AccountPage() {
  const user = await requireUser();
  const displayName = await getDisplayName(user.id);
  const passkeys = await listPasskeys(user.id);
  return (
    <main className="auth-page">
      <h1>アカウント</h1>
      <p className="note">
        ログイン中: <strong>{user.email}</strong>
      </p>
      <h2>表示名</h2>
      <DisplayNameForm initialName={displayName} maxLength={MAX_DISPLAY_NAME_LENGTH} />
      <h2>パスキー</h2>
      <PasskeyManager passkeys={passkeys} maxNameLength={MAX_PASSKEY_NAME_LENGTH} />
      <h2>パスワードを変更</h2>
      <ChangePasswordForm />
      <h2>ログアウト</h2>
      <form action={logout}>
        <button type="submit" className="secondary-button">
          ログアウト
        </button>
      </form>
    </main>
  );
}
