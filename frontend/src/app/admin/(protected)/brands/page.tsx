import Link from "next/link";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin/auth";
import type { Brand } from "@/lib/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { deleteBrand } from "./actions";

export const metadata = { title: "品牌介紹管理" };

// 後台讀「全部」品牌（含 draft / archived），故用 admin client 繞過 RLS。
// 前台的 getPublishedBrands 只回 published，不適用於管理列表。
async function getAllBrands(): Promise<Brand[]> {
  const { data, error } = await getAdminSupabase()
    .from("brands")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Brand[];
}

export default async function AdminBrandsPage() {
  await requireAdmin();
  const brands = await getAllBrands();

  const columns: Column<Brand>[] = [
    {
      header: "名稱",
      cell: (b) => (
        <Link
          href={`/admin/brands/${b.id}`}
          className="text-primary-deep font-medium hover:underline"
        >
          {b.name}
        </Link>
      ),
    },
    {
      header: "Slug",
      cell: (b) => <span className="font-mono text-[13px]">{b.slug}</span>,
    },
    { header: "排序", cell: (b) => b.sort_order },
    { header: "狀態", cell: (b) => <StatusBadge status={b.status} /> },
    {
      header: "操作",
      className: "text-right",
      cell: (b) => (
        <span className="inline-flex items-center gap-1">
          <Link
            href={`/admin/brands/${b.id}`}
            className="hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
          >
            編輯
          </Link>
          <DeleteButton onDelete={deleteBrand.bind(null, b.id)} />
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1000px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[24px] font-bold">品牌介紹</h1>
          <p className="text-text-muted mt-1 text-[15px]">
            管理代理品牌（KAISHAN / DELTECH）。
          </p>
        </div>
        <Link
          href="/admin/brands/new"
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors"
        >
          新增品牌
        </Link>
      </div>

      <div className="mt-6">
        <DataTable
          rows={brands}
          columns={columns}
          getKey={(b) => b.id}
          empty="尚無品牌，點右上角「新增品牌」建立。"
        />
      </div>
    </div>
  );
}
