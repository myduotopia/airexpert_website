"use client";
// 最近 30 天的處理紀錄（#274）：誤按完成／略過時可復原，該次到期重新出現在提醒清單。
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/erp/ConfirmDialog";
import { rocDate, rocDateTime } from "@/lib/admin/minguo";
import type { HandledRow } from "@/lib/erp/queries/reminders";
import { undoReminderAction } from "../actions";
import { BTN_SM } from "./ui";

export function RecentHandled({ rows }: { rows: HandledRow[] }) {
  const router = useRouter();
  const [askConfirm, confirmDialog] = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (rows.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-ink mb-2 text-[16px] font-bold">最近 30 天已處理</h2>
      {error && (
        <p role="alert" className="mb-2 text-[14px] text-red-600">
          {error}
        </p>
      )}
      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border text-text-muted border-b text-[13px]">
              <th className="px-4 py-2 font-medium">到期日</th>
              <th className="px-3 py-2 font-medium">對象</th>
              <th className="px-3 py-2 font-medium">事項</th>
              <th className="px-3 py-2 font-medium">處理</th>
              <th className="px-3 py-2 font-medium">處理時間</th>
              <th className="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-border border-b last:border-b-0">
                <td className="px-4 py-2 whitespace-nowrap">
                  {rocDate(r.due_date)}
                </td>
                <td className="px-3 py-2">
                  {r.vendor_id ? (
                    <Link
                      href={`/admin/erp/vendors/${r.vendor_id}`}
                      className="hover:text-primary-deep"
                    >
                      {r.vendor_name ?? "—"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2">{r.title}</td>
                <td className="px-3 py-2">
                  {r.status === "done" ? "完成" : "略過"}
                  {r.note && (
                    <p className="text-text-muted text-[12px]">{r.note}</p>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {rocDateTime(r.handled_at)}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    className={BTN_SM}
                    disabled={busy === r.id}
                    onClick={async () => {
                      if (
                        !(await askConfirm({
                          title: "復原這筆處理？",
                          message: `「${r.title}」${rocDate(r.due_date)} 這次到期會重新出現在提醒清單。`,
                          confirmLabel: "復原",
                        }))
                      ) {
                        return;
                      }
                      setBusy(r.id);
                      setError(null);
                      const res = await undoReminderAction(r.id);
                      setBusy(null);
                      if (!res.ok) setError(res.error);
                      else router.refresh();
                    }}
                  >
                    復原
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmDialog}
    </section>
  );
}
