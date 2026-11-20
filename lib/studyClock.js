// 勉強時間の時計（画面の部品からも使う）。
// 単語: 操作があった間を数える。最後の操作から idleMs を超えた分は、席を外したとみなして数えない
// リスニング: 再生している間を数える（idleMs なし）
// 時刻はミリ秒（Date.now() など）を渡す。take() で、たまった秒数（整数）を取り出す

export const STUDY_KINDS = { vocab: "単語", listening: "リスニング" };
export const MAX_SEND_SECONDS = 600; // 1回に送る秒数の上限

export function createStudyClock({ idleMs = Infinity } = {}) {
  let running = false;
  let lastAt = 0; // 最後の操作（再生の開始）の時刻
  let countedUntil = 0; // ここまでは数えた
  let pendingMs = 0; // まだ取り出していない時間

  function credit(t) {
    if (!running) return;
    const end = Math.min(t, lastAt + idleMs);
    if (end > countedUntil) {
      pendingMs += end - countedUntil;
      countedUntil = end;
    }
  }

  return {
    get running() {
      return running;
    },
    // 操作があった（リスニングでは、再生が始まった）
    activity(t) {
      credit(t);
      running = true;
      lastAt = t;
      countedUntil = t; // 空いていた時間（上限を超えた分）は数えない
    },
    // 止める（ほかのタブに移った・一時停止した）
    pause(t) {
      credit(t);
      running = false;
    },
    // たまった秒数を取り出す。1秒に満たない分は次に持ち越す
    take(t) {
      credit(t);
      const seconds = Math.floor(pendingMs / 1000);
      pendingMs -= seconds * 1000;
      return seconds;
    },
  };
}

// 送る秒数を、1回 MAX_SEND_SECONDS までに分ける
export function splitSeconds(seconds) {
  const parts = [];
  let rest = seconds;
  while (rest > 0) {
    const n = Math.min(rest, MAX_SEND_SECONDS);
    parts.push(n);
    rest -= n;
  }
  return parts;
}

// 「1時間5分」「12分」
export function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const h = Math.floor(minutes / 60);
  return h > 0 ? `${h}時間${minutes % 60}分` : `${minutes}分`;
}
