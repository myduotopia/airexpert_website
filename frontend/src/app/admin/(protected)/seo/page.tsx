import { requireRole } from "@/lib/admin/auth";
import { getAllForSeo } from "@/lib/data/seo-overview";
import { SeoOverviewClient } from "./SeoOverviewClient";

export const metadata = { title: "SEO 總覽 · 後台" };

// 統一 SEO 總覽（V3-4）：跨五區（商品 / 最新消息 / 服務 / 節能實績 / 公司活動）列出 SEO 狀態、
// 標示缺漏並快速編輯 meta。為 seo_manager 的主要工作區（admin 亦可進）。
// requireRole 在任何 service_role 讀取前先守門。
export default async function AdminSeoOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole(["admin", "seo_manager"]);
  const rows = await getAllForSeo();
  const { q } = await searchParams;

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-ink text-[24px] font-bold">SEO 總覽</h1>
        <p className="text-text-muted mt-1 text-[14px]">
          跨五區檢視 SEO 缺漏並快速編輯 meta。僅顯示「已發佈 /
          草稿」內容；此處只編 SEO，不改內文。
        </p>
      </div>

      <SeoOverviewClient rows={rows} initialQuery={q ?? ""} />
    </div>
  );
}
