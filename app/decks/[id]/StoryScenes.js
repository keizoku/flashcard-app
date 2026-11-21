"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateImage, removeImage, updatePrompt } from "./sceneActions";

// 物語の場面の絵。場面ごとに、絵の指示文をコピーして画像を作る AI で作った絵を取り込むか、
// 無料の画像生成サービスで自動で作る。絵はスライドに出る
// scenes: [{ id, position, first, last, prompt, hasImage, source, version }]、sentences: [{ text }]
export default function StoryScenes({ scenes, sentences }) {
  const router = useRouter();
  const [busyAll, setBusyAll] = useState(false);
  const [message, setMessage] = useState(null);
  const done = scenes.filter((s) => s.hasImage).length;

  async function generateAll() {
    setBusyAll(true);
    setMessage(null);
    let failed = 0;
    for (const s of scenes.filter((x) => !x.hasImage)) {
      const r = await generateImage(s.id).catch(() => ({ error: true }));
      if (r.error) failed++;
      router.refresh();
    }
    setBusyAll(false);
    setMessage(failed ? `${failed} 枚は作れませんでした。少し待ってからもう一度試すか、画像を取り込んでください。` : "すべての場面の絵ができました。");
  }

  return (
    <details className="scenes" open>
      <summary>
        場面の絵（{done} / {scenes.length} 枚）
      </summary>
      <p className="note small">
        絵はスライドに出ます。絵の指示文をコピーして、画像を作れる AI（ChatGPT・Gemini・Copilot など）に貼り、できた画像を「画像を取り込む」で入れてください。
        「自動で作る」は、無料の画像生成サービス（Pollinations、キー不要）を使います。場面の英文がサービスに送られます。混んでいると時間がかかったり、失敗したりします。
      </p>
      {done < scenes.length && (
        <p>
          <button type="button" className="secondary-button" onClick={generateAll} disabled={busyAll}>
            {busyAll ? "作っています…（1枚に数秒〜数十秒）" : `絵のない ${scenes.length - done} 場面を自動で作る`}
          </button>
        </p>
      )}
      {message && (
        <p className="note small" role="status">
          {message}
        </p>
      )}
      <ol className="scene-list">
        {scenes.map((s) => (
          <Scene key={s.id} scene={s} sentences={sentences} disabled={busyAll} />
        ))}
      </ol>
    </details>
  );
}

function Scene({ scene, sentences, disabled }) {
  const router = useRouter();
  const fileRef = useRef(null);
  const [prompt, setPrompt] = useState(scene.prompt);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const busy = pending || uploading || disabled;
  const first = sentences[scene.first]?.text ?? "";

  function run(action, doneNote) {
    setError(null);
    setNote(null);
    startTransition(async () => {
      const r = await action().catch(() => ({ error: "うまくいきませんでした。ページを再読み込みしてください" }));
      if (r.error) setError(r.error);
      else {
        if (doneNote) setNote(doneNote);
        router.refresh();
      }
    });
  }

  async function upload(file) {
    if (!file) return;
    setError(null);
    setNote(null);
    setUploading(true);
    const form = new FormData();
    form.set("image", file);
    try {
      const res = await fetch(`/api/scenes/${scene.id}/image`, { method: "POST", body: form });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "取り込めませんでした");
      else router.refresh();
    } catch {
      setError("取り込めませんでした");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt);
      setNote("コピーしました");
    } catch {
      setError("コピーできませんでした。指示文を選んでコピーしてください");
    }
  }

  return (
    <li className="scene">
      <div className="scene-image">
        {scene.hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/scenes/${scene.id}/image?v=${scene.version}`} alt={`場面 ${scene.position + 1} の絵`} />
        ) : (
          <span className="scene-noimage">絵なし</span>
        )}
      </div>
      <div className="scene-body">
        <p className="scene-head">
          <strong>場面 {scene.position + 1}</strong>{" "}
          <span className="note small">
            （文 {scene.first + 1}〜{scene.last + 1}）{scene.source === "generated" && " · 自動で作った絵"}
          </span>
        </p>
        <p className="scene-first">{first}</p>
        <label className="scene-prompt">
          絵の指示文
          <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} maxLength={1000} />
        </label>
        <div className="scene-actions">
          <button type="button" className="link-button" onClick={copy}>
            コピー
          </button>
          {prompt !== scene.prompt && (
            <button type="button" className="link-button" disabled={busy} onClick={() => run(() => updatePrompt(scene.id, prompt), "保存しました")}>
              指示文を保存
            </button>
          )}
          {/* ファイル選択は隠して、ボタンから開く。透明にして重ねると、ブラウザによっては隣のボタンまで覆ってしまう */}
          <button type="button" className="link-button" disabled={busy} onClick={() => fileRef.current?.click()}>
            画像を取り込む
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <button
            type="button"
            className="link-button"
            disabled={busy || prompt !== scene.prompt}
            title={prompt !== scene.prompt ? "先に指示文を保存してください" : undefined}
            onClick={() => run(() => generateImage(scene.id))}
          >
            {pending ? "作っています…" : scene.hasImage ? "自動で作り直す" : "自動で作る"}
          </button>
          {scene.hasImage && (
            <button type="button" className="link-button danger" disabled={busy} onClick={() => run(() => removeImage(scene.id))}>
              絵を消す
            </button>
          )}
        </div>
        {uploading && <p className="note small">取り込んでいます…</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {note && (
          <p className="success" role="status">
            {note}
          </p>
        )}
      </div>
    </li>
  );
}
