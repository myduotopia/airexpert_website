"use client";
// 新機問題清單（#272）：客戶、交機日期、機型、問題、發生日期、處理進度（最新一筆）、負責人、狀態。
// 重點追蹤的列以醒目底色顯示（列印保留底色）；狀態「待討論」以紅字顯示。
// readOnly（列印模式）時不顯示新增／編輯／進度／刪除。
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/erp/ConfirmDialog";
import type { CustomerOption } from "@/lib/erp/types";
import type { EmployeeOption } from "@/lib/employees/types";
import { deleteMachineIssueAction } from "@/lib/erp/tracking/actions";
import {
  formatTrackingDate,
  latestProgressText,
} from "@/lib/erp/tracking/display";
import {
  MACHINE_ISSUE_CLOSED,
  MACHINE_ISSUE_STATUS_LABELS,
  type MachineIssueRow,
} from "@/lib/erp/tracking/types";
import { MachineIssueDialog } from "./MachineIssueDialog";
import { ProgressDialog } from "./ProgressDialog";
import {
  BTN_PRIMARY,
  KEY_ROW,
  PendingText,
  ROW_ACTION,
  StatusBadge,
  TABLE,
  TD,
  TH,
} from "./ui";

export function MachineIssuesBoard({
  rows,
  customers = [],
  employees = [],
  refYear,
  today,
  readOnly = false,
  emptyText = "沒有符合條件的新機問題。",
}: {
  rows: MachineIssueRow[];
  customers?: CustomerOption[];
  employees?: EmployeeOption[];
  refYear: number;
  today: string;
  readOnly?: boolean;
  emptyText?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<{
    issue: MachineIssueRow | null;
  } | null>(null);
  const [progressOf, setProgressOf] = useState<MachineIssueRow | null>(null);
  const [askConfirm, confirmDialog] = useConfirm();
  const [error, setError] = useState<string | null>(null);

  async function remove(issue: MachineIssueRow) {
    const ok = await askConfirm({
      title: "確定刪除這筆新機問題？",
      message: `${issue.customer_name}：${issue.description}。處理進度會一併刪除，且無法復原。`,
      confirmLabel: "刪除",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    const res = await deleteMachineIssueAction(issue.id);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div>
      {!readOnly && (
        <div className="mb-3 flex items-center justify-between gap-3 print:hidden">
          {error ? (
            <p role="alert" className="text-[14px] text-red-600">
              {error}
            </p>
          ) : (
            <span className="text-text-muted text-[13px]">
              <span
                className={`${KEY_ROW} mr-1 inline-block h-3 w-5 rounded-sm align-middle`}
              />
              重點追蹤
            </span>
          )}
          <button
            type="button"
            className={BTN_PRIMARY}
            onClick={() => setEditing({ issue: null })}
          >
            新增新機問題
          </button>
        </div>
      )}
      {rows.length === 0 ? (
        <div className="border-border text-text-muted rounded-xl border border-dashed bg-white p-8 text-center text-[14px]">
          {emptyText}
        </div>
      ) : (
        <div className="border-border overflow-x-auto rounded-xl border bg-white print:overflow-visible print:rounded-none print:border-0">
          <table className={TABLE}>
            <thead>
              <tr>
                <th className={TH}>客戶</th>
                <th className={TH}>交機日期</th>
                <th className={TH}>機型</th>
                <th className={TH}>問題</th>
                <th className={TH}>發生日期</th>
                <th className={TH}>處理進度</th>
                <th className={TH}>負責人</th>
                <th className={TH}>狀態</th>
                {!readOnly && (
                  <th className={`${TH} print:hidden`}>
                    <span className="sr-only">操作</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.is_key ? KEY_ROW : undefined}>
                  <td className={`${TD} font-medium`}>
                    {r.is_key && (
                      <span
                        className="mr-1 font-bold text-amber-700"
                        title="重點追蹤"
                      >
                        ★<span className="sr-only">重點追蹤</span>
                      </span>
                    )}
                    {r.customer_name}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {formatTrackingDate(r.delivered_on, refYear) || "—"}
                  </td>
                  <td className={TD}>
                    {r.model ?? ""}
                    {r.machine_serial_no && (
                      <span className="text-text-muted block text-[11px]">
                        {r.machine_serial_no}
                      </span>
                    )}
                  </td>
                  <td className={`${TD} whitespace-pre-wrap`}>
                    {r.description}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {formatTrackingDate(r.occurred_on, refYear)}
                  </td>
                  <td className={`${TD} whitespace-pre-wrap`}>
                    {latestProgressText(
                      r.latest_progress_date,
                      r.latest_progress,
                      refYear,
                    ) || <span className="text-text-muted">—</span>}
                    {r.progress_count > 1 && (
                      <span className="text-text-muted block text-[11px] print:hidden">
                        共 {r.progress_count} 筆
                      </span>
                    )}
                  </td>
                  <td className={`${TD} whitespace-nowrap`}>
                    {r.owner_name ?? ""}
                  </td>
                  <td className={TD}>
                    {r.status === "discussing" ? (
                      <PendingText>
                        {MACHINE_ISSUE_STATUS_LABELS[r.status]}
                      </PendingText>
                    ) : (
                      <StatusBadge
                        label={MACHINE_ISSUE_STATUS_LABELS[r.status]}
                        closed={MACHINE_ISSUE_CLOSED.includes(r.status)}
                      />
                    )}
                  </td>
                  {!readOnly && (
                    <td className={`${TD} print:hidden`}>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className={ROW_ACTION}
                          onClick={() => setProgressOf(r)}
                        >
                          進度
                        </button>
                        <button
                          type="button"
                          className={ROW_ACTION}
                          onClick={() => setEditing({ issue: r })}
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          className="text-[13px] font-semibold whitespace-nowrap text-red-600 hover:text-red-700"
                          onClick={() => remove(r)}
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <MachineIssueDialog
          issue={editing.issue}
          customers={customers}
          employees={employees}
          today={today}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {progressOf && (
        <ProgressDialog
          parent="issue"
          parentId={progressOf.id}
          title={`${progressOf.customer_name}：${progressOf.description}`}
          today={today}
          onClose={(changed) => {
            setProgressOf(null);
            if (changed) router.refresh();
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}
