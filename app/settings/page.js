import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getOnboarding } from "@/lib/onboarding";
import { getSettings } from "@/lib/settings";
import { totalLemmas } from "@/lib/vocab";
import KnownWords from "./KnownWords";
import SpeechSettings from "./SpeechSettings";
import SettingsForm from "./SettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await getSettings(user.id);
  // はじめの4ステップの途中なら、保存したあとにトップ（次のステップ）へ戻るボタンを出す
  const onboarding = await getOnboarding(user.id);
  const { rows: known } = await pool.query("SELECT word FROM known_words WHERE user_id = $1 ORDER BY word", [
    user.id,
  ]);

  return (
    <main>
      <p className="back-link">
        <Link href="/">← 単語帳の一覧</Link>
      </p>
      <h1>レベル設定</h1>
      <p className="note">
        いまの設定: <strong>{settings.levelLabel}</strong>（上位 {settings.vocabSize.toLocaleString()} 語）
      </p>
      <SettingsForm levelKey={settings.levelKey} vocabSize={settings.vocabSize} nextHref={onboarding.show ? "/" : null} />
      <p className="note small">
        このほかに、「知ってる」を押した単語と、学習で「覚えた」（3回続けて「覚えている」）単語も「知っている」として扱います。カードにして学習中の単語を含む文は、覚えるまで新しい候補に出しません。
      </p>
      <h2>読み上げ</h2>
      <SpeechSettings />
      <h2>「知ってる」にした単語（{known.length} 語）</h2>
      <KnownWords words={known.map((r) => r.word)} />
      <p className="note small">
        単語の頻出度は <a href="https://github.com/rspeer/wordfreq">wordfreq</a>（CC BY-SA 4.0）のデータを使っています（原形で約{" "}
        {totalLemmas().toLocaleString()} 語）。
      </p>
    </main>
  );
}
