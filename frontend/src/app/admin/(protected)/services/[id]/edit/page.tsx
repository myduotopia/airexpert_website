import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { ServiceForm } from "@/components/services/admin/ServiceForm";
import { updateService } from "../../actions";
import type { Service } from "@/lib/types";

export const metadata = { title: "編輯服務 — 後台" };

type EditPageProps = { params: Promise<{ id: string }> };

async function getServiceById(id: string): Promise<Service | null> {
  const { data, error } = await getAdminSupabase()
    .from("services")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取服務項目失敗：${error.message}`);
  return (data as Service | null) ?? null;
}

export default async function EditServicePage(props: EditPageProps) {
  const { id } = await props.params;
  const service = await getServiceById(id);
  if (!service) notFound();

  // 以 service.id bind updateService，得到 (prev, fd) 簽章的 server action，
  // 可安全跨 server→client 邊界傳給 ServiceForm。
  const action = updateService.bind(null, service.id);

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        href="/admin/services"
        className="text-text-muted hover:text-primary-deep text-[14px]"
      >
        ← 返回列表
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">編輯服務</h1>
      <div className="mt-6">
        <ServiceForm action={action} service={service} />
      </div>
    </div>
  );
}
