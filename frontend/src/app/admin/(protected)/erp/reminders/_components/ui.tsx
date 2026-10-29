// 提醒事項（#274）共用的版面小元件與樣式。無 hooks，server / client 皆可用。
import Link from "next/link";
import type { Urgency } from "@/lib/erp/reminders/schedule";

export const REMINDERS_PATH = "/admin/erp/reminders";

export type ReminderTab = "list" | "rules" | "pending";

const TABS: { key: ReminderTab; label: string }[] = [
  { key: "list", label: "提醒清單" },
  { key: "rules", label: "全部規則" },
  { key: "pending", label: "待確認" },
];

export function ReminderTabs({
  active,
  pendingCount,
}: {
  active: ReminderTab;
  pendingCount?: number;
}) {
  return (
    <nav
      aria-label="提醒事項"
      className="border-border mb-5 flex gap-1 overflow-x-auto border-b"
    >
      {TABS.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={
              t.key === "list"
                ? REMINDERS_PATH
                : `${REMINDERS_PATH}?tab=${t.key}`
            }
            aria-current={on ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-[14px] font-semibold whitespace-nowrap ${
              on
                ? "border-primary text-primary-deep"
                : "text-text-muted hover:text-ink border-transparent"
            }`}
          >
            {t.label}
            {t.key === "pending" && !!pendingCount && (
              <span className="bg-surface-muted text-text-muted ml-1.5 rounded-full px-1.5 text-[12px]">
                {pendingCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** 緊急程度色標：逾期＝紅、0–3 天＝橘、4–7 天＝黃、8 天以上＝灰。 */
export const URGENCY_STYLE: Record<Urgency, { bar: string; badge: string }> = {
  overdue: {
    bar: "bg-red-600",
    badge: "bg-red-50 text-red-700 ring-red-200",
  },
  urgent: {
    bar: "bg-orange-500",
    badge: "bg-orange-50 text-orange-700 ring-orange-200",
  },
  soon: {
    bar: "bg-yellow-400",
    badge: "bg-yellow-50 text-yellow-800 ring-yellow-200",
  },
  later: {
    bar: "bg-gray-300",
    badge: "bg-surface-muted text-text-muted ring-border",
  },
};

export const BTN_SM =
  "border-border hover:bg-surface-muted inline-flex h-8 items-center rounded-lg border bg-white px-2.5 text-[13px] font-semibold whitespace-nowrap disabled:opacity-50";
export const BTN_SM_PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-semibold whitespace-nowrap text-white disabled:opacity-50";
export const BTN =
  "inline-flex h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold disabled:opacity-50";
export const BTN_PRIMARY = `${BTN} bg-primary hover:bg-primary-deep text-white`;
export const BTN_SECONDARY = `${BTN} border-border hover:bg-surface-muted border bg-white`;
