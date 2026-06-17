import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin/auth";
import type { Event } from "@/lib/types";
import { EventForm } from "../../EventForm";

export const metadata = { title: "編輯交機影片" };

type EditPageProps = {
  // Next 16：dynamic params 為 Promise，須 await。
  params: Promise<{ id: string }>;
};

async function getEventById(id: string): Promise<Event | null> {
  const { data, error } = await getAdminSupabase()
    .from("events")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Event | null) ?? null;
}

export default async function EditEventPage(props: EditPageProps) {
  await requireAdmin();
  const { id } = await props.params;
  const event = await getEventById(id);

  if (!event) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-[840px]">
      <Link
        href="/admin/events"
        className="text-text-muted hover:text-ink text-[13px]"
      >
        ← 返回公司活動
      </Link>
      <h1 className="text-ink mt-2 text-[24px] font-bold">
        編輯交機影片：{event.title}
      </h1>
      <div className="mt-6">
        <EventForm event={event} />
      </div>
    </div>
  );
}
