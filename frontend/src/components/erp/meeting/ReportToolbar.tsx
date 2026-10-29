"use client";

// ERP 週報（#271）共用報表工具列：日期區間（本週／上週／本月／上月／自訂）、關鍵字、額外篩選（children）、
// 列印報表（開新分頁到列印頁）、匯出 CSV（UTF-8 BOM，Blob 下載）。
//
// 查詢一律反映在網址（server page 讀 searchParams 後查資料），不在 client 端保留篩選狀態：
//   · range=this_week|last_week|this_month|last_month|custom（custom 另帶 from / to，見 lib/erp/meeting/date-range.ts）
//     presets 傳 MEETING_RANGE_PRESETS_WITH_ALL 時另有 range=all（不限日期，週報追蹤清單 #272）
//   · q=關鍵字
//   · 額外篩選：children 內的原生表單元件（select / input）只要有 name 就會一起送出，例：
//       <ReportToolbar …>
//         <label>技師 <select name="tech" defaultValue={tech} className={ERP_SELECT}>…</select></label>
//       </ReportToolbar>
//     值為空字串的參數不會出現在網址上。
// 換頁後以 key 重新掛載內部表單，children 的 defaultValue 會跟著網址更新：
//   key 用 query（目前完整條件，含 children 的額外篩選）；未傳時只依區間與關鍵字
//   （此時只改額外篩選的上一頁／下一頁，select 會停在舊值——原生 select 不會跟著 defaultValue 更新）。
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { RocDateInput } from "@/components/erp/RocDateInput";
import {
  ERP_BUTTON_SECONDARY,
  ERP_INPUT,
  ERP_LABEL,
} from "@/components/erp/styles";
import {
  MEETING_RANGE_PRESETS,
  validateCustomRange,
  type MeetingRange,
  type MeetingRangePreset,
} from "@/lib/erp/meeting/date-range";
import type { MeetingCsvFile } from "@/lib/erp/meeting/csv";

export interface ReportToolbarProps {
  /** 本頁路徑（例：/admin/erp/meeting/maintenance），查詢時導向此路徑＋查詢字串。 */
  basePath: string;
  /** server 端以 parseMeetingRange 解析後的區間。 */
  range: MeetingRange;
  /** 目前關鍵字（server 端 keywordParam 解析）。 */
  q: string;
  /**
   * 目前完整條件的查詢字串（含額外篩選，例：view.query）；變更時重新掛載表單，
   * 讓 children 的 defaultValue 跟上網址（瀏覽器上一頁／下一頁）。
   */
  query?: string;
  /** 關鍵字欄的提示文字。 */
  keywordPlaceholder?: string;
  /** 額外篩選（原生表單元件，需有 name）。 */
  children?: ReactNode;
  /** 列印頁連結（含目前查詢條件，例：meetingPrintHref("maintenance", query)）；null＝不顯示。 */
  printHref?: string | null;
  /** 要下載的 CSV（server 端以 meetingCsvFile 產生）；null＝不顯示。 */
  csv?: MeetingCsvFile | null;
  /** 工具列下方的摘要（例：「共 12 筆」）。 */
  summary?: ReactNode;
  /** 期間選項（預設 MEETING_RANGE_PRESETS；週報追蹤清單傳 MEETING_RANGE_PRESETS_WITH_ALL）。 */
  presets?: readonly { key: MeetingRangePreset; label: string }[];
}

export function ReportToolbar(props: ReportToolbarProps) {
  const { range, q, query } = props;
  const key = query ?? `${range.preset}|${range.from}|${range.to}|${q}`;
  return <ToolbarForm key={key} {...props} />;
}

function ToolbarForm({
  basePath,
  range,
  q,
  keywordPlaceholder = "關鍵字",
  children,
  printHref,
  csv,
  summary,
  presets = MEETING_RANGE_PRESETS,
}: ReportToolbarProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [preset, setPreset] = useState<MeetingRangePreset>(range.preset);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /** 讀表單（含 children 的具名欄位）→ 導頁；overrides 的 null＝移除該參數。 */
  function navigate(overrides: Record<string, string | null> = {}) {
    const form = formRef.current;
    if (!form) return;
    const qs = new URLSearchParams();
    for (const [k, v] of new FormData(form)) {
      if (typeof v === "string" && v.trim() !== "") qs.append(k, v.trim());
    }
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) qs.delete(k);
      else qs.set(k, v);
    }
    const query = qs.toString();
    startTransition(() => {
      router.push(query ? `${basePath}?${query}` : basePath);
    });
  }

  function pickPreset(next: MeetingRangePreset) {
    setError(null);
    setPreset(next);
    if (next !== "custom") {
      navigate({ range: next, from: null, to: null });
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (preset === "custom") {
      const invalid = validateCustomRange(from, to);
      if (invalid) {
        setError(invalid);
        return;
      }
    }
    navigate();
  }

  function downloadCsv() {
    if (!csv) return;
    const blob = new Blob([csv.content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csv.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="mb-4 flex flex-col gap-2">
      <form
        ref={formRef}
        onSubmit={submit}
        className="border-border flex flex-col gap-3 rounded-xl border bg-white p-4"
        aria-label="報表條件"
      >
        <input type="hidden" name="range" value={preset} />
        <div className="flex flex-wrap items-center gap-2">
          <span className={ERP_LABEL}>期間</span>
          <div
            role="group"
            aria-label="期間"
            className="flex flex-wrap gap-1.5"
          >
            {presets.map((p) => {
              const on = p.key === preset;
              return (
                <button
                  key={p.key}
                  type="button"
                  aria-pressed={on}
                  disabled={pending}
                  onClick={() => pickPreset(p.key)}
                  className={`inline-flex h-9 items-center rounded-lg border px-3 text-[13px] font-semibold disabled:opacity-60 ${
                    on
                      ? "border-primary bg-primary text-white"
                      : "border-border hover:bg-surface-muted bg-white"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {preset === "custom" ? (
            <div className="flex flex-wrap items-center gap-2">
              <RocDateInput
                name="from"
                value={from}
                onChange={setFrom}
                aria-label="起日"
              />
              <span className="text-text-muted text-[13px]">至</span>
              <RocDateInput
                name="to"
                value={to}
                onChange={setTo}
                aria-label="迄日"
              />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-[200px] flex-1 flex-col gap-1.5 sm:max-w-[320px]">
            <span className={ERP_LABEL}>關鍵字</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              maxLength={100}
              placeholder={keywordPlaceholder}
              className={ERP_INPUT}
            />
          </label>
          {children}
          <button
            type="submit"
            disabled={pending}
            className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "查詢中…" : "查詢"}
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {printHref ? (
              <a
                href={printHref}
                target="_blank"
                rel="noopener"
                className={ERP_BUTTON_SECONDARY}
              >
                列印報表
              </a>
            ) : null}
            {csv ? (
              <button
                type="button"
                onClick={downloadCsv}
                className={ERP_BUTTON_SECONDARY}
              >
                匯出 CSV
              </button>
            ) : null}
          </div>
        </div>
        {error ? (
          <p role="alert" className="text-[14px] text-red-600">
            {error}
          </p>
        ) : null}
      </form>
      {range.error ? (
        <p
          role="alert"
          className="rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
        >
          {range.error}
        </p>
      ) : null}
      {summary ? (
        <div className="text-text-muted text-[13px]">{summary}</div>
      ) : null}
    </div>
  );
}
