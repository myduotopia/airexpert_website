import { requireModule } from "@/lib/admin/auth";

export const metadata = { title: "ERP 總覽 · 後台" };

// ERP 總覽佔位頁。總覽卡片（本月銷貨額、毛利、應收應付、低庫存、到期支票）由 #179 補上。
export default async function ErpOverviewPage() {
  // layout 已守門；page 與 layout 平行 render，保險起見再檢查一次（cache 去重，不多查）。
  await requireModule("erp");

  return (
    <div className="mx-auto max-w-[1040px]">
      <h1 className="text-ink text-[24px] font-bold">ERP 總覽</h1>
      <p className="text-text-muted mt-1 text-[14px]">
        進銷存、採購、應收應付與庫存管理。各功能區段將陸續開放，側欄灰色項目為尚未開放。
      </p>
    </div>
  );
}
