"use client";

// 單據列表篩選（GET 表單）：關鍵字、狀態、民國日期區間。送出時頁碼回到 1。
import Link from "next/link";
import { useState } from "react";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";

export function DocListFilters({
  basePath,
  q,
  status,
  from,
  to,
  showStatus = true,
  searchPlaceholder = "搜尋單號 / 廠商",
}: {
  basePath: string;
  q: string;
  status: string;
  from: string;
  to: string;
  showStatus?: boolean;
  searchPlaceholder?: string;
}) {
  const [fromIso, setFromIso] = useState(from);
  const [toIso, setToIso] = useState(to);

  return (
    <form
      method="get"
      action={basePath}
      className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3"
    >
      <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-[13px]">
        <span className="text-text-muted">關鍵字</span>
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={searchPlaceholder}
          className={ERP_INPUT}
        />
      </label>
      {showStatus && (
        <label className="flex w-32 flex-col gap-1 text-[13px]">
          <span className="text-text-muted">狀態</span>
          <select name="status" defaultValue={status} className={ERP_SELECT}>
            <option value="">全部</option>
            <option value="draft">草稿</option>
            <option value="posted">已過帳</option>
            <option value="voided">已作廢</option>
          </select>
        </label>
      )}
      <div className="flex flex-col gap-1 text-[13px]">
        <span className="text-text-muted">日期起</span>
        <RocDateInput
          aria-label="日期起"
          value={fromIso}
          onChange={setFromIso}
          name="from"
        />
      </div>
      <div className="flex flex-col gap-1 text-[13px]">
        <span className="text-text-muted">日期迄</span>
        <RocDateInput
          aria-label="日期迄"
          value={toIso}
          onChange={setToIso}
          name="to"
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-primary hover:bg-primary-deep h-10 rounded-lg px-4 text-[14px] font-semibold text-white"
        >
          查詢
        </button>
        <Link
          href={basePath}
          className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold"
        >
          清除
        </Link>
      </div>
    </form>
  );
}
