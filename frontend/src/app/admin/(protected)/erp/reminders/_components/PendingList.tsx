"use client";
// 待確認（#274）：廠商備註／付款條件中「疑似日期但無法解析」的片段，供人工建立手動規則。
import { useState } from "react";
import Link from "next/link";
import type { PendingNote } from "@/lib/erp/queries/reminders";
import { emptyRuleInput } from "@/lib/erp/reminders/rule-input";
import type { VendorOption } from "@/lib/erp/types";
import { RuleFormDialog, type RuleFormTarget } from "./RuleFormDialog";
import { BTN_SM } from "./ui";

export function PendingList({
  pending,
  vendorOptions,
  today,
}: {
  pending: PendingNote[];
  vendorOptions: VendorOption[];
  today: string;
}) {
  const [edit, setEdit] = useState<RuleFormTarget | null>(null);

  return (
    <>
      <p className="text-text-muted mb-3 text-[14px]">
        以下備註含有日期字樣，但無法自動判斷固定日期（例如「次月10號」「每月1至10號」「每週一次」）。
        請確認後手動建立規則；已處理的可在廠商備註中改寫成「每月10號匯款」這類寫法，再到「全部規則」重新解析。
      </p>
      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border text-text-muted border-b text-[13px]">
              <th className="px-4 py-3 font-medium">廠商</th>
              <th className="px-3 py-3 font-medium">備註片段</th>
              <th className="px-3 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {pending.length === 0 ? (
              <tr>
                <td
                  colSpan={3}
                  className="text-text-muted px-4 py-10 text-center"
                >
                  沒有待確認的備註。
                </td>
              </tr>
            ) : (
              pending.flatMap((p) =>
                p.fragments.map((f, idx) => (
                  <tr
                    key={`${p.vendor.id}-${idx}`}
                    className="border-border border-b last:border-b-0"
                  >
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/admin/erp/vendors/${p.vendor.id}`}
                        className="text-ink hover:text-primary-deep font-medium"
                      >
                        <span className="text-text-muted mr-1 font-mono text-[12px]">
                          {p.vendor.code}
                        </span>
                        {p.vendor.name}
                      </Link>
                      {!p.vendor.active && (
                        <span className="text-text-muted ml-1 text-[12px]">
                          （已停用）
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-pre-wrap">{f}</td>
                    <td className="px-3 py-3 text-right align-top">
                      <button
                        type="button"
                        className={BTN_SM}
                        onClick={() =>
                          setEdit({
                            ruleId: null,
                            initial: {
                              ...emptyRuleInput(today, p.vendor.id),
                              note: f,
                            },
                            source: "manual",
                          })
                        }
                      >
                        建立規則
                      </button>
                    </td>
                  </tr>
                )),
              )
            )}
          </tbody>
        </table>
      </div>
      <RuleFormDialog
        target={edit}
        onClose={() => setEdit(null)}
        vendorOptions={vendorOptions}
      />
    </>
  );
}
