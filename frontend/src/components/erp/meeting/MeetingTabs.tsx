"use client";

// ERP 週報子頁籤（#271）：交機進度｜進廠維修｜新機問題｜維護完成紀錄。
// 切換子頁籤時保留日期區間（range／from／to），其他篩選（關鍵字等）各頁不同，不帶過去。
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  MEETING_TABS,
  meetingTabHref,
  type MeetingTab,
} from "@/lib/erp/meeting/params";

const KEEP = ["range", "from", "to"] as const;

export function MeetingTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const qs = new URLSearchParams();
  for (const k of KEEP) {
    const v = searchParams.get(k);
    if (v) qs.set(k, v);
  }
  const query = qs.toString();
  return (
    <nav
      className="border-border mb-5 flex gap-1 overflow-x-auto border-b"
      aria-label="週報項目"
    >
      {MEETING_TABS.map((t) => {
        const href = meetingTabHref(t.key as MeetingTab);
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={t.key}
            href={meetingTabHref(t.key, query)}
            aria-current={active ? "page" : undefined}
            className={`-mb-px inline-flex h-10 shrink-0 items-center border-b-2 px-4 text-[14px] font-semibold ${
              active
                ? "border-primary text-primary-deep"
                : "text-text-muted hover:text-ink border-transparent"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
