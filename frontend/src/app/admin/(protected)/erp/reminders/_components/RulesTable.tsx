"use client";
// 提醒規則清單（#274）：「全部規則」頁籤與廠商詳情頁共用。新增手動規則、編輯、啟用／停用、刪除（限手動）；
// 「全部規則」另有「從廠商備註重新解析」（批次同步全部廠商的 auto 規則，不動手動規則）。
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/components/erp/ConfirmDialog";
import { rocDate } from "@/lib/admin/minguo";
import type { ReminderRuleFull } from "@/lib/erp/queries/reminders";
import { emptyRuleInput, ruleToInput } from "@/lib/erp/reminders/rule-input";
import { recurrenceLabel, SOURCE_LABEL } from "@/lib/erp/reminders/schedule";
import type { VendorOption } from "@/lib/erp/types";
import {
  deleteReminderRuleAction,
  resyncAllVendorRemindersAction,
  resyncVendorRemindersAction,
  setReminderRuleActiveAction,
} from "../actions";
import { RuleFormDialog, type RuleFormTarget } from "./RuleFormDialog";
import { BTN_PRIMARY, BTN_SECONDARY, BTN_SM } from "./ui";

export function RulesTable({
  rules,
  today,
  vendorOptions,
  fixedVendor,
  showResync = false,
  showVendor = true,
  syncPending = false,
}: {
  rules: ReminderRuleFull[];
  today: string;
  /** 新增／編輯時可選的廠商；未傳時對象固定為 fixedVendor。 */
  vendorOptions?: VendorOption[];
  /** 廠商詳情頁：新增的規則對象固定為此廠商。 */
  fixedVendor?: { id: string; name: string };
  showResync?: boolean;
  showVendor?: boolean;
  /** 廠商詳情頁：備註與 auto 規則不一致（存檔時同步失敗或尚未同步）→ 顯示提示與重新同步鈕。 */
  syncPending?: boolean;
}) {
  const router = useRouter();
  const [askConfirm, confirmDialog] = useConfirm();
  const [edit, setEdit] = useState<RuleFormTarget | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);

  async function run(
    id: string,
    fn: () => Promise<{ ok: boolean; error?: string }>,
  ) {
    setBusyId(id);
    setMessage(null);
    const res = await fn();
    setBusyId(null);
    if (!res.ok) setMessage({ tone: "error", text: res.error ?? "操作失敗。" });
    else router.refresh();
  }

  async function resync() {
    if (
      !(await askConfirm({
        title: "從廠商備註重新解析？",
        message:
          "重新解析全部廠商的備註與付款條件：新增新出現的日期、更新原文、停用備註中已刪除的規則。手動規則不受影響，已處理的紀錄保留。",
        confirmLabel: "重新解析",
      }))
    ) {
      return;
    }
    setBusyId("resync");
    setMessage(null);
    const res = await resyncAllVendorRemindersAction();
    setBusyId(null);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.error });
      return;
    }
    const s = res.summary;
    setMessage({
      tone: "ok",
      text: `已解析 ${s.vendors} 家廠商：新增 ${s.inserted} 條、更新 ${s.updated} 條規則。`,
    });
    router.refresh();
  }

  async function resyncVendor(vendorId: string) {
    setBusyId("resync-vendor");
    setMessage(null);
    const res = await resyncVendorRemindersAction(vendorId);
    setBusyId(null);
    if (!res.ok) {
      setMessage({ tone: "error", text: res.error });
      return;
    }
    setMessage({
      tone: "ok",
      text: `已重新同步：新增 ${res.summary.inserted} 條、更新 ${res.summary.updated} 條規則。`,
    });
    router.refresh();
  }

  function openNew() {
    setEdit({
      ruleId: null,
      initial: emptyRuleInput(today, fixedVendor?.id ?? null),
      source: "manual",
    });
  }

  const colCount = showVendor ? 7 : 6;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {showResync && (
          <button
            type="button"
            onClick={resync}
            disabled={busyId === "resync"}
            className={BTN_SECONDARY}
          >
            {busyId === "resync" ? "解析中…" : "從廠商備註重新解析"}
          </button>
        )}
        <button type="button" onClick={openNew} className={BTN_PRIMARY}>
          新增規則
        </button>
      </div>
      {syncPending && fixedVendor && (
        <div
          role="status"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900"
        >
          <span>
            備註或付款條件的內容尚未同步到提醒規則（可能是存檔時同步失敗，或資料由匯入寫入）。
          </span>
          <button
            type="button"
            onClick={() => resyncVendor(fixedVendor.id)}
            disabled={busyId === "resync-vendor"}
            className={BTN_SECONDARY}
          >
            {busyId === "resync-vendor" ? "同步中…" : "重新同步"}
          </button>
        </div>
      )}
      {message && (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`mb-3 text-[14px] ${message.tone === "error" ? "text-red-600" : "text-primary-deep"}`}
        >
          {message.text}
        </p>
      )}

      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[820px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border text-text-muted border-b text-[13px]">
              {showVendor && <th className="px-4 py-3 font-medium">對象</th>}
              <th className="px-3 py-3 font-medium">事項</th>
              <th className="px-3 py-3 font-medium">週期</th>
              <th className="px-3 py-3 font-medium">提前</th>
              <th className="px-3 py-3 font-medium">來源</th>
              <th className="px-3 py-3 font-medium">狀態</th>
              <th className="px-3 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rules.length === 0 ? (
              <tr>
                <td
                  colSpan={colCount}
                  className="text-text-muted px-4 py-10 text-center"
                >
                  尚無提醒規則。
                </td>
              </tr>
            ) : (
              rules.map((r) => (
                <tr
                  key={r.id}
                  className={`border-border border-b last:border-b-0 ${r.active ? "" : "text-text-muted"}`}
                >
                  {showVendor && (
                    <td className="px-4 py-3">
                      {r.vendor_id ? (
                        <Link
                          href={`/admin/erp/vendors/${r.vendor_id}`}
                          className="hover:text-primary-deep font-medium"
                        >
                          {r.vendor_name ?? "—"}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {r.vendor_active === false && (
                        <span className="text-text-muted ml-1 text-[12px]">
                          （廠商已停用）
                        </span>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-3">
                    <p className="font-semibold">{r.title}</p>
                    {r.note && (
                      <p className="text-text-muted text-[12px]">{r.note}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {recurrenceLabel(r)}
                    {r.kind !== "once" && (
                      <p className="text-text-muted text-[12px]">
                        {rocDate(r.start_date)} 起
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.lead_days} 天
                  </td>
                  <td className="px-3 py-3">
                    {SOURCE_LABEL[r.source]}
                    {r.source_text && (
                      <p
                        className="text-text-muted max-w-[260px] truncate text-[12px]"
                        title={r.source_text}
                      >
                        {r.source_text}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {r.active
                      ? "啟用"
                      : r.auto_missing
                        ? "停用（備註已無此項）"
                        : "停用"}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        className={BTN_SM}
                        onClick={() =>
                          setEdit({
                            ruleId: r.id,
                            initial: ruleToInput(r, today),
                            source: r.source,
                            sourceText: r.source_text,
                          })
                        }
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        className={BTN_SM}
                        disabled={busyId === r.id}
                        onClick={() =>
                          run(r.id, () =>
                            setReminderRuleActiveAction(r.id, !r.active),
                          )
                        }
                      >
                        {r.active ? "停用" : "啟用"}
                      </button>
                      {r.source === "manual" && (
                        <button
                          type="button"
                          className={`${BTN_SM} text-red-600`}
                          disabled={busyId === r.id}
                          onClick={async () => {
                            if (
                              !(await askConfirm({
                                title: `確定刪除「${r.title}」？`,
                                message:
                                  "規則與其處理紀錄會一併刪除，無法復原。",
                                confirmLabel: "刪除",
                                tone: "danger",
                              }))
                            ) {
                              return;
                            }
                            await run(r.id, () =>
                              deleteReminderRuleAction(r.id),
                            );
                          }}
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <RuleFormDialog
        target={edit}
        onClose={() => setEdit(null)}
        vendorOptions={vendorOptions}
        fixedVendorName={vendorOptions ? undefined : fixedVendor?.name}
      />
      {confirmDialog}
    </>
  );
}
