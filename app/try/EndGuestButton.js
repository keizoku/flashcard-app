"use client";

import { useTransition } from "react";
import ConfirmButton from "@/app/components/ConfirmButton";
import { endGuest } from "./actions";

// 「おためしを終える」。押すと、アカウントと作ったものをすぐに削除する（画面の中で確かめてから）
export default function EndGuestButton() {
  const [pending, startTransition] = useTransition();
  return (
    <ConfirmButton
      label="おためしを終える"
      confirmMessage="おためしを終えると、作った単語帳・カード・学習の記録は、すぐにすべて削除されます。元に戻せません。"
      confirmLabel="削除して終える"
      pendingLabel="削除中…"
      pending={pending}
      onConfirm={() => startTransition(() => endGuest())}
    />
  );
}
