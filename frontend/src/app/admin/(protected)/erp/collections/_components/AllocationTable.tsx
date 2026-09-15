"use client";
// 未沖銷單據勾選表（新增收付款與「補沖銷」共用）。受控：rows 由父層持有。
import { MoneyText } from "@/components/erp/MoneyText";
import { NumberInput } from "@/components/erp/NumberInput";
import { rocDate } from "@/lib/admin/minguo";
import { DOC_TYPE_LABEL } from "@/lib/erp/doc-no";
import type { DocType } from "@/lib/erp/types";
import {
  allocatedTotal,
  defaultAllocation,
  outstandingAfter,
  roundAmount,
  type AllocationRow,
  type OutstandingDoc,
} from "./allocation";

export function AllocationTable({
  docs,
  rows,
  onChange,
  capacity,
  disabled,
  remainingLabel,
}: {
  docs: OutstandingDoc[];
  rows: AllocationRow[];
  onChange: (rows: AllocationRow[]) => void;
  /** 可沖銷上限（新增 = 金額；補沖銷 = 目前未沖銷餘額）。 */
  capacity: number;
  disabled?: boolean;
  /** 剩餘的稱呼（預收 / 預付 / 未沖銷）。 */
  remainingLabel: string;
}) {
  const byId = new Map(rows.map((r) => [r.document_id, r]));
  const remaining = roundAmount(capacity - allocatedTotal(rows));

  function toggle(doc: OutstandingDoc, checked: boolean) {
    const others = rows.filter((r) => r.document_id !== doc.document_id);
    const left = roundAmount(capacity - allocatedTotal(others));
    const amount = checked ? defaultAllocation(doc.outstanding, left) : 0;
    onChange(
      docs.map(
        (d) =>
          (d.document_id === doc.document_id
            ? { document_id: d.document_id, selected: checked, amount }
            : byId.get(d.document_id)) ?? {
            document_id: d.document_id,
            selected: false,
            amount: 0,
          },
      ),
    );
  }

  function setAmount(docId: string, amount: number) {
    onChange(
      rows.map((r) =>
        r.document_id === docId ? { ...r, amount, selected: true } : r,
      ),
    );
  }

  if (docs.length === 0) {
    return (
      <p className="text-text-muted rounded-lg border border-dashed px-4 py-6 text-center text-[14px]">
        沒有未沖銷的單據；全額將成為{remainingLabel}。
      </p>
    );
  }

  return (
    <div>
      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border text-text-muted border-b">
              <th className="w-10 px-3 py-3" aria-label="勾選" />
              <th className="px-3 py-3 font-medium">單號</th>
              <th className="px-3 py-3 font-medium">日期</th>
              <th className="px-3 py-3 text-right font-medium">單據金額</th>
              <th className="px-3 py-3 text-right font-medium">未沖餘額</th>
              <th className="w-44 px-3 py-3 text-right font-medium">
                本次沖銷
              </th>
              <th className="px-3 py-3 text-right font-medium">沖後餘額</th>
            </tr>
          </thead>
          <tbody>
            {docs.map((d) => {
              const row = byId.get(d.document_id);
              const selected = Boolean(row?.selected);
              const amount = selected ? (row?.amount ?? 0) : 0;
              return (
                <tr
                  key={d.document_id}
                  className="border-border border-b last:border-b-0"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      aria-label={`沖銷 ${d.doc_no}`}
                      checked={selected}
                      disabled={disabled}
                      onChange={(e) => toggle(d, e.target.checked)}
                      className="h-4 w-4"
                    />
                  </td>
                  <td className="text-ink px-3 py-2">
                    <span className="font-mono text-[13px]">{d.doc_no}</span>
                    <span className="text-text-muted ml-2 text-[12px]">
                      {DOC_TYPE_LABEL[d.doc_type as DocType] ?? d.doc_type}
                    </span>
                  </td>
                  <td className="px-3 py-2">{rocDate(d.doc_date)}</td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText value={d.total_twd} negativeRed />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText value={d.outstanding} negativeRed />
                  </td>
                  <td className="px-3 py-2">
                    <NumberInput
                      aria-label={`${d.doc_no} 沖銷金額`}
                      value={amount}
                      decimals={2}
                      allowNegative={d.outstanding < 0}
                      disabled={disabled || !selected}
                      onChange={(n) => setAmount(d.document_id, n)}
                    />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyText
                      value={outstandingAfter(d.outstanding, amount)}
                      negativeRed
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex flex-wrap justify-end gap-x-6 text-[14px]">
        <span>
          沖銷合計{" "}
          <MoneyText value={allocatedTotal(rows)} className="font-semibold" />
        </span>
        <span className={remaining < 0 ? "text-red-600" : ""}>
          剩餘{remainingLabel}{" "}
          <MoneyText value={remaining} className="font-semibold" />
        </span>
      </p>
    </div>
  );
}
