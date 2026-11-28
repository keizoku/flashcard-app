// 利用規約の版。規約（app/terms/TermsText.js）の大事なところを変えたら、数を上げて日付を変える。
// 上げると、ログインしている人にも、次に画面を開いたときに同意の画面（/agree）を出す
export const TERMS_VERSION = 1;
export const TERMS_DATE = "2026年11月28日";

// user: getCurrentUser() の値。今の版の規約に同意していなければ true
export function needsTermsAgreement(user) {
  return Boolean(user) && user.termsVersion !== TERMS_VERSION;
}
