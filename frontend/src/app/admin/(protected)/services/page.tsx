import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase-admin";
import {
  ReorderableTable,
  type ReorderColumn,
} from "@/components/admin/ReorderableTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { deleteService, reorderServicesAction } from "./actions";
import type { Service } from "@/lib/types";

export const metadata = { title: "服務項目 — 後台" };

// 後台讀全部服務（含草稿/封存），故走 service_role admin client 而非公開 data layer。
async function getAllServices(): Promise<Service[]> {
  const { data, error } = await getAdminSupabase()
    .from("services")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`讀取服務項目失敗：${error.message}`);
  return (data ?? []) as Service[];
}

export default async function AdminServicesPage() {
  const services = await getAllServices();

  // ReorderableTable 是 client component，cells 須由 server 端預先渲染成可序列化的 ReactNode。
  const columns: ReorderColumn[] = [
    { header: "標題" },
    { header: "slug" },
    { header: "狀態" },
    { header: "", className: "text-right" },
  ];

  const rows = services.map((s) => ({
    key: s.id,
    cells: [
      <Link
        href={`/admin/services/${s.id}/edit`}
        className="text-ink hover:text-primary-deep font-medium"
        key="title"
      >
        {s.title}
      </Link>,
      <span className="font-mono text-[13px]" key="slug">
        {s.slug}
      </span>,
      <StatusBadge status={s.status} key="status" />,
      <span className="inline-flex items-center gap-1" key="ops">
        <Link
          href={`/admin/services/${s.id}/edit`}
          className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
        >
          編輯
        </Link>
        <DeleteButton onDelete={deleteService.bind(null, s.id)} />
      </span>,
    ],
  }));

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[24px] font-bold">服務項目</h1>
          <p className="text-text-muted mt-1 text-[15px]">
            共 {services.length} 項服務。
          </p>
        </div>
        <Link
          href="/admin/services/new"
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors"
        >
          新增服務
        </Link>
      </div>

      <div className="mt-6">
        <ReorderableTable
          rows={rows}
          columns={columns}
          onReorder={reorderServicesAction}
          empty="尚無服務項目，點右上角「新增服務」開始建立。"
        />
      </div>
    </div>
  );
}
