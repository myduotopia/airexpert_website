import Link from "next/link";
import { redirect } from "next/navigation";
import { navForRole } from "@/lib/admin/nav-config";
import { getCurrentUserRole, hasModule } from "@/lib/admin/auth";

export const metadata = { title: "後台總覽" };

export default async function AdminDashboardPage() {
  // 角色由 layout 的 requireRole 確保非 null；保險起見退回 seo_manager（最小權限）。
  // office 角色只看得到「保養記錄卡」，總覽頁對其無意義，直接導向。
  const role = (await getCurrentUserRole()) ?? "seo_manager";
  if (role === "office") redirect("/admin/maintenance");
  // erp 角色只使用 ERP 模組（navForRole 不含模組項目 → 總覽對其為空），導向 ERP 總覽。
  // 但必須先確認真的有 erp 授權：沒授權時 /admin/erp 的 requireModule() 會把他導回
  // /admin，兩邊互導會變成無限轉址；此時改走下方「沒有可用區段」的提示。
  if (role === "erp" && (await hasModule("erp"))) redirect("/admin/erp");

  // 依角色挑可見區段（seo_manager 不顯示網站設定 / 人員管理 / 聯絡來信）。
  const sections = navForRole(role).filter(
    (i) => i.key !== "dashboard" && i.key !== "settings",
  );

  // 沒有任何可見區段時（例：erp 角色尚未取得模組授權）不渲染空白格線，給明確說明。
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
