import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { DataTable } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { deleteService } from "./actions";
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
        <DataTable
          rows={services}
          getKey={(s) => s.id}
          empty="尚無服務項目，點右上角「新增服務」開始建立。"
          columns={[
            {
              header: "標題",
              cell: (s) => (
                <Link
                  href={`/admin/services/${s.id}/edit`}
                  className="text-ink hover:text-primary-deep font-medium"
                >
                  {s.title}
                </Link>
              ),
            },
            {
              header: "slug",
              cell: (s) => (
                <span className="font-mono text-[13px]">{s.slug}</span>
              ),
            },
            {
              header: "排序",
              cell: (s) => (
                <span className="font-mono text-[13px]">{s.sort_order}</span>
              ),
            },
            { header: "狀態", cell: (s) => <StatusBadge status={s.status} /> },
            {
              header: "",
              className: "text-right",
              cell: (s) => (
                <span className="inline-flex items-center gap-1">
                  <Link
                    href={`/admin/services/${s.id}/edit`}
                    className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
                  >
                    編輯
                  </Link>
                  <DeleteButton onDelete={deleteService.bind(null, s.id)} />
                </span>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
