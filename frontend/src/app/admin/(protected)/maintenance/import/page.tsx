import { requireRole } from "@/lib/admin/auth";
import { ImportReview } from "@/components/admin/maintenance/ImportReview";

export const metadata = { title: "拍照辨識 · 後台" };

export default async function ImportPage() {
  await requireRole(["office"]);
  return (
    <div className="mx-auto max-w-[1000px]">
      <h1 className="text-ink mb-2 text-[24px] font-bold">拍照辨識</h1>
      <p className="text-text-muted mb-6 text-[14px]">
        拍下保養卡，AI 會擷取內容供你確認、修改後再存入保養卡。
      </p>
      <ImportReview />
    </div>
  );
}
