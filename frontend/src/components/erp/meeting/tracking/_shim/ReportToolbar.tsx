"use client";
// ⚠️ 暫代版（#272）：#271 合併後改用 components/erp/meeting/ReportToolbar.tsx，並刪除本檔。
// 週報子頁籤共用的報表工具列：GET 表單（日期區間＋快速選項、關鍵字、額外篩選 slot）、列印報表、匯出 CSV。
// - 額外篩選以 children 傳入（原生 <select name=…>，隨表單送出）。
// - 日期區間預設空白（追蹤清單看全部未結案）；快速選項只填入起迄，按「查詢」才套用。
// - 列印：連到 printHref（同頁的列印模式，列出全部符合篩選的資料）。
// - 匯出：呼叫已綁定篩選參數的 server action，回傳含 BOM 的 CSV 字串後下載。
import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { ERP_BUTTON_SECONDARY, ERP_INPUT } from "@/components/erp/styles";
import type { ErpResult } from "@/lib/erp/types";
import { downloadCsv } from "./csv";
import { DATE_PRESETS, presetRange } from "./date-range";

const BTN_PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-9 items-center rounded-lg px-3 text-[13px] font-semibold text-white";

export interface ReportToolbarProps {
  basePath: string;
  /** 日期區間依據，例「交機時間」。 */
  dateLabel: string;
  from: string;
  to: string;
  q: string;
  qPlaceholder: string;
  /** 台北今天（YYYY-MM-DD），快速選項計算用。 */
  today: string;
  /** 額外篩選（<select name=…> 等）。 */
  children?: ReactNode;
  printHref: string;
  exportCsv: () => Promise<ErpResult<{ filename: string; csv: string }>>;
}

export function ReportToolbar({
  basePath,
  dateLabel,
  from,
  to,
  q,
  qPlaceholder,
  today,
  children,
  printHref,
  exportCsv,
}: ReportToolbarProps) {
  const [range, setRange] = useState({ from, to });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function runExport() {
    setError(null);
    startTransition(async () => {
      const res = await exportCsv();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      downloadCsv(res.data.csv, res.data.filename);
    });
  }

  return (
    <form
      method="get"
      action={basePath}
      className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4 print:hidden"
    >
      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[13px]">
        <span className="text-text-muted">關鍵字</span>
        <input
          name="q"
          defaultValue={q}
          placeholder={qPlaceholder}
          className={ERP_INPUT}
        />
      </label>
      <fieldset className="flex flex-col gap-1 text-[13px]">
        <legend className="text-text-muted mb-1">{dateLabel}</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          <input
            type="date"
            name="from"
            aria-label={`${dateLabel}（起）`}
            value={range.from}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className={`${ERP_INPUT} w-[150px]`}
          />
          <span className="text-text-muted">~</span>
          <input
            type="date"
            name="to"
            aria-label={`${dateLabel}（迄）`}
            value={range.to}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className={`${ERP_INPUT} w-[150px]`}
          />
          {DATE_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              className={ERP_BUTTON_SECONDARY}
              onClick={() => setRange(presetRange(p.key, today))}
            >
              {p.label}
            </button>
          ))}
          {(range.from || range.to) && (
            <button
              type="button"
              className={ERP_BUTTON_SECONDARY}
              onClick={() => setRange({ from: "", to: "" })}
            >
              不限日期
            </button>
          )}
        </div>
      </fieldset>
      {children}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" className={BTN_PRIMARY}>
          查詢
        </button>
        <Link href={basePath} className={ERP_BUTTON_SECONDARY}>
          清除
        </Link>
        <Link href={printHref} className={ERP_BUTTON_SECONDARY}>
          列印報表
        </Link>
        <button
          type="button"
          onClick={runExport}
          disabled={pending}
          className={ERP_BUTTON_SECONDARY}
        >
          {pending ? "匯出中…" : "匯出 CSV"}
        </button>
        {error && (
          <span role="alert" className="text-[13px] text-red-600">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
