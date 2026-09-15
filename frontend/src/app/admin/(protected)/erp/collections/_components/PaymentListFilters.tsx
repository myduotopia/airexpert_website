"use client";
// 收付款列表篩選：關鍵字、日期區間（民國）、方式、支票狀態 → 以 query string 導頁。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RocDateInput } from "@/components/erp/RocDateInput";
import {
  ERP_BUTTON_SECONDARY,
  ERP_INPUT,
  ERP_SELECT,
} from "@/components/erp/styles";
import { PAYMENT_METHOD_LABEL } from "@/lib/erp/statement";
import type { CheckStatus, PaymentMethod } from "@/lib/erp/types";
import { CHECK_STATUS_LABEL, PAYMENT_METHODS } from "./allocation";

export interface PaymentFilterValues {
  q: string;
  from: string;
  to: string;
  method: PaymentMethod | "";
  check: CheckStatus | "";
}

export function PaymentListFilters({
  basePath,
  initial,
}: {
  basePath: string;
  initial: PaymentFilterValues;
}) {
  const router = useRouter();
  const [v, setV] = useState(initial);

  function go(values: PaymentFilterValues) {
    const qs = new URLSearchParams();
    if (values.q.trim()) qs.set("q", values.q.trim());
    if (values.from) qs.set("from", values.from);
    if (values.to) qs.set("to", values.to);
    if (values.method) qs.set("method", values.method);
    if (values.check) qs.set("check", values.check);
    const s = qs.toString();
    router.push(s ? `${basePath}?${s}` : basePath);
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(v);
      }}
      className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
    >
      <div className="min-w-[200px] flex-1">
        <label htmlFor="pf-q" className="text-text-muted text-[12px]">
          關鍵字
        </label>
        <input
          id="pf-q"
          value={v.q}
          onChange={(e) => setV({ ...v, q: e.target.value })}
          placeholder="單號 / 票號 / 對象編號名稱"
          className={ERP_INPUT}
        />
      </div>
      <div>
        <span className="text-text-muted text-[12px]">起日</span>
        <RocDateInput
          value={v.from}
          onChange={(iso) => setV({ ...v, from: iso })}
          aria-label="起日"
        />
      </div>
      <div>
        <span className="text-text-muted text-[12px]">迄日</span>
        <RocDateInput
          value={v.to}
          onChange={(iso) => setV({ ...v, to: iso })}
          aria-label="迄日"
        />
      </div>
      <div className="w-32">
        <label htmlFor="pf-method" className="text-text-muted text-[12px]">
          方式
        </label>
        <select
          id="pf-method"
          value={v.method}
          onChange={(e) =>
            setV({ ...v, method: e.target.value as PaymentMethod | "" })
          }
          className={ERP_SELECT}
        >
          <option value="">全部</option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_METHOD_LABEL[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="w-32">
        <label htmlFor="pf-check" className="text-text-muted text-[12px]">
          支票狀態
        </label>
        <select
          id="pf-check"
          value={v.check}
          onChange={(e) =>
            setV({ ...v, check: e.target.value as CheckStatus | "" })
          }
          className={ERP_SELECT}
        >
          <option value="">全部</option>
          {(Object.keys(CHECK_STATUS_LABEL) as CheckStatus[]).map((s) => (
            <option key={s} value={s}>
              {CHECK_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
        >
          篩選
        </button>
        <button
          type="button"
          onClick={() => {
            const empty: PaymentFilterValues = {
              q: "",
              from: "",
              to: "",
              method: "",
              check: "",
            };
            setV(empty);
            go(empty);
          }}
          className={`${ERP_BUTTON_SECONDARY} h-10`}
        >
          清除
        </button>
      </div>
    </form>
  );
}
