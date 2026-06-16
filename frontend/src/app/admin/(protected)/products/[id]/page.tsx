import Link from "next/link";
import { notFound } from "next/navigation";
import { ProductForm } from "@/components/admin/ProductForm";
import type { Product } from "@/lib/types";
import { getProductForAdmin, updateProductAction } from "../actions";

export const metadata = { title: "編輯商品 · 後台" };

type EditPageProps = { params: Promise<{ id: string }> };

export default async function EditProductPage(props: EditPageProps) {
  const { id } = await props.params;
  const product = (await getProductForAdmin(id)) as Product | null;

  if (!product) {
    notFound();
  }

  // 綁定 id，得到符合表單簽章的 (state, formData) action。
  const action = updateProductAction.bind(null, product.id);

  return (
    <div className="mx-auto max-w-[820px]">
      <nav className="text-text-muted mb-2 text-[13px]">
        <Link href="/admin/products" className="hover:text-ink">
          商品介紹
        </Link>
        <span className="px-1.5">/</span>
        <span className="text-ink">編輯</span>
      </nav>
      <h1 className="text-ink mb-1 text-[24px] font-bold">編輯商品</h1>
      <p className="text-text-muted mb-6 font-mono text-[13px]">
        {product.slug}
      </p>

      <ProductForm action={action} product={product} submitLabel="儲存變更" />
    </div>
  );
}
