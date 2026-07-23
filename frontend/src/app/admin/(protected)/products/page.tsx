import Link from "next/link";
import {
  AdminTable,
  type AdminColumn,
  type AdminRow,
} from "@/components/admin/AdminTable";
import { StatusBadge } from "@/components/admin/StatusBadge";
import { DeleteButton } from "@/components/admin/DeleteButton";
import type { Product } from "@/lib/types";
import {
  listAllProductsForAdmin,
  deleteProductAction,
  reorderProductsAction,
} from "./actions";

export const metadata = { title: "商品介紹 · 後台" };

// 列表頁需顯示草稿/封存，故走 service_role 的 listAllProductsForAdmin（非前台 published-only helper）。
export default async function AdminProductsPage() {
  const products = (await listAllProductsForAdmin()) as Product[];

  // AdminTable 是 client component，cells 須由 server 端預先渲染成可序列化的 ReactNode；
  // 排序 / 搜尋所需原始值另以 sortValues / search 附帶。
  const columns: AdminColumn[] = [
    { header: "名稱", sortable: true },
    { header: "分類", sortable: true },
    { header: "圖片", className: "whitespace-nowrap" },
    { header: "狀態", sortable: true },
    { header: "操作", className: "text-right whitespace-nowrap" },
  ];

  const rows: AdminRow[] = products.map((p) => ({
    key: p.id,
    cells: [
      <div className="flex flex-col" key="name">
        <Link
          href={`/admin/products/${p.id}`}
          className="text-ink hover:text-primary-deep font-medium"
        >
          {p.name}
        </Link>
        <span className="text-text-muted font-mono text-[12px]">{p.slug}</span>
      </div>,
      p.category,
      `${p.images?.length ?? 0} 張`,
      <StatusBadge status={p.status} key="status" />,
      <div className="flex items-center justify-end gap-1" key="ops">
        <Link
          href={`/admin/products/${p.id}`}
          className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
        >
          編輯
        </Link>
        <DeleteButton onDelete={deleteProductAction.bind(null, p.id)} />
      </div>,
    ],
    sortValues: [p.name, p.category, null, p.status, null],
    search: `${p.name} ${p.slug} ${p.category}`.toLowerCase(),
  }));

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-ink text-[24px] font-bold">商品介紹</h1>
          <p className="text-text-muted mt-1 text-[14px]">
            共 {products.length} 筆。前台僅顯示「已發佈」的商品。
          </p>
        </div>
        <Link
          href="/admin/products/new"
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors"
        >
          新增商品
        </Link>
      </div>

      <AdminTable
        rows={rows}
        columns={columns}
        onReorder={reorderProductsAction}
        searchPlaceholder="搜尋名稱 / 分類…"
        empty="尚無商品，點右上角「新增商品」建立第一筆。"
      />
    </div>
  );
}
