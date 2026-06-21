import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { DataTable } from "@/components/admin/DataTable";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { CreateSeoManagerForm } from "./CreateSeoManagerForm";
import { removeSeoManager } from "./actions";

export const metadata = { title: "人員管理 — 後台" };

interface AdminProfileRow {
  id: string;
  email: string | null;
  role: string;
  created_at: string;
}

// 列出所有後台帳號（admin + seo_manager）。走 service_role（0002 RLS 僅允許讀自己的列），
// 依 created_at 由舊到新排序，admin 通常最先建立。
async function getProfiles(): Promise<AdminProfileRow[]> {
  const { data, error } = await getAdminSupabase()
    .from("admin_profiles")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`讀取後台帳號失敗：${error.message}`);
  return (data ?? []) as AdminProfileRow[];
}

const DATE_FMT = new Intl.DateTimeFormat("zh-TW", {
  dateStyle: "medium",
  timeZone: "Asia/Taipei",
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : DATE_FMT.format(d);
}

function roleLabel(role: string): string {
  if (role === "admin") return "管理員";
  if (role === "seo_manager") return "SEO 代管";
  return role;
}

export default async function AdminStaffPage() {
  await requireAdmin();
  const profiles = await getProfiles();
  const managers = profiles.filter((p) => p.role === "seo_manager");

  return (
    <div className="mx-auto max-w-[900px]">
      <div>
        <h1 className="text-ink text-[24px] font-bold">人員管理</h1>
        <p className="text-text-muted mt-1 text-[15px]">
          管理後台帳號。SEO 代管帳號只能編輯各內容的 SEO meta，看不到內文、帳號與網站設定。
          共 {managers.length} 個代管帳號。
        </p>
      </div>

      {/* 帳號列表 */}
      <div className="mt-6">
        <DataTable
          rows={profiles}
          getKey={(p) => p.id}
          empty="尚無後台帳號。"
          columns={[
            {
              header: "Email",
              cell: (p) => (
                <span className="font-medium">{p.email || "—"}</span>
              ),
            },
            {
              header: "角色",
              cell: (p) => (
                <span
                  className={
                    p.role === "admin"
                      ? "text-primary-deep font-semibold"
                      : "text-ink"
                  }
                >
                  {roleLabel(p.role)}
                </span>
              ),
            },
            {
              header: "建立時間",
              cell: (p) => (
                <span className="text-text-muted font-mono text-[13px] whitespace-nowrap">
                  {formatDate(p.created_at)}
                </span>
              ),
            },
            {
              header: "",
              className: "text-right",
              cell: (p) =>
                p.role === "seo_manager" ? (
                  <DeleteButton
                    onDelete={removeSeoManager.bind(null, p.id)}
                    label="移除"
                    confirmText="確定移除此 SEO 代管帳號？移除後該帳號將無法登入。"
                  />
                ) : (
                  <span className="text-text-muted text-[12px]">
                    管理員（由 SQL 佈建）
                  </span>
                ),
            },
          ]}
        />
      </div>

      {/* 新增 SEO 代管 */}
      <div className="mt-10">
        <h2 className="text-ink text-[20px] font-bold">新增 SEO 代管帳號</h2>
        <p className="text-text-muted mt-1 text-[15px]">
          建立後，代管人員即可用此 Email 與密碼登入後台維護 SEO。
        </p>
        <div className="border-border mt-4 rounded-xl border bg-white p-6">
          <CreateSeoManagerForm />
        </div>
      </div>
    </div>
  );
}
