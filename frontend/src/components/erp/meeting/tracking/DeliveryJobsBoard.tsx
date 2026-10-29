"use client";
// 交機進度清單（#272）：欄位比照週會簡報。列印見 TrackingPrintTables（獨立列印路由）。
// 「待確認」（交機負責人未指定、交機時間空白）以紅字顯示；訂金未收以紅字顯示。
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/erp/ConfirmDialog";
import type { CustomerOption } from "@/lib/erp/types";
import type { EmployeeOption } from "@/lib/employees/types";
import { deleteDeliveryJobAction } from "@/lib/erp/tracking/actions";
import { deliveryDeposit } from "@/lib/erp/tracking/csv";
import { depositBasisLabel } from "@/lib/erp/tracking/deposit";
import { formatDeliveryWindow } from "@/lib/erp/tracking/display";
import {
  DELIVERY_CLOSED,
  DELIVERY_STATUS_LABELS,
  DEPOSIT_LABELS,
  type DeliveryJobRow,
} from "@/lib/erp/tracking/types";
import { DeliveryJobDialog } from "./DeliveryJobDialog";
import {
  BTN_PRIMARY,
  PendingText,
  ROW_ACTION,
  StatusBadge,
  TABLE,
  TD,
  TH,
} from "./ui";

type Editing = { job: DeliveryJobRow | null } | null;

export function DeliveryJobsBoard({
  rows,
  customers = [],
  employees = [],
  refYear,
  emptyText = "沒有符合條件的交機進度。",
}: {
  rows: DeliveryJobRow[];
  customers?: CustomerOption[];
  employees?: EmployeeOption[];
  refYear: number;
  emptyText?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  const [askConfirm, confirmDialog] = useConfirm();
  const [error, setError] = useState<string | null>(null);

  async function remove(job: DeliveryJobRow) {
    const ok = await askConfirm({
      title: "確定刪除這筆交機進度？",
      message: `${job.customer_name}${job.equipment ? `：${job.equipment}` : ""}。刪除後無法復原；若只是不再追蹤，可改狀態為「取消」。`,
      confirmLabel: "刪除",
      tone: "danger",
    });
    if (!ok) return;
    setError(null);
    const res = await deleteDeliveryJobAction(job.id);
    if (!res.ok) setError(res.error);
    else router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3 print:hidden">
        {error ? (
          <p role="alert" className="text-[14px] text-red-600">
            {error}
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          className={BTN_PRIMARY}
          onClick={() => setEditing({ job: null })}
        >
          新增交機進度
        </button>
      </div>

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
                <th className={TH}>訂金</th>
                <th className={TH}>負責業務</th>
                <th className={TH}>交機負責人</th>
                <th className={TH}>材料確認</th>
                <th className={TH}>機器設備</th>
                <th className={TH}>交機時間</th>
                <th className={TH}>注意事項</th>
                <th className={TH}>狀態</th>

                <th className={`${TH} print:hidden`}>
                  <span className="sr-only">操作</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const deposit = deliveryDeposit(r);
                const basis = depositBasisLabel(deposit);
                const when = formatDeliveryWindow(
                  r.delivery_start,
                  r.delivery_end,
                  refYear,
                );
                return (
                  <tr key={r.id}>
                    <td className={TD}>
                      <span className="font-medium">{r.customer_name}</span>
                      {r.doc_no && (
                        <span className="text-text-muted block text-[12px]">
                          {r.doc_type === "S" ? "銷貨" : "報價"} {r.doc_no}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <span
                        className={
                          deposit.status === "received"
                            ? ""
                            : "font-semibold text-red-600"
                        }
                        title={deposit.reason}
                      >
                        {DEPOSIT_LABELS[deposit.status]}
                      </span>
                      {basis && (
                        <span className="text-text-muted block text-[11px]">
                          {basis}
                        </span>
                      )}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {r.sales_rep_name ?? "—"}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {r.delivery_owner_name ?? <PendingText />}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {r.materials_confirmed ? "✓ 已確認" : "未確認"}
                    </td>
                    <td className={`${TD} whitespace-pre-wrap`}>
                      {r.equipment ?? "—"}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      {when.pending ? (
                        <PendingText>{when.text}</PendingText>
                      ) : (
                        when.text
                      )}
                    </td>
                    <td className={`${TD} whitespace-pre-wrap`}>
                      {r.note ?? ""}
                    </td>
                    <td className={TD}>
                      <StatusBadge
                        label={DELIVERY_STATUS_LABELS[r.status]}
                        closed={DELIVERY_CLOSED.includes(r.status)}
                      />
                    </td>

                    <td className={`${TD} print:hidden`}>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className={ROW_ACTION}
                          onClick={() => setEditing({ job: r })}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <DeliveryJobDialog
          job={editing.job}
          customers={customers}
          employees={employees}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}
