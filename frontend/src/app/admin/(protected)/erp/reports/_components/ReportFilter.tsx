"use client";
// 報表條件：銷售毛利（期間 + 彙總方式）／帳齡（基準日）→ 以 query string 導頁（server 端計算）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { ERP_LABEL, ERP_SELECT } from "@/components/erp/styles";
import type { SalesGroupBy } from "@/lib/erp/reports";

const GROUP_LABEL: Record<SalesGroupBy, string> = {
  customer: "客戶",
  item: "品項",
  sales_rep: "業務",
};

export function ReportFilter({
  tab,
  initial,
}: {
  tab: "margin" | "ar" | "ap";
  initial: { from: string; to: string; group: SalesGroupBy; asOf: string };
}) {
  const router = useRouter();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [group, setGroup] = useState<SalesGroupBy>(initial.group);
  const [asOf, setAsOf] = useState(initial.asOf);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const qs = new URLSearchParams({ tab });
    if (tab === "margin") {
      if (!from || !to) {
        setError("請填寫完整的起訖日期。");
        return;
      }
      if (from > to) {
        setError("起日不可晚於迄日。");
        return;
      }
      qs.set("from", from);
      qs.set("to", to);
      qs.set("group", group);
    } else {
      if (!asOf) {
        setError("請填寫完整的基準日。");
        return;
      }
      qs.set("asOf", asOf);
    }
    router.push(`/admin/erp/reports?${qs.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="border-border flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4"
    >
      {tab === "margin" ? (
        <>
          <div className="space-y-1.5">
            <span className={ERP_LABEL}>起日</span>
            <RocDateInput value={from} onChange={setFrom} aria-label="起日" />
          </div>
          <div className="space-y-1.5">
            <span className={ERP_LABEL}>迄日</span>
            <RocDateInput value={to} onChange={setTo} aria-label="迄日" />
          </div>
          <label className="space-y-1.5">
            <span className={ERP_LABEL}>彙總方式</span>
            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as SalesGroupBy)}
              className={`${ERP_SELECT} w-28`}
            >
              {(Object.keys(GROUP_LABEL) as SalesGroupBy[]).map((g) => (
                <option key={g} value={g}>
                  依{GROUP_LABEL[g]}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <div className="space-y-1.5">
          <span className={ERP_LABEL}>帳齡基準日</span>
          <RocDateInput value={asOf} onChange={setAsOf} aria-label="基準日" />
        </div>
      )}
      <button
        type="submit"
        className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-semibold text-white"
      >
        查詢
      </button>
      {error && (
        <p role="alert" className="text-[14px] text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
