// Email 欄位（可多筆）正規化。純函式，server（客戶／廠商表單驗證）、客戶匯入（#266，含一次性腳本）與測試共用；
// 不可 import server-only 模組。

export const EMAIL_FORMAT_MESSAGE = "Email 格式不正確（多筆請以 ; 分隔）。";

const EMAIL_RE = /^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/;

/**
 * Email 欄位（可多筆）：以 ; , ，、；分隔，逐筆做基本格式檢查（x@y.z），整理為「; 」分隔。
 * 空白回 value: null（不擋）；任一筆不符回 ok: false。不檢查網域是否存在。
 */
export function normalizeEmailList(
  v: string | null | undefined,
): { ok: true; value: string | null } | { ok: false } {
  const parts = (v ?? "")
    .split(/[;,，；、]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return { ok: true, value: null };
  if (!parts.every((p) => EMAIL_RE.test(p))) return { ok: false };
  return { ok: true, value: parts.join("; ") };
}
