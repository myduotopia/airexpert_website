import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { BrandForm } from "../BrandForm";

export const metadata = { title: "新增品牌" };

export default async function NewBrandPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-[840px]">
      <Link
        href="/admin/brands"
        className="text-text-muted hover:text-ink text-[13px]"
      >
        ← 返回品牌列表
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">新增品牌</h1>
      <div className="mt-6">
        <BrandForm />
      </div>
    </div>
  );
}
