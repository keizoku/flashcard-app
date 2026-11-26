"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HighlightedMany, HighlightedParts } from "@/app/components/Highlighted";
import PromptBox from "@/app/components/PromptBox";
import SpeakButton from "@/app/components/SpeakButton";
import { displayTarget, levelLabel } from "@/lib/format";
import { formatTime, parseVideoId, videoUrl } from "@/lib/youtube";
import { analyzeTranscript, importSentences, markKnown, registerCards } from "./actions";

const STAGES = [1, 2, 3];

// 一番やさしい段階（新しく覚える語が少ない段階）で、候補がある段階を選ぶ
function firstStageWithCandidates(stages) {
  return STAGES.find((n) => stages[n]?.length > 0) ?? 1;
}

export default function ImportClient({ deckId, initialUrl, initialText }) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [url, setUrl] = useState(initialUrl);
  const [result, setResult] = useState(null); // { stages, comprehension, stats, mode, videoId, sentencePrompts }
  const [stage, setStage] = useState(1);
  const [selected, setSelected] = useState({}); // 文 → { back }
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  function applyResult(r, keepSelection) {
    setResult(r);
    setStage((prev) => (keepSelection && r.stages[prev]?.length > 0 ? prev : firstStageWithCandidates(r.stages)));
    // 「知ってる」で一覧が変わっても、まだ残っている文の選択は保つ
    setSelected((prev) => {
      if (!keepSelection) return {};
      const all = STAGES.flatMap((n) => r.stages[n]);
      const next = {};
      for (const c of all) if (prev[c.sentence]) next[c.sentence] = prev[c.sentence];
      return next;
    });
  }

  function analyze(keepSelection = false) {
    setError(null);
    startTransition(async () => {
      const r = await analyzeTranscript({ deckId, text, url });
      if (r.error) {
        setError(r.error);
        return;
      }
      applyResult(r, keepSelection);
    });
  }

  // 字幕が保存済みなら、開いたときに自動で探す
  const autoRan = useRef(false);
  useEffect(() => {
    if (initialText && !autoRan.current) {
      autoRan.current = true;
      analyze(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // チャット AI で整えた文を取り込んで、もう一度探す
  function onImportSentences(aiText, done) {
    setError(null);
    startTransition(async () => {
      const r = await importSentences({ deckId, text: aiText });
      if (r.error) {
        setError(r.error);
        return;
      }
      applyResult(r, false);
      done();
    });
  }

  function onKnown(lemma) {
    setError(null);
    startTransition(async () => {
      const r = await markKnown(lemma);
      if (r.error) {
        setError(r.error);
        return;
      }
      analyze(true);
    });
  }

  const candidates = result?.stages[stage] ?? [];

  function toggle(c) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[c.sentence]) delete next[c.sentence];
      else next[c.sentence] = { back: "" };
      return next;
    });
  }

  // 表示中の段階の候補を、すべて選ぶ / すべて外す
  function selectAll(on) {
    setSelected((prev) => {
      const next = { ...prev };
      for (const c of candidates) {
        if (on) next[c.sentence] ??= { back: "" };
        else delete next[c.sentence];
      }
      return next;
    });
  }

  function setBack(sentence, back) {
    setSelected((prev) => ({ ...prev, [sentence]: { back } }));
  }

  function register() {
    setError(null);
    const all = STAGES.flatMap((n) => result.stages[n]);
    const items = all
      .filter((c) => selected[c.sentence])
      .map((c) => ({
        sentence: c.sentence,
        start: c.start,
        back: selected[c.sentence].back,
        translation: c.translation,
        targets: c.items.map((it) => ({
          form: it.form,
          lemma: it.lemma,
          meaning: it.meaning,
          translationForm: it.translationForm,
        })),
      }));
    startTransition(async () => {
      try {
        const r = await registerCards({ deckId, items });
        if (r.error) {
          setError(r.error);
          return;
        }
        router.push(`/decks/${deckId}`);
      } catch {
        setError("登録できませんでした。もう一度試してください");
      }
    });
  }

  const selectedCount = Object.keys(selected).length;
  const selectedHere = candidates.filter((c) => selected[c.sentence]).length;
  const timeLink = (start) =>
    result?.videoId && start !== null ? (
      <a href={videoUrl(result.videoId, start)} target="_blank" rel="noreferrer">
        ▶ {formatTime(start)}
      </a>
    ) : null;

  return (
    <>
      <form
        className="add-form"
        onSubmit={(e) => {
          e.preventDefault();
          analyze(false);
        }}
      >
        <details open={!initialText}>
          <summary className="summary-label">
            動画と字幕{initialText ? "（保存済み。変更するときは開く）" : ""}
          </summary>
          <div className="details-body">
            <div className="field">
              <label htmlFor="import-url" className="field-label">
                YouTube の URL（任意）
              </label>
              <div className="url-row">
                <input
                  id="import-url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  inputMode="url"
                />
                {/* 字幕をコピーするために、動画を別のタブ（ウィンドウ）で開く。読み取れる URL のときだけ出す */}
                {parseVideoId(url) && (
                  <a
                    href={videoUrl(parseVideoId(url))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="secondary-button"
                  >
                    YouTube で開く ↗
                  </a>
                )}
              </div>
            </div>
            <label>
              字幕のテキスト
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder={"0:00\nHello everyone, and welcome back to the channel.\n0:04\n..."}
                required
              />
            </label>
            <p className="note small">「文を探す」を押すと、URL と字幕はこの単語帳に保存されます。</p>
          </div>
        </details>
        {error && <p className="error" role="alert">{error}</p>}
        <button type="submit" disabled={pending}>
          {pending ? "解析中…" : "文を探す"}
        </button>
      </form>

      {result && (
        <section>
          <Overview result={result} />
          {result.sentencePrompts && (
            <SentencePanel
              prompts={result.sentencePrompts}
              mode={result.mode}
              pending={pending}
              onImport={onImportSentences}
            />
          )}

          <div className="stage-tabs" role="tablist" aria-label="段階">
            {STAGES.map((n) => (
              <button
                key={n}
                type="button"
                role="tab"
                aria-selected={stage === n}
                className={`stage-tab${stage === n ? " active" : ""}`}
                onClick={() => setStage(n)}
              >
                i+{n}
                <span className="stage-count">{result.stages[n].length} 文</span>
              </button>
            ))}
          </div>
          <p className="note small">
            {stage === 1
              ? "知らない語がちょうど1つの文です。まずはここから。"
              : `新しく覚える語が ${stage} つある文です。カードには ${stage} つの語をまとめて登録します。`}
          </p>

          {candidates.length === 0 ? (
            <EmptyStage result={result} stage={stage} onPick={setStage} />
          ) : (
            <>
              <div className="select-bar">
                <button type="button" className="secondary-button" onClick={() => selectAll(true)} disabled={pending}>
                  すべて選ぶ（{candidates.length} 文）
                </button>
                {selectedHere > 0 && (
                  <button type="button" className="secondary-button" onClick={() => selectAll(false)} disabled={pending}>
                    この段階の選択を外す
                  </button>
                )}
              </div>
              <ul className="candidates">
                {candidates.map((c) => {
                  const checked = Boolean(selected[c.sentence]);
                  return (
                    <li key={c.sentence} className={checked ? "checked" : ""}>
                      <label className="candidate-main">
                        <input type="checkbox" checked={checked} onChange={() => toggle(c)} />
                        <span className="candidate-sentence">
                          <HighlightedMany text={c.sentence} forms={c.items.map((it) => it.form)} />
                          {c.translation && (
                            <span className="candidate-translation">
                              <HighlightedParts text={c.translation} parts={c.items.map((it) => it.translationForm)} />
                            </span>
                          )}
                          {c.original && <span className="candidate-original">元の字幕: {c.original}</span>}
                        </span>
                      </label>
                      <ul className="candidate-items">
                        {c.items.map((it) => (
                          <li key={it.lemma} className="candidate-meta">
                            {it.kind === "idiom" ? (
                              <span>
                                <span className="tag">イディオム</span> <strong className="candidate-word">{displayTarget(it.lemma)}</strong>
                                {it.meaning && `：${it.meaning}`}（目安 {levelLabel(it.level)}）
                              </span>
                            ) : (
                              <span>
                                <strong className="candidate-word">{it.lemma}</strong>
                                {it.meaning && `：${it.meaning}`} ·{" "}
                                {it.rank ? `頻出度 ${it.rank.toLocaleString()} 位` : "リスト外の単語"}
                              </span>
                            )}
                            <button type="button" className="link-button" onClick={() => onKnown(it.lemma)} disabled={pending}>
                              「{displayTarget(it.lemma)}」は知ってる
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="candidate-meta">
                        <SpeakButton text={c.sentence} />
                        {timeLink(c.start)}
                      </div>
                      {checked && (
                        <input
                          className="candidate-back"
                          value={selected[c.sentence].back}
                          onChange={(e) => setBack(c.sentence, e.target.value)}
                          placeholder="自分のメモ（任意）"
                          maxLength={500}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {selectedCount > 0 && (
            <div className="register-bar">
              <button type="button" onClick={register} disabled={pending}>
                {pending ? "処理中…" : `選んだ ${selectedCount} 文をカードに登録`}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
}

// この動画の理解度と、候補の内訳
function Overview({ result }) {
  const { comprehension: c, imported, updatedCards, mode } = result;
  return (
    <div className="stats">
      <p>
        この動画の理解度 <strong>{c.percent}%</strong>（{c.total} 文のうち、全部わかる文 {c.understood} 文）
      </p>
      <p className="note small">
        学習中の語を覚えればわかる文 {c.waiting} 文 / 知らない語が 1つ {c.byUnknown[1]} 文・2つ {c.byUnknown[2]} 文・3つ以上{" "}
        {c.byUnknown[3]} 文（学習中の語も含めて数えています）
      </p>
      {imported > 0 && <p className="success small">AI で整えた {imported} 文を取り込みました。</p>}
      {updatedCards > 0 && (
        <p className="success small">
          登録済みのカード {updatedCards} 枚を、AI の結果で上書きしました（例文・和訳・語句の意味・和訳の強調）。
        </p>
      )}
      {mode === "heuristic" && (
        <p className="warning small">
          句読点のない字幕なので、and や so などの前で仮に区切っています。文が途中で切れていることがあります。
          下の手順で、チャット AI を使って完結した文に整えられます。
        </p>
      )}
    </div>
  );
}

// 選んだ段階に候補がないときの案内
function EmptyStage({ result, stage, onPick }) {
  const next = STAGES.find((n) => result.stages[n].length > 0);
  const { comprehension: c } = result;
  return (
    <div className="empty-state">
      <p>i+{stage} の文はありません。</p>
      {next ? (
        <button type="button" className="secondary-button" onClick={() => onPick(next)}>
          i+{next} の文（{result.stages[next].length} 文）を見る
        </button>
      ) : c.understood === c.total ? (
        <p className="note small">この動画の文は、すべてわかるようになりました。クリアです！</p>
      ) : (
        <p className="note small">
          残りの文には、学習中の語が入っています。学習で「覚えた」になると（3回続けて「覚えている」）、
          新しい文が候補に出てきます。
        </p>
      )}
    </div>
  );
}

// チャット AI（claude.ai など）で字幕を完結した文に整えて、取り込む
// mode: "heuristic"（句読点なし）は開いた状態、"ai"（整え済み）と "punctuated"（句読点あり）は閉じた状態で出す
function SentencePanel({ prompts, mode, pending, onImport }) {
  const [aiText, setAiText] = useState("");
  const summary = {
    heuristic: "チャット AI で完結した文に整える（無料）",
    ai: "AI で整えた文を使っています（整え直すときは開く）",
    punctuated: "チャット AI で文を整える（任意。フィラーや言い直しを消し、和訳も付く）",
  }[mode];
  return (
    <details className="ai-panel" open={mode === "heuristic"}>
      <summary>{summary}</summary>
      <ol className="steps">
        <li>
          下のプロンプトをコピーして、
          <a href="https://claude.ai/new" target="_blank" rel="noreferrer">claude.ai</a>
          などのチャット AI に貼り付けて送信します。
          {prompts.length > 1 &&
            ` 字幕が長いので ${prompts.length} 回に分けています。1回ずつ送って、答えを順番に下の欄へ貼り付けてください。`}
          {prompts.map((p, i) => (
            <PromptBox key={i} text={p} label={prompts.length > 1 ? `${i + 1} 回目のプロンプトをコピー` : undefined} />
          ))}
        </li>
        <li>
          AI の答え（「[0:06] 文」の行）をコピーして、ここに貼り付けます。
          <textarea
            className="ai-answer"
            value={aiText}
            onChange={(e) => setAiText(e.target.value)}
            rows={6}
            placeholder={"[0:00] Hey guys, so today I'm gonna be sharing ...\n[0:06] It's simply creating ..."}
          />
        </li>
        <li>
          <button type="button" onClick={() => onImport(aiText, () => setAiText(""))} disabled={pending || !aiText.trim()}>
            {pending ? "取り込み中…" : "取り込んで文を探し直す"}
          </button>
        </li>
      </ol>
    </details>
  );
}
