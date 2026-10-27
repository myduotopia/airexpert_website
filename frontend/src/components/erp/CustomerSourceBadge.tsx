// 客戶來源標籤（mx_customers.source，#266）：FB（Facebook 來的客戶）以品牌藍標示，其他來源為灰色原文；
// 未填時不顯示（fallback 給值時改顯示 fallback，例：詳情頁的「—」）。無 hooks，server / client 皆可用。
// ERP 客戶列表／詳情與保養卡客戶列表共用。
import type { ReactNode } from "react";
import { customerSourceLabel, isFbSource } from "@/lib/erp/customer-source";

export function CustomerSourceBadge({
  source,
  fallback = null,
}: {
  source: string | null | undefined;
  fallback?: ReactNode;
}) {
  const label = customerSourceLabel(source);
  if (!label) return <>{fallback}</>;
  return isFbSource(source) ? (
    <span
      className="inline-flex items-center rounded-full bg-blue-50 px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap text-blue-700"
      title="客戶來源：FB（Facebook）"
    >
      FB
    </span>
  ) : (
    <span
      className="inline-flex max-w-[12em] items-center truncate rounded-full bg-gray-100 px-2 py-0.5 text-[12px] font-medium whitespace-nowrap text-gray-600"
      title={`客戶來源：${label}`}
    >
      {label}
    </span>
  );
}
