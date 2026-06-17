import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { EventForm } from "../../EventForm";

export const metadata = { title: "新增交機影片" };

export default async function NewEventPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-[840px]">
      <Link
        href="/admin/events"
        className="text-text-muted hover:text-ink text-[13px]"
      >
        ← 返回公司活動
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">新增交機影片</h1>
      <div className="mt-6">
        <EventForm />
      </div>
    </div>
  );
}
