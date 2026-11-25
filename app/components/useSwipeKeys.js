"use client";

import { useEffect } from "react";
import { isTap, swipeKey } from "@/lib/swipe";

// 画面を左右にスワイプしたら、← / → キーを押したことにする（iPhone・iPad など、キーボードのない端末のため）。
// キーの操作は今までどおり、画面ごとの keydown の処理（window）が受け取る。
// タッチの操作（touchstart / touchend）だけを見るので、パソコンのマウスでは動かない。
// 入力欄・動画・data-no-swipe を付けた場所から始めた動きは、無視する
//
//   pageTurn   … true なら本のページの向き（指を左へ → 次 = →）
//   keys       … スワイプで使うキー（初めは ← と → の両方）。["ArrowLeft"] なら、右へのスワイプではなにもしない
//   tapKey     … tapArea（CSS のセレクター）の中をタップしたときに押すキー。
//                ボタン・リンク・開け閉めする欄（summary）など、押せるものの上のタップは除く
const IGNORE = "input, textarea, select, iframe, [data-no-swipe]";
const CLICKABLE = "button, a, summary, label, [role=button]";

export function useSwipeKeys({ pageTurn = false, keys = ["ArrowLeft", "ArrowRight"], tapKey = null, tapArea = null } = {}) {
  const keyList = keys.join(",");
  useEffect(() => {
    let start = null;

    function onStart(e) {
      const ignored = e.touches.length > 1 || (e.target instanceof Element && e.target.closest(IGNORE));
      const t = e.touches[0];
      start = ignored ? null : { x: t.clientX, y: t.clientY, t: Date.now(), target: e.target };
    }
    function onEnd(e) {
      const t = e.changedTouches[0];
      const s = start;
      start = null;
      if (!t || !s) return;
      const end = { x: t.clientX, y: t.clientY, t: Date.now() };
      let key = swipeKey(s, end, { pageTurn });
      if (key && !keyList.split(",").includes(key)) key = null;
      if (!key && tapKey && tapArea && isTap(s, end) && s.target instanceof Element) {
        if (s.target.closest(tapArea) && !s.target.closest(CLICKABLE)) key = tapKey;
      }
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
  }, [pageTurn, keyList, tapKey, tapArea]);
}
