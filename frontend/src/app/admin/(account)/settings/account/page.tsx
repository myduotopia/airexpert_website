import {
  getCurrentModules,
  getSessionUser,
  mustChangePassword,
  requireRole,
} from "@/lib/admin/auth";
import { MODULE_LABELS } from "@/lib/admin/staff-accounts";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata = { title: "帳號設定 · 後台" };

// 帳號設定（#261）：只限員工帳號（staff）。共用／管理帳號（admin、seo_manager、office、erp、hr）
// 進來會被導回 /admin，側欄也不顯示此項。
export default async function AccountSettingsPage() {
  await requireRole(["staff"]);
  const [user, locked, modules] = await Promise.all([
    getSessionUser(),
    mustChangePassword(),
    getCurrentModules(),
  ]);

  return (
    <div className="mx-auto max-w-[640px]">
      <h1 className="text-ink text-[24px] font-bold">帳號設定</h1>
      <p className="text-text-muted mt-1 text-[15px]">
        登入帳號：
        <span className="text-ink font-mono">{user?.email ?? "—"}</span>
      </p>

      {locked ? (
        <div
          role="status"
          className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-[14px] text-amber-900"
        >
          您目前使用的是預設密碼。請先設定新密碼，完成後才能使用後台的其他功能。
        </div>
      ) : (
        <p className="text-text-muted mt-3 text-[14px]">
          目前可使用的功能：
          {modules.length > 0
            ? modules.map((m) => MODULE_LABELS[m]).join("、")
            : "尚未開通（請洽人事主管設定您的職位權限）"}
        </p>
      )}

      <section className="border-border mt-6 rounded-xl border bg-white p-6">
        <h2 className="text-ink text-[18px] font-bold">變更密碼</h2>
        <p className="text-text-muted mt-1 text-[13px]">
          新密碼至少 8 個字元，且不可為預設密碼 00000000。
        </p>
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
