// 重複轉單提醒（#234）：報價「轉銷貨單」、銷貨「建立銷退單」的確認框內容，依已轉出的單據產生。
// 純函式（client / server 皆可用，有單元測試）；資料來自明細頁已讀到的衍生單據（listDerivedDocuments），
// 點擊時不另外查詢。畫面渲染（單據清單 + 狀態標籤）在 SalesDocActions。
//
// 規則：
// - 報價 → 銷貨：草稿或已過帳的銷貨單都算「已轉出」（草稿也可能被過帳出貨）→ 警示語氣（danger，
//   焦點預設在取消）、確認鈕「仍要轉銷貨單」。已作廢的不計入張數，列在最後並標示；
//   全部都是作廢單時只列出、不警示（作廢重開是正常流程）。
// - 銷貨 → 銷退：已過帳的銷退數量會自動從可退數量扣除，但草稿不會 → 只有存在未過帳的銷退草稿時
//   才警示（兩張草稿各帶滿可退數量，可能重複退貨）；只有已過帳／作廢的銷退單時僅列出、不警示。
// - 沒有任何衍生單據：維持原本文字與行為。
import { rocDate } from "@/lib/admin/minguo";
import type { DocStatus } from "./types";

/** 衍生單據（listDerivedDocuments 的結果取所需欄位）。 */
export interface DerivedDocInput {
  id: string;
  doc_no: string | null;
  status: DocStatus;
  /** 建立時間（timestamptz）；草稿無單號時顯示建立日期。 */
  created_at: string;
}

/** 確認框清單中的一列。 */
export interface DerivedDocRow {
  id: string;
  /** 單號；草稿無單號時為「草稿（建立於 民國…）」。 */
  label: string;
  status: DocStatus;
  voided: boolean;
}

/** 確認框內容：title / message / confirmLabel / tone 同 ConfirmOptions，docs 由元件渲染成清單。 */
export interface DerivedConfirm {
  title: string;
  message?: string;
  confirmLabel: string;
  tone?: "danger";
  docs: DerivedDocRow[];
}

const TPE_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** timestamptz → 台北時區的民國日期；無效回 null。 */
function tpeRocDate(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return rocDate(TPE_DATE.format(d));
}

function docLabel(d: DerivedDocInput): string {
  if (d.doc_no) return d.doc_no;
  const date = tpeRocDate(d.created_at);
  return date ? `草稿（建立於 ${date}）` : "草稿";
}

/** 未作廢在前、作廢在後（各自保留原順序：新→舊）。 */
function toRows(derived: DerivedDocInput[]): DerivedDocRow[] {
  const rows = derived.map((d) => ({
    id: d.id,
    label: docLabel(d),
    status: d.status,
    voided: d.status === "voided",
  }));
  return [...rows.filter((r) => !r.voided), ...rows.filter((r) => r.voided)];
}

/** 報價單「轉銷貨單」確認框。derived = 由此報價轉出的銷貨單（含草稿、作廢）。 */
export function reconvertConfirmOptions(
  derived: DerivedDocInput[],
): DerivedConfirm {
  const base = {
    title: "將此報價單複製為銷貨單草稿？",
    confirmLabel: "轉銷貨單",
  };
  if (derived.length === 0) return { ...base, docs: [] };
  const docs = toRows(derived);
  const active = docs.filter((d) => !d.voided).length;
  const voided = docs.length - active;
  if (active === 0) {
    return {
      ...base,
      message: `先前轉出的 ${voided} 張銷貨單皆已作廢：`,
      docs,
    };
  }
  return {
    title: `此報價已轉出 ${active} 張銷貨單，仍要再轉一次？`,
    message:
      "再轉一次可能重複出貨或重複開帳；分批出貨或作廢重開才需要再轉。請先確認下列單據" +
      (voided > 0 ? `（另有 ${voided} 張已作廢）` : "") +
      "：",
    confirmLabel: "仍要轉銷貨單",
    tone: "danger",
    docs,
  };
}

/** 銷貨單「建立銷退單」確認框。derived = 由此銷貨單建立的銷退單（含草稿、作廢）。 */
export function returnConfirmOptions(
  derived: DerivedDocInput[],
): DerivedConfirm {
  const base = {
    title: "從此銷貨單建立銷退單草稿？",
    confirmLabel: "建立銷退單",
  };
  if (derived.length === 0) return { ...base, docs: [] };
  const docs = toRows(derived);
  const drafts = docs.filter((d) => d.status === "draft").length;
  if (drafts > 0) {
    return {
      title: `此銷貨單已有 ${drafts} 張銷退草稿未過帳，仍要再建立？`,
      message:
        "銷退草稿過帳前不會扣除可退數量，再建立一張可能重複退貨；建議直接編輯既有草稿。已建立的銷退單：",
      confirmLabel: "仍要建立銷退單",
      tone: "danger",
      docs,
    };
  }
  const posted = docs.filter((d) => d.status === "posted").length;
  return {
    ...base,
    message:
      posted > 0
        ? "此銷貨單已有下列銷退單，已過帳的退貨數量會自動扣除："
        : `先前建立的 ${docs.length} 張銷退單皆已作廢：`,
    docs,
  };
}
