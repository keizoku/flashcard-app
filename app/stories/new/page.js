import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { getWordPoolCounts } from "@/lib/story";
import StoryForm from "./StoryForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "物語を作る | フラッシュカード" };

export default async function NewStoryPage() {
  const user = await requireUser();
  const counts = await getWordPoolCounts(user.id);
  const { rows: decks } = await pool.query("SELECT id, name FROM decks WHERE user_id = $1 AND kind = 'video' ORDER BY id", [
    user.id,
  ]);
  return (
    <main>
      <p className="back-link">
        <Link href="/">← 単語帳の一覧</Link>
      </p>
      <h1>覚えた単語で物語を作る</h1>
      <p className="note">
        覚えた単語を使った短い物語をチャット AI に書いてもらい、新しい単語帳にします。
        知っている単語を、別の文脈でもう一度見ることで、記憶に定着させます。
      </p>
      <StoryForm counts={counts} decks={decks} />
    </main>
  );
}
