import { NextResponse } from "next/server";

// ログインしていない人を、ログイン画面へ送る（トップ / はホームページを出すので通す）。
// ここでは Cookie があるかだけを見る（本当に有効なセッションかは、各画面の requireUser で確かめる）
const SESSION_COOKIE = "flashcard_session";
// /try はおためしの説明、/api/cron は期限の過ぎたおためしユーザーを消す処理（Vercel の Cron が呼ぶ）
const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/try", "/api/cron"];

export function middleware(request) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/") return NextResponse.next();
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Next.js の内部ファイルや画像などは対象にしない
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|txt)$).*)"],
};
