import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentModules, getCurrentUserRole } from "@/lib/admin/auth";
import { dashboardSectionsFor, landingPathFor } from "@/lib/admin/landing";

export const metadata = { title: "後台總覽" };

export default async function AdminDashboardPage() {
  // 角色由 layout 的 requireRole 確保非 null；保險起見退回 seo_manager（最小權限）。
  const role = (await getCurrentUserRole()) ?? "seo_manager";
  // office → 保養記錄卡；角色本身沒有可見區段但持有模組授權 → 導向該模組
  // （僅在確實有授權時導向，避免與目標 layout 的 requireModule() 互導，見 landingPathFor）。
  const landing = landingPathFor(role, await getCurrentModules());
  if (landing) redirect(landing);

  // 依角色挑可見區段（seo_manager 不顯示網站設定 / 人員管理 / 聯絡來信）。
  const sections = dashboardSectionsFor(role);

  // 沒有任何可見區段時（例：erp 角色尚未取得任何模組授權）不渲染空白格線，給明確說明。
  if (sections.length === 0) {
    return (
      <div className="mx-auto max-w-[920px]">
        <h1 className="text-ink text-[24px] font-bold">後台總覽</h1>
        <p className="text-text-muted mt-1 text-[15px]">
          此帳號目前沒有可用的區段。若需使用 ERP
          或其他功能，請聯絡管理員開通權限。
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[920px]">
      <h1 className="text-ink text-[24px] font-bold">後台總覽</h1>
      <p className="text-text-muted mt-1 text-[15px]">
        管理各頁面內容。灰色項目為尚未開放的區段，將隨各 tab 上線陸續啟用。
      </p>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) =>
          s.enabled ? (
            <Link
              key={s.key}
              href={s.href}
              className="border-border hover:border-primary block rounded-xl border bg-white p-5 transition-colors"
            >
              <p className="text-ink text-[16px] font-semibold">{s.label}</p>
              <p className="text-text-muted mt-1 text-[13px]">管理 →</p>
            </Link>
          ) : (
            <div
              key={s.key}
              className="border-border bg-surface-muted rounded-xl border border-dashed p-5"
            >
              <p className="text-text-muted text-[16px] font-semibold">
                {s.label}
              </p>
              <p className="text-text-muted/70 mt-1 text-[13px]">尚未開放</p>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
