"use client";
// 單據列表篩選：關鍵字（單號 / 客戶）、民國日期區間、狀態。送出時改寫 query string（回到第 1 頁）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { DOC_STATUS_LABEL } from "@/components/erp/DocStatusBadge";
import {
  ERP_BUTTON_SECONDARY,
  ERP_INPUT,
  ERP_SELECT,
} from "@/components/erp/styles";
import { DOC_STATUSES } from "@/lib/erp/types";

export function DocListFilters({
  basePath,
  initial,
}: {
  basePath: string;
  initial: { q: string; status: string; from: string; to: string };
}) {
  const router = useRouter();
  const [q, setQ] = useState(initial.q);
  const [status, setStatus] = useState(initial.status);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  function apply(next: typeof initial) {
    const params = new URLSearchParams();
    if (next.q.trim()) params.set("q", next.q.trim());
    if (next.status) params.set("status", next.status);
    if (next.from) params.set("from", next.from);
    if (next.to) params.set("to", next.to);
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
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
          placeholder="單號 / 客戶名稱"
          className={ERP_INPUT}
        />
      </label>
      <div className="flex flex-col gap-1 text-[13px]">
        <span className="text-text-muted">日期起</span>
        <RocDateInput value={from} onChange={setFrom} aria-label="日期起" />
      </div>
      <div className="flex flex-col gap-1 text-[13px]">
        <span className="text-text-muted">日期迄</span>
        <RocDateInput value={to} onChange={setTo} aria-label="日期迄" />
      </div>
      <label className="flex w-32 flex-col gap-1 text-[13px]">
        <span className="text-text-muted">狀態</span>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className={ERP_SELECT}
        >
          <option value="">全部</option>
          {DOC_STATUSES.map((s) => (
            <option key={s} value={s}>
              {DOC_STATUS_LABEL[s]}
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
            const empty = { q: "", status: "", from: "", to: "" };
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
