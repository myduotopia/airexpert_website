import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { ReorderableTable } from "@/components/admin/ReorderableTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { deleteCase, reorderCasesAction } from "./actions";
import type { Case } from "@/lib/types";

export const metadata = { title: "節能實績 — 後台" };

// 後台讀全部實績（含草稿/封存），故走 service_role admin client 而非公開 data layer。
async function getAllCases(): Promise<Case[]> {
  const { data, error } = await getAdminSupabase()
    .from("cases")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`讀取實績失敗：${error.message}`);
  return (data ?? []) as Case[];
}

export default async function AdminCasesPage() {
  const cases = await getAllCases();

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[24px] font-bold">節能實績</h1>
          <p className="text-text-muted mt-1 text-[15px]">
            共 {cases.length} 筆案例。
          </p>
        </div>
        <Link
          href="/admin/cases/new"
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors"
        >
          新增實績
        </Link>
      </div>

      <div className="mt-6">
        <ReorderableTable
          rows={cases}
          getKey={(c) => c.id}
          onReorder={reorderCasesAction}
          empty="尚無實績，點右上角「新增實績」開始建立。"
          columns={[
            {
              header: "標題",
              cell: (c) => (
                <Link
                  href={`/admin/cases/${c.id}/edit`}
                  className="text-ink hover:text-primary-deep font-medium"
                >
                  {c.title}
                </Link>
              ),
            },
            { header: "分類", cell: (c) => c.category },
            { header: "地區", cell: (c) => c.region || "—" },
            { header: "產業", cell: (c) => c.industry || "—" },
            { header: "狀態", cell: (c) => <StatusBadge status={c.status} /> },
            {
              header: "",
              className: "text-right",
              cell: (c) => (
                <span className="inline-flex items-center gap-1">
                  <Link
                    href={`/admin/cases/${c.id}/edit`}
                    className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
                  >
                    編輯
                  </Link>
                  <DeleteButton onDelete={deleteCase.bind(null, c.id)} />
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
