import { deleteExpiredGuests } from "@/lib/guest";

// 期限の過ぎたおためしユーザーを、アカウントごと削除する。Vercel の Cron が1日1回呼ぶ（vercel.json）。
// 期限の過ぎた人を消すだけなので、だれが何回呼んでも困ることはない（合言葉はいらない）
export const dynamic = "force-dynamic";

export async function GET() {
  const deleted = await deleteExpiredGuests();
  return Response.json({ deleted });
}
