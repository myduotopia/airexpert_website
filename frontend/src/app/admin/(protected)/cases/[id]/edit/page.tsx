import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { CaseForm } from "@/components/cases/admin/CaseForm";
import { updateCase } from "../../actions";
import type { Case } from "@/lib/types";

export const metadata = { title: "編輯實績 — 後台" };

type EditPageProps = { params: Promise<{ id: string }> };

async function getCaseById(id: string): Promise<Case | null> {
  const { data, error } = await getAdminSupabase()
    .from("cases")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`讀取實績失敗：${error.message}`);
  return (data as Case | null) ?? null;
}

export default async function EditCasePage(props: EditPageProps) {
  const { id } = await props.params;
  const caseItem = await getCaseById(id);
  if (!caseItem) notFound();

  // 以 caseItem.id bind updateCase，得到 (prev, fd) 簽章的 server action，
  // 可安全跨 server→client 邊界傳給 CaseForm。
  const action = updateCase.bind(null, caseItem.id);

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        href="/admin/cases"
        className="text-text-muted hover:text-primary-deep text-[14px]"
      >
        ← 返回列表
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">編輯實績</h1>
      <div className="mt-6">
        <CaseForm action={action} caseItem={caseItem} />
      </div>
    </div>
  );
}
