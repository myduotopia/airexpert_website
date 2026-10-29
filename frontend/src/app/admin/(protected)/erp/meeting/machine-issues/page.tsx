import { requireModule } from "@/lib/admin/auth";

export const metadata = { title: "新機問題 · 週報 · ERP · 後台" };

// 佔位頁（#271）：新機問題由 #272 實作（會覆蓋本檔），先放「建置中」避免子頁籤連結 404。
export default async function MeetingMachineIssuesPage() {
  await requireModule("erp");
  return (
    <div className="border-border text-text-muted rounded-xl border border-dashed bg-white px-6 py-10 text-center text-[14px]">
      「新機問題」建置中，敬請期待。
    </div>
  );
}
