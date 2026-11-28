import { ChangePasswordForm, RegenerateRecoveryForm } from "@/app/auth/AuthForms";
import { logout } from "@/app/auth/actions";
import { PasskeyManager } from "@/app/auth/PasskeyButtons";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { GUEST_LIMITS, guestHoursLeft } from "@/lib/guest";
import EndGuestButton from "@/app/try/EndGuestButton";
import { listPasskeys, MAX_PASSKEY_NAME_LENGTH } from "@/lib/passkeys";
import { getDisplayName, MAX_DISPLAY_NAME_LENGTH } from "@/lib/sharing";
import DisplayNameForm from "./DisplayNameForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "アカウント | フラッシュカード" };

export default async function AccountPage() {
  const user = await requireUser();
  if (user.guestExpiresAt) return <GuestAccount expiresAt={user.guestExpiresAt} />;
  const displayName = await getDisplayName(user.id);
  const passkeys = await listPasskeys(user.id);
  const { rows } = await pool.query("SELECT recovery_code_hash IS NOT NULL AS has FROM users WHERE id = $1", [user.id]);
  const hasRecoveryCode = rows[0]?.has ?? false;
  return (
    <main className="auth-page">
      <h1>アカウント</h1>
      <p className="note">
        ログイン中の ID: <strong>{user.username}</strong>
      </p>
      {!hasRecoveryCode && (
        <p className="error" role="note">
          復旧コードがまだありません。パスワードを忘れたときに戻れるよう、下の「復旧コード」で作ってください。
        </p>
      )}
      <h2>表示名</h2>
      <DisplayNameForm initialName={displayName} maxLength={MAX_DISPLAY_NAME_LENGTH} />
      <h2>パスキー</h2>
      <PasskeyManager passkeys={passkeys} maxNameLength={MAX_PASSKEY_NAME_LENGTH} />
      <h2>パスワードを変更</h2>
      <ChangePasswordForm />
      <h2>復旧コード</h2>
      <p className="note small">
        パスワードを忘れたときに、パスワードを作り直すためのコードです。なくしたときは、ここで作り直します（前のコードは使えなくなります）。
      </p>
      <RegenerateRecoveryForm />
      <h2>ログアウト</h2>
      <form action={logout}>
        <button type="submit" className="secondary-button">
          ログアウト
        </button>
      </form>
    </main>
  );
}

// おためしユーザーのアカウント画面。表示名・パスキー・パスワードは使えないので、削除までの時間と「おためしを終える」だけ
function GuestAccount({ expiresAt }) {
  return (
    <main className="auth-page">
      <h1>おためし中</h1>
      <p>
        <strong>
          {new Date(expiresAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", dateStyle: "medium", timeStyle: "short" })}
          （あと {guestHoursLeft(expiresAt)} 時間）に、アカウントごと自動で削除されます。
        </strong>
        作った単語帳・カード・学習の記録も、すべて消えます。
      </p>
      <p className="note">
        単語帳は {GUEST_LIMITS.decks} 冊まで、カードは全部で {GUEST_LIMITS.cards} 枚まで作れます。
        単語帳の公開・表示名・パスワード・パスキーは使えません。続けて使うときは、新規登録してください。
      </p>
      <h2>おためしを終える</h2>
      <p className="note small">今すぐ、アカウントと作ったものを削除します。</p>
      <EndGuestButton />
    </main>
  );
}
