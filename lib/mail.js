import "server-only";
import nodemailer from "nodemailer";
import { appOrigin } from "./appUrl.js";

// メールを送る。送り先のサーバーは環境変数（compose.yaml / .env）で決める。
// 何も設定しなければ、開発用の受信箱 Mailpit（http://localhost:8025）に届く
const globalForMail = globalThis;

function transport() {
  globalForMail.mailTransport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || "mailpit",
    port: Number(process.env.SMTP_PORT || 1025),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return globalForMail.mailTransport;
}

export function appUrl(path = "/") {
  return new URL(path, appOrigin()).toString();
}

// 送れたら true。送れなかったときはログに出して false
export async function sendMail({ to, subject, text }) {
  try {
    await transport().sendMail({
      from: process.env.MAIL_FROM || "フラッシュカード <no-reply@flashcard.local>",
      to,
      subject,
      text,
    });
    return true;
  } catch (err) {
    console.error("sendMail failed:", err.message);
    return false;
  }
}
