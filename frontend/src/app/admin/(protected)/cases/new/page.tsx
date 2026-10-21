import { CONTENT_ROLES, requireRole } from "@/lib/admin/auth";
import Link from "next/link";
import { CaseForm } from "@/components/cases/admin/CaseForm";
import { createCase } from "../actions";

export const metadata = { title: "新增實績 — 後台" };

export default async function NewCasePage() {
  // 內容團隊（admin / seo_manager）才可進；(protected) 根 layout 只判斷是否為後台人員，
  // office / erp / hr 等其他後台角色在此被導回 /admin（#259）。
  await requireRole(CONTENT_ROLES);
  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        href="/admin/cases"
        className="text-text-muted hover:text-primary-deep text-[14px]"
      >
        ← 返回列表
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">新增實績</h1>
      <div className="mt-6">
        <CaseForm action={createCase} />
      </div>
    </div>
  );
}
