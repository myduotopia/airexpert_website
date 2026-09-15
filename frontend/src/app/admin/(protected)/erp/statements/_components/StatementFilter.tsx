"use client";
// 對帳單條件：客戶 / 廠商 + 期間（民國）→ 以 query string 導頁（server 端預覽）。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CustomerPicker } from "@/components/erp/CustomerPicker";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { VendorPicker } from "@/components/erp/VendorPicker";
import { ERP_LABEL } from "@/components/erp/styles";
import type { CustomerOption, PartyType, VendorOption } from "@/lib/erp/types";

export function StatementFilter({
  customers,
  vendors,
  initial,
}: {
  customers: CustomerOption[];
  vendors: VendorOption[];
  initial: {
    type: PartyType;
    id: string | null;
    from: string;
    to: string;
  };
}) {
  const router = useRouter();
  const [type, setType] = useState<PartyType>(initial.type);
  const [partyId, setPartyId] = useState<string | null>(initial.id);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!partyId) {
      setError(`請選擇${type === "customer" ? "客戶" : "廠商"}。`);
      return;
    }
    if (!from || !to) {
      setError("請填寫完整的起訖日期。");
      return;
    }
    if (from > to) {
      setError("起日不可晚於迄日。");
      return;
    }
    const qs = new URLSearchParams({
      party: `${type}:${partyId}`,
      from,
      to,
    });
    router.push(`/admin/erp/statements?${qs.toString()}`);
  }

  return (
    <form
      onSubmit={submit}
      className="border-border grid gap-4 rounded-xl border bg-white p-5 md:grid-cols-[auto_1fr]"
    >
      <fieldset className="space-y-1.5">
        <legend className={ERP_LABEL}>對象</legend>
        <div className="flex h-10 items-center gap-4 text-[14px]">
          {(["customer", "vendor"] as const).map((t) => (
            <label key={t} className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                name="party-type"
                checked={type === t}
                onChange={() => {
                  setType(t);
                  setPartyId(null);
                }}
              />
              {t === "customer" ? "客戶" : "廠商"}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-1.5">
        <span className={ERP_LABEL}>
          {type === "customer" ? "客戶" : "廠商"}
        </span>
        {type === "customer" ? (
          <CustomerPicker
            options={customers}
            value={partyId}
            onChange={(id) => setPartyId(id)}
          />
        ) : (
          <VendorPicker
            options={vendors}
            value={partyId}
            onChange={(id) => setPartyId(id)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-end gap-4 md:col-span-2">
        <div className="space-y-1.5">
          <span className={ERP_LABEL}>起日</span>
          <RocDateInput value={from} onChange={setFrom} aria-label="起日" />
        </div>
        <div className="space-y-1.5">
          <span className={ERP_LABEL}>迄日</span>
          <RocDateInput value={to} onChange={setTo} aria-label="迄日" />
        </div>
        <button
          type="submit"
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-semibold text-white"
        >
          預覽對帳單
        </button>
        {error && (
          <p role="alert" className="text-[14px] text-red-600">
            {error}
          </p>
        )}
      </div>
    </form>
  );
}
