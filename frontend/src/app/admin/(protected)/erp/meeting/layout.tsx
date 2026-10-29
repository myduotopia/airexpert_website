import { Suspense, type ReactNode } from "react";
import { MeetingTabs } from "@/components/erp/meeting/MeetingTabs";
import { requireModule } from "@/lib/admin/auth";

// ERP 週報（#271）：週會／月會用的四種資訊，子頁籤見 lib/erp/meeting/params.ts 的 MEETING_TABS。
// 上層 erp/layout 已檢查 erp 模組；此處再檢查一次（React cache 去重），讓頁面守門掃描明確看到。
export default async function MeetingLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireModule("erp");
  return (
    <div className="mx-auto max-w-[1400px]">
      <h1 className="text-ink text-[24px] font-bold">週報</h1>
      <p className="text-text-muted mt-1 mb-4 text-[14px]">
        週會與月會用的交機、進廠維修、新機問題與維護完成紀錄；可依期間篩選、列印
        A4 橫式報表或匯出 CSV（Excel 可直接開啟）。
      </p>
      <Suspense fallback={<div className="mb-5 h-10" />}>
        <MeetingTabs />
      </Suspense>
      {children}
    </div>
  );
}
