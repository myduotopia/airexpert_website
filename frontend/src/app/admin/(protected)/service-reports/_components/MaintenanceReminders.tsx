// 報告單列表頁的「保養到期提醒」區塊（spec §6.1）：server component，
// 放在頁首與搜尋列之間。無提醒或查詢失敗時整塊不渲染（spec §7：不影響列表）。
import Link from "next/link";
import { listReminders } from "@/lib/service-report/plan/queries";
import {
  splitReminders,
  toReminderRow,
  type ReminderRowView,
  type ReminderTone,
} from "./reminder-view";

const TONE_CLASSES: Record<ReminderTone, string> = {
  warning: "bg-amber-100 text-amber-700",
  info: "bg-sky-100 text-sky-700",
};

function ReminderRow({ row }: { row: ReminderRowView }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-1.5 text-[13px]">
      <span
        className="text-ink font-medium"
        title={row.truncated ? row.customerTitle : undefined}
      >
        {row.customerName}
      </span>
      <span className="text-text-muted">{row.machineLabel}</span>
      <span className="text-text-muted tabular-nums">
        {row.hoursText}（{row.readAtText}）
      </span>
      <span className="text-ink" title={row.planName}>
        {row.stageText}
      </span>
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[12px] font-medium whitespace-nowrap ${TONE_CLASSES[row.statusTone]}`}
      >
        {row.statusText}
      </span>
      <Link
        href={row.href}
        className="text-primary-deep hover:text-primary ml-auto font-semibold whitespace-nowrap"
      >
        開立報告單
      </Link>
    </li>
  );
}

export async function MaintenanceReminders() {
  const res = await listReminders();
  if (!res.ok) {
    // 提醒只是輔助資訊，查詢失敗不擋列表（spec §7）；錯誤留在 server log。
    console.error("[service-plan] 保養到期提醒查詢失敗：", res.error);
    return null;
  }
  const rows = res.data.map(toReminderRow);
  if (rows.length === 0) return null;
  const { head, rest } = splitReminders(rows);

  return (
    <section
      aria-labelledby="maintenance-reminders-heading"
      className="border-border mb-4 overflow-hidden rounded-xl border bg-white"
    >
      <div className="border-border bg-surface-muted flex flex-wrap items-baseline justify-between gap-x-3 border-b px-4 py-2">
        <h2
          id="maintenance-reminders-heading"
          className="text-ink text-[14px] font-semibold"
        >
          保養到期提醒（{rows.length}）
        </h2>
        <span className="text-text-muted text-[12px]">
          已達門檻優先，其次預估到期日
        </span>
      </div>
      <ul className="divide-border divide-y">
        {head.map((row) => (
          <ReminderRow key={row.key} row={row} />
        ))}
      </ul>
      {rest.length > 0 && (
        <details className="border-border border-t">
          <summary className="text-primary-deep hover:bg-surface-muted cursor-pointer px-4 py-1.5 text-[13px] font-semibold">
            顯示全部 {rows.length} 筆
          </summary>
          <ul className="divide-border border-border divide-y border-t">
            {rest.map((row) => (
              <ReminderRow key={row.key} row={row} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
