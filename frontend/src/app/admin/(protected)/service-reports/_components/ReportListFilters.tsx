"use client";
// 報告單列表篩選：關鍵字（單號 / 客戶 / 設備 / 編號）、維護日期區間（民國輸入）、狀態。
// 送出時改寫 query string（回到第 1 頁），篩選狀態全部保存在 URL。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RocDateInput } from "@/components/erp/RocDateInput";
import {
  ERP_BUTTON_SECONDARY,
  ERP_INPUT,
  ERP_SELECT,
} from "@/components/erp/styles";
import { STATUS_LABELS } from "@/lib/service-report/types";
import { reportListHref, type ReportListQuery } from "./list-params";

type FilterState = Omit<ReportListQuery, "page">;

const STATUS_OPTIONS = Object.keys(
  STATUS_LABELS,
) as (keyof typeof STATUS_LABELS)[];

export function ReportListFilters({ initial }: { initial: FilterState }) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [status, setStatus] = useState<FilterState["status"]>(initial.status);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  function apply(next: FilterState) {
    router.push(reportListHref({ ...next, page: 1 }));
  }

  return (
    <form
      className="mb-4 flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply({ q, status, from, to });
      }}
    >
      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[13px]">
        <span className="text-text-muted">搜尋</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="派工單號 / 客戶名稱 / 設備 / 編號"
          className={ERP_INPUT}
        />
      </label>
      <div className="flex flex-col gap-1 text-[13px]">
        <span className="text-text-muted">維護日期起</span>
        <RocDateInput value={from} onChange={setFrom} aria-label="維護日期起" />
      </div>
      <div className="flex flex-col gap-1 text-[13px]">
        <span className="text-text-muted">維護日期迄</span>
        <RocDateInput value={to} onChange={setTo} aria-label="維護日期迄" />
      </div>
      <label className="flex w-32 flex-col gap-1 text-[13px]">
        <span className="text-text-muted">狀態</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as FilterState["status"])}
          className={ERP_SELECT}
        >
          <option value="">全部</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
        >
          查詢
        </button>
        <button
          type="button"
          className={`${ERP_BUTTON_SECONDARY} h-10`}
          onClick={() => {
            const empty: FilterState = { q: "", status: "", from: "", to: "" };
            setQ("");
            setStatus("");
            setFrom("");
            setTo("");
            apply(empty);
          }}
        >
          清除
        </button>
      </div>
    </form>
  );
}
