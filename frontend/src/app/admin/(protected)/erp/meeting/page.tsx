import { redirect } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { DEFAULT_MEETING_TAB, meetingTabHref } from "@/lib/erp/meeting/params";

// /admin/erp/meeting → 預設子頁籤（保留查詢參數，例：從其他頁帶 range 過來）。
export default async function MeetingIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    const value = Array.isArray(v) ? v[0] : v;
    if (value) qs.set(k, value);
  }
  redirect(meetingTabHref(DEFAULT_MEETING_TAB, qs.toString()));
}
