import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase-admin";
import {
  AdminTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { formatNewsDate } from "@/components/news/format";
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

  // AdminTable 是 client component，cells 須由 server 端預先渲染成可序列化的 ReactNode；
  // 排序 / 搜尋所需原始值另以 sortValues / search 附帶。
  const columns: AdminColumn[] = [
    { header: "標題", sortable: true },
    { header: "分類", sortable: true },
    { header: "地區", sortable: true },
    { header: "產業", sortable: true },
    { header: "建立日期", sortable: true },
    { header: "狀態", sortable: true },
    { header: "操作", className: "text-right" },
  ];

  const rows: AdminRow[] = cases.map((c) => ({
    key: c.id,
    cells: [
      <Link
        href={`/admin/cases/${c.id}/edit`}
        className="text-ink hover:text-primary-deep font-medium"
        key="title"
      >
        {c.title}
      </Link>,
      c.category,
      c.region || "—",
      c.industry || "—",
      <span className="font-mono text-[13px]" key="date">
        {formatNewsDate(c.published_at) || "—"}
      </span>,
      <StatusBadge status={c.status} key="status" />,
      <span className="inline-flex items-center gap-1" key="ops">
        <Link
          href={`/admin/cases/${c.id}/edit`}
          className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
        >
          編輯
        </Link>
        <DeleteButton onDelete={deleteCase.bind(null, c.id)} />
      </span>,
    ],
    sortValues: [
      c.title,
      c.category,
      c.region,
      c.industry,
      c.published_at,
      c.status,
      null,
    ],
    search: `${c.title} ${c.category} ${c.region ?? ""} ${
      c.industry ?? ""
    }`.toLowerCase(),
    label: c.title,
  }));

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
        <AdminTable
          rows={rows}
          columns={columns}
          onReorder={reorderCasesAction}
          searchPlaceholder="搜尋標題 / 分類 / 地區 / 產業…"
          empty="尚無實績，點右上角「新增實績」開始建立。"
        />
      </div>
    </div>
  );
}
