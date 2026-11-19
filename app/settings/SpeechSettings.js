"use client";

import { useEffect, useState } from "react";
import { isSpeechSupported, saveSpeechSettings, speak, useEnglishVoices, useSpeechSettings } from "@/app/components/speech";

const SAMPLE = "This car could suck the chrome off a trailer hitch.";

// 読み上げの声・速さ・自動読み上げの設定（このブラウザに保存）
export default function SpeechSettings() {
  const [supported, setSupported] = useState(null);
  useEffect(() => setSupported(isSpeechSupported()), []);
  const settings = useSpeechSettings();
  const voices = useEnglishVoices();

  if (supported === null) return null;
  if (!supported) {
    return <p className="note small">このブラウザは読み上げに対応していません。Chrome・Safari・Edge などで使えます。</p>;
  }

  return (
    <div className="add-form">
      <label>
        声
        <select value={settings.voice} onChange={(e) => saveSpeechSettings({ voice: e.target.value })}>
          <option value="">おまかせ（自然な声を自動で選ぶ）</option>
          {voices.map((v) => (
            <option key={v.name} value={v.name}>
              {v.name}（{v.lang}）{v.localService ? "" : " ・オンライン"}
            </option>
          ))}
        </select>
      </label>
      <label>
        速さ: {settings.rate.toFixed(1)} 倍
        <input
          type="range"
          min="0.5"
          max="1.5"
          step="0.1"
          value={settings.rate}
          onChange={(e) => saveSpeechSettings({ rate: Number(e.target.value) })}
        />
      </label>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={settings.autoRead}
          onChange={(e) => saveSpeechSettings({ autoRead: e.target.checked })}
        />
        学習画面で、カードが出たら自動で読み上げる
      </label>
      <button type="button" className="secondary-button" onClick={() => speak(SAMPLE)}>
        試しに読み上げる
      </button>
      <p className="note small">
        使える声は、端末やブラウザによって違います。この設定は、このブラウザに保存されます。
        {voices.length === 0 && " 英語の声が見つかりません。OS の設定で英語の音声を追加すると使えます。"}
      </p>
    </div>
  );
}
