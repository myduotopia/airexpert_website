"use client";
// 機台對應頁每列的方案下拉：選「（自動比對）」＝清除逐台指定，改回依馬力比對。
// 變更即存（setMachinePlanAction），成功／失敗就地顯示，不影響其他列。
import { useState, useTransition } from "react";
import { unstable_rethrow, useRouter } from "next/navigation";
import { ERP_SELECT } from "@/components/erp/styles";
import type { ServicePlan } from "@/lib/service-report/plan/types";
import { setMachinePlanAction } from "../actions";

/** 下拉的「清除指定」選項值（空字串＝依馬力自動比對）。 */
export const AUTO_MATCH_VALUE = "";
export const AUTO_MATCH_LABEL = "（自動比對）";

export function MachinePlanSelect({
  machineId,
  machineLabel,
  overridePlanId,
  plans,
}: {
  machineId: string;
  /** 只用於 aria-label，讓每個下拉有可辨識的名稱。 */
  machineLabel: string;
  /** 目前逐台指定的方案 id；null＝未指定。 */
  overridePlanId: string | null;
  plans: readonly ServicePlan[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(overridePlanId ?? AUTO_MATCH_VALUE);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function onChange(next: string) {
    const previous = value;
    setValue(next);
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        const res = await setMachinePlanAction(
          machineId,
          next === AUTO_MATCH_VALUE ? null : next,
        );
        if (!res.ok) {
          setValue(previous);
          setError(res.error);
          return;
        }
        setSaved(true);
        router.refresh();
      } catch (e) {
        unstable_rethrow(e);
        setValue(previous);
        setError("儲存失敗，請檢查網路連線後再試一次。");
      }
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <select
        aria-label={`${machineLabel} 指定保養方案`}
        className={`${ERP_SELECT} min-w-[180px]`}
        value={value}
        disabled={pending}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={AUTO_MATCH_VALUE}>{AUTO_MATCH_LABEL}</option>
        {plans.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.active ? "" : "（停用）"}
          </option>
        ))}
      </select>
      {pending && <span className="text-text-muted text-[12px]">儲存中…</span>}
      {!pending && saved && (
        <span className="text-primary-deep text-[12px]">已儲存</span>
      )}
      {error && (
        <span role="alert" className="text-[12px] text-red-600">
          {error}
        </span>
      )}
    </div>
  );
}
