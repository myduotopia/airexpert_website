import { requireRole } from "@/lib/admin/auth";

export const metadata = { title: "保養記錄卡 · 後台" };

export default async function MaintenancePage() {
  await requireRole(["office"]);
  return (
    <div className="mx-auto max-w-[1040px]">
      <h1 className="text-ink text-[24px] font-bold">保養記錄卡</h1>
      <p className="text-text-muted mt-1 text-[14px]">功能建置中。</p>
    </div>
  );
}
