import Link from "next/link";
import { ServiceForm } from "@/components/services/admin/ServiceForm";
import { createService } from "../actions";

export const metadata = { title: "新增服務 — 後台" };

export default function NewServicePage() {
  return (
    <div className="mx-auto max-w-[1000px]">
      <Link
        href="/admin/services"
        className="text-text-muted hover:text-primary-deep text-[14px]"
      >
        ← 返回列表
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">新增服務</h1>
      <div className="mt-6">
        <ServiceForm action={createService} />
      </div>
    </div>
  );
}
