import { getCurrentUser } from "@/lib/auth";
import { needsTermsAgreement } from "@/lib/terms";
import { recordStudyTime } from "@/lib/studyTime";

// 画面から勉強時間を受け取る。画面を閉じるときにも送れるよう、navigator.sendBeacon（本文は JSON の文字列）で送ってくる
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "ログインしてください" }, { status: 401 });
  if (needsTermsAgreement(user)) return Response.json({ error: "利用規約に同意してください" }, { status: 403 });

  // ほかのサイトから送らせない
  const origin = request.headers.get("origin");
  if (origin) {
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {}
    if (host !== request.headers.get("host")) return Response.json({ error: "送り元が正しくありません" }, { status: 403 });
  }

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return Response.json({ error: "中身が正しくありません" }, { status: 400 });
  }
  const result = await recordStudyTime(user.id, {
    kind: body?.kind,
    seconds: body?.seconds,
    deckId: body?.deckId ?? null,
  });
  if (result.error) return Response.json({ error: result.error }, { status: 400 });
  return new Response(null, { status: 204 });
}
