import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { normalizeFilters, youtubeSearchUrl } from "@/lib/youtubeSearch";

// 「YouTube で探す」: 条件を入れた YouTube の検索結果のページへ移す（API は使わない）
export async function GET(request) {
  await requireUser();
  const url = new URL(request.url);
  const filters = normalizeFilters(Object.fromEntries(url.searchParams));
  if (!filters.q) return NextResponse.redirect(new URL("/search", url));
  return NextResponse.redirect(youtubeSearchUrl(filters));
}
