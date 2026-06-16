import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin/auth";
import type { Brand } from "@/lib/types";
import { BrandForm } from "../BrandForm";

export const metadata = { title: "編輯品牌" };

type EditPageProps = {
  // Next 16：dynamic params 為 Promise，須 await。
  params: Promise<{ id: string }>;
};

async function getBrandById(id: string): Promise<Brand | null> {
  const { data, error } = await getAdminSupabase()
    .from("brands")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Brand | null) ?? null;
}

export default async function EditBrandPage(props: EditPageProps) {
  await requireAdmin();
  const { id } = await props.params;
  const brand = await getBrandById(id);

  if (!brand) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[840px]">
      <Link
        href="/admin/brands"
        className="text-text-muted hover:text-ink text-[13px]"
      >
        ← 返回品牌列表
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">
        編輯品牌：{brand.name}
      </h1>
      <div className="mt-6">
        <BrandForm brand={brand} />
      </div>
    </div>
  );
}
