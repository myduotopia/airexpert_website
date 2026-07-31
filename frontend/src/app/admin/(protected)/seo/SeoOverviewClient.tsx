"use client";

import { useMemo, useState } from "react";
import {
  SEO_OVERVIEW_TABLES,
  filterSeoRows,
  summarizeSeoRows,
  isMissingSeoTitle,
  isMissingSeoDescription,
  isMissingOgImage,
  hasAnyMissing,
  type SeoRow,
  type SeoTable,
} from "@/lib/admin/seo-overview";
import { SeoEditRow } from "./SeoEditRow";

// 統一 SEO 總覽 client 殼層：類型篩選 + 文字搜尋 + 缺漏統計，點列展開行內快速編輯。
// 資料由 server page 一次撈齊（getAllForSeo），此處只做 client 端篩選與展開，避免逐列再打 API。

const inputCls =
  "border-border focus:border-primary h-10 rounded-lg border bg-white px-3 text-[14px] outline-none";

/** 缺漏標籤（紅底警示）。 */
function MissingTag({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[12px] font-medium text-red-700">
      缺{label}
    </span>
  );
}

/** 已填標籤（綠勾）。 */
function OkTag({ label }: { label: string }) {
  return (
    <span className="text-primary-deep inline-flex items-center gap-0.5 text-[12px]">
      ✓{label}
    </span>
  );
}

function StatusPill({ status }: { status: SeoRow["status"] }) {
  const label = status === "published" ? "已發佈" : "草稿";
  const cls =
    status === "published"
      ? "bg-primary/10 text-primary-deep"
      : "bg-amber-100 text-amber-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

export function SeoOverviewClient({
  rows,
  initialQuery = "",
}: {
  rows: SeoRow[];
  initialQuery?: string;
}) {
  const [table, setTable] = useState<SeoTable | "all">("all");
  const [query, setQuery] = useState(initialQuery);
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const summary = useMemo(() => summarizeSeoRows(rows), [rows]);
  const filtered = useMemo(
    () => filterSeoRows(rows, { table, query, onlyMissing }),
    [rows, table, query, onlyMissing],
  );

  return (
    <div className="flex flex-col gap-5">
      {/* 缺漏統計 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="總筆數" value={summary.total} />
        <SummaryCard
          label="缺 SEO 標題"
          value={summary.missingSeoTitle}
          warn={summary.missingSeoTitle > 0}
        />
        <SummaryCard
          label="缺 SEO 描述"
          value={summary.missingSeoDescription}
          warn={summary.missingSeoDescription > 0}
        />
        <SummaryCard
          label="缺 OG 圖"
          value={summary.missingOgImage}
          warn={summary.missingOgImage > 0}
        />
      </div>

      {/* 篩選列 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          aria-label="依類型篩選"
          value={table}
          onChange={(e) => setTable(e.target.value as SeoTable | "all")}
          className={inputCls}
        >
          <option value="all">全部類型</option>
          {SEO_OVERVIEW_TABLES.map((c) => (
            <option key={c.table} value={c.table}>
              {c.typeLabel}
            </option>
          ))}
        </select>

        <input
          type="search"
          aria-label="搜尋標題或 slug"
          placeholder="搜尋標題或 slug…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={`${inputCls} min-w-[220px] flex-1`}
        />

        <label className="text-ink flex items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            className="h-4 w-4"
          />
          只看有缺漏
        </label>

        <span className="text-text-muted text-[13px]">
          顯示 {filtered.length} / {rows.length} 筆
        </span>
      </div>

      {/* 表格 */}
      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border text-text-muted border-b">
              <th className="px-4 py-3 font-medium">類型</th>
              <th className="px-4 py-3 font-medium">標題 / slug</th>
              <th className="px-4 py-3 font-medium">SEO 標題</th>
              <th className="px-4 py-3 font-medium">SEO 描述</th>
              <th className="px-4 py-3 font-medium">Canonical</th>
              <th className="px-4 py-3 font-medium">OG 狀態</th>
              <th className="px-4 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="text-text-muted px-4 py-8 text-center"
                >
                  沒有符合條件的內容。
                </td>
              </tr>
            ) : (
              filtered.map((row) => {
                const key = `${row.table}:${row.id}`;
                const isOpen = openKey === key;
                return (
                  <RowWithEditor
                    key={key}
                    row={row}
                    isOpen={isOpen}
                    onToggle={() => setOpenKey(isOpen ? null : key)}
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: number;
  warn?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        warn ? "border-red-200 bg-red-50" : "border-border bg-white"
      }`}
    >
      <div className="text-text-muted text-[13px]">{label}</div>
      <div
        className={`mt-1 text-[24px] font-bold ${
          warn ? "text-red-700" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function RowWithEditor({
  row,
  isOpen,
  onToggle,
}: {
  row: SeoRow;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const rowWarn = hasAnyMissing(row);
  return (
    <>
      <tr
        className={`border-border border-b last:border-b-0 ${
          rowWarn ? "bg-red-50/40" : "hover:bg-surface-muted"
        }`}
      >
        <td className="text-ink px-4 py-3 whitespace-nowrap">
          {row.typeLabel}
        </td>
        <td className="px-4 py-3">
          <div className="text-ink font-medium">{row.title}</div>
          <div className="text-text-muted font-mono text-[12px]">
            {row.slug ?? "—"}
          </div>
          <div className="mt-1">
            <StatusPill status={row.status} />
          </div>
        </td>
        <td className="px-4 py-3">
          {isMissingSeoTitle(row) ? (
            <MissingTag label="標題" />
          ) : (
            <span className="text-ink line-clamp-2 max-w-[220px]">
              {row.seo_title}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          {isMissingSeoDescription(row) ? (
            <MissingTag label="描述" />
          ) : (
            <span className="text-text-muted line-clamp-2 max-w-[240px]">
              {row.seo_description}
            </span>
          )}
        </td>
        <td className="px-4 py-3">
          {row.canonical_url ? (
            <span className="text-text-muted font-mono text-[12px]">
              已設定
            </span>
          ) : (
            <span className="text-text-muted text-[12px]">—</span>
          )}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {isMissingOgImage(row) ? (
            <MissingTag label="OG 圖" />
          ) : (
            <OkTag label="OG 圖" />
          )}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={isOpen}
            className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
          >
            {isOpen ? "收合" : "編輯 SEO"}
          </button>
        </td>
      </tr>
      {isOpen ? (
        <tr className="border-border border-b last:border-b-0">
          <td colSpan={7} className="bg-surface-muted/40 px-4 py-5">
            <SeoEditRow row={row} onSaved={onToggle} />
          </td>
        </tr>
      ) : null}
    </>
  );
}
