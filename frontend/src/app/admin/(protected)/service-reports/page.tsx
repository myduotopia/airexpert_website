import { requireModule } from "@/lib/admin/auth";

export const metadata = { title: "機台維護報告單 · 後台" };

// 佔位頁：管理列表於 #193 實作。
export default async function ServiceReportsPage() {
  await requireModule("service_report");
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-ink text-[24px] font-bold">機台維護報告單</h1>
      <p className="text-text-muted text-[14px]">報告單列表建置中（#193）。</p>
    </div>
  );
}
