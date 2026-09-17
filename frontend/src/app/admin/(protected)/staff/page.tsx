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

// 列出所有後台帳號（admin + seo_manager + office + erp）。走 service_role
// （0002 RLS 僅允許讀自己的列），依 created_at 由舊到新排序，admin 通常最先建立。
async function getProfiles(): Promise<AdminProfileRow[]> {
  const { data, error } = await getAdminSupabase()
    .from("admin_profiles")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(`讀取後台帳號失敗：${error.message}`);
  return (data ?? []) as AdminProfileRow[];
}

// 模組授權（與角色正交）：ERP 可見性看的是這張表而非 role，故列表要一併顯示，
// admin 才看得出誰有 ERP。走 service_role（RLS 只允許讀自己的列）。
async function getModuleGrants(): Promise<Map<string, string[]>> {
  const { data, error } = await getAdminSupabase()
    .from("admin_module_grants")
    .select("user_id, module");
  if (error) throw new Error(`讀取模組授權失敗：${error.message}`);
  const map = new Map<string, string[]>();
  for (const g of (data ?? []) as { user_id: string; module: string }[]) {
    map.set(g.user_id, [...(map.get(g.user_id) ?? []), g.module]);
  }
  return map;
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
  if (role === "office") return "行政";
  if (role === "erp") return "ERP 行政";
  return role;
}

function moduleLabel(module: string): string {
  if (module === "erp") return "ERP";
  if (module === "service_report") return "機台維護報告單";
  return module;
}

export default async function AdminStaffPage() {
  await requireAdmin();
  const [profiles, grants] = await Promise.all([
    getProfiles(),
    getModuleGrants(),
  ]);
  const managers = profiles.filter((p) => p.role !== "admin");

  return (
    <div className="mx-auto max-w-[900px]">
      <div>
        <h1 className="text-ink text-[24px] font-bold">人員管理</h1>
        <p className="text-text-muted mt-1 text-[15px]">
          管理後台帳號。SEO 代管帳號只能編輯各內容的 SEO
          meta，行政帳號僅能操作保養記錄卡相關功能，ERP 行政帳號只看得到 ERP
          模組，皆看不到內文、帳號與網站設定。共 {managers.length} 個代管 / 行政
          / ERP 帳號。
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
              header: "模組授權",
              cell: (p) => {
                const mods = grants.get(p.id) ?? [];
                return mods.length ? (
                  <span className="text-ink text-[13px]">
                    {mods.map(moduleLabel).join("、")}
                  </span>
                ) : (
                  <span className="text-text-muted text-[13px]">—</span>
                );
              },
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
                p.role !== "admin" ? (
                  <DeleteButton
                    onDelete={removeSeoManager.bind(null, p.id)}
                    label="移除"
                    confirmText="確定移除此帳號？移除後該帳號將無法登入。"
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

      {/* 新增 SEO 代管 / 行政 / ERP 行政帳號 */}
      <div className="mt-10">
        <h2 className="text-ink text-[20px] font-bold">
          新增 SEO 代管 / 行政 / ERP 帳號
        </h2>
        <p className="text-text-muted mt-1 text-[15px]">
          建立後，該人員即可用此 Email 與密碼登入後台，依角色維護 SEO
          或保養記錄卡；選 ERP 行政會一併授權 ERP 模組。
        </p>
        <div className="border-border mt-4 rounded-xl border bg-white p-6">
          <CreateSeoManagerForm />
        </div>
      </div>
    </div>
  );
}
