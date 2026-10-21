import { CONTENT_ROLES, requireRole } from "@/lib/admin/auth";
import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";
import { createProductAction } from "../actions";

export const metadata = { title: "新增商品 · 後台" };

export default async function NewProductPage() {
  // 內容團隊（admin / seo_manager）才可進；(protected) 根 layout 只判斷是否為後台人員，
  // office / erp / hr 等其他後台角色在此被導回 /admin（#259）。
  await requireRole(CONTENT_ROLES);
  return (
    <div className="mx-auto max-w-[820px]">
      <nav className="text-text-muted mb-2 text-[13px]">
        <Link href="/admin/products" className="hover:text-ink">
          商品介紹
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-ink">新增</span>
      </nav>
      <h1 className="text-ink mb-6 text-[24px] font-bold">新增商品</h1>

      <ProductForm action={createProductAction} submitLabel="建立商品" />
    </div>
  );
}
