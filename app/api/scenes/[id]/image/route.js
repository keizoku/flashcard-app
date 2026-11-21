import { getCurrentUser } from "@/lib/auth";
import { getSceneImage, saveSceneImage } from "@/lib/scenes";

// 物語の場面の絵。GET で見る、POST（フォームの image）で取り込む。自分の場面だけ

const sceneIdOf = async (params) => {
  const { id } = await params;
  return /^\d+$/.test(id) ? Number(id) : NaN;
};

export async function GET(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return new Response(null, { status: 401 });
  const image = await getSceneImage(user.id, await sceneIdOf(params));
  if (!image) return new Response(null, { status: 404 });
  return new Response(image.bytes, {
    headers: {
      "content-type": image.type,
      // URL に絵を変えた時刻（?v=）を付けているので、同じ URL は同じ絵。ほかの人のキャッシュには入れない
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(request, { params }) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "ログインしてください" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin) {
    let host = null;
    try {
      host = new URL(origin).host;
    } catch {}
    if (host !== request.headers.get("host")) return Response.json({ error: "送り元が正しくありません" }, { status: 403 });
  }
  let file;
  try {
    file = (await request.formData()).get("image");
  } catch {
    return Response.json({ error: "画像を選んでください" }, { status: 400 });
  }
  if (!file || typeof file.arrayBuffer !== "function") return Response.json({ error: "画像を選んでください" }, { status: 400 });
  const result = await saveSceneImage(user.id, await sceneIdOf(params), Buffer.from(await file.arrayBuffer()), "upload");
  if (result.error === "場面が見つかりません") return Response.json(result, { status: 404 });
  if (result.error) return Response.json(result, { status: 400 });
  return new Response(null, { status: 204 });
}
