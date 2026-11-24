"use client";

import { useEffect } from "react";
import { swipeKey } from "@/lib/swipe";

// 画面を左右にスワイプしたら、← / → キーを押したことにする（iPhone・iPad など、キーボードのない端末のため）。
// キーの操作は今までどおり、画面ごとの keydown の処理（window）が受け取る。
// タッチの操作（touchstart / touchend）だけを見るので、パソコンのマウスでは動かない。
// 入力欄・動画・data-no-swipe を付けた場所から始めた動きは、無視する
export function useSwipeKeys({ pageTurn = false, enabled = true } = {}) {
  useEffect(() => {
    if (!enabled) return undefined;
    let start = null;

    function onStart(e) {
      const ignored =
        e.touches.length > 1 ||
        (e.target instanceof Element && e.target.closest("input, textarea, select, iframe, [data-no-swipe]"));
      const t = e.touches[0];
      start = ignored ? null : { x: t.clientX, y: t.clientY, t: Date.now() };
    }
    function onEnd(e) {
      const t = e.changedTouches[0];
      const key = t && swipeKey(start, { x: t.clientX, y: t.clientY, t: Date.now() }, { pageTurn });
      start = null;
      if (key) window.dispatchEvent(new KeyboardEvent("keydown", { key }));
    }
    function onCancel() {
      start = null;
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [pageTurn, enabled]);
}
