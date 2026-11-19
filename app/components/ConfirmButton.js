"use client";

import { useState } from "react";

// 2段階で確認する削除ボタン。ブラウザの確認ダイアログ（confirm）は環境によって
// 表示されないことがあるので、画面の中で「本当に削除する / やめる」を出す
export default function ConfirmButton({ label, confirmMessage, confirmLabel, pendingLabel, pending, disabled, onConfirm }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button type="button" className="danger-button" onClick={() => setAsking(true)} disabled={disabled || pending}>
        {pending ? pendingLabel : label}
      </button>
    );
  }
  return (
    <div className="confirm-box" role="alertdialog" aria-label={confirmMessage}>
      <p>{confirmMessage}</p>
      <div className="form-buttons">
        <button
          type="button"
          className="danger-button solid"
          onClick={() => {
            setAsking(false);
            onConfirm();
          }}
          disabled={pending}
        >
          {confirmLabel}
        </button>
        <button type="button" className="secondary-button" onClick={() => setAsking(false)}>
          やめる
        </button>
      </div>
    </div>
  );
}
