"use client";

import { useRef, useState } from "react";
import { getVideoTitle } from "@/app/actions";
import { parseVideoId } from "@/lib/youtube";

// URL の欄が変わったら動画のタイトルを取ってきて、デッキ名の欄が空（または前に自動で入れた値）なら入れる
export function useVideoTitle(nameRef) {
  const [status, setStatus] = useState(null); // null | "loading" | "filled" | "failed"
  const lastAuto = useRef("");
  const lastId = useRef(null);

  async function onUrlChange(url, { force = false } = {}) {
    const id = parseVideoId(url);
    if (!id || (id === lastId.current && !force)) return;
    lastId.current = id;
    const input = nameRef.current;
    if (!input) return;
    if (!force && input.value.trim() && input.value !== lastAuto.current) return; // 自分で入れた名前は変えない
    setStatus("loading");
    const { title } = await getVideoTitle(url);
    if (!title) {
      setStatus("failed");
      return;
    }
    input.value = title;
    lastAuto.current = title;
    setStatus("filled");
  }

  return { status, onUrlChange };
}

export function TitleStatus({ status }) {
  if (status === "loading") return <span className="note small">動画のタイトルを取得中…</span>;
  if (status === "filled") return <span className="success small">動画のタイトルをデッキ名に入れました</span>;
  if (status === "failed") return <span className="note small">タイトルを取得できませんでした</span>;
  return null;
}
