"use client";
// 提醒清單（#274）：每列一次到期。排序、色標、篩選在 server（lib/erp/reminders/schedule.ts）已處理；
// 本元件負責列上的操作：標記完成／略過（可填備註，寫入 erp_reminder_occurrences）、編輯規則；支票為唯讀（連到收付款單）。
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErpDialog } from "@/components/erp/ErpDialog";
import { ERP_AREA } from "@/components/erp/styles";
import { rocDate } from "@/lib/admin/minguo";
import type { ReminderRuleFull } from "@/lib/erp/queries/reminders";
import { ruleToInput } from "@/lib/erp/reminders/rule-input";
import {
  SOURCE_LABEL,
  URGENCY_LABEL,
  daysLeftLabel,
  type ReminderItem,
} from "@/lib/erp/reminders/schedule";
import type { VendorOption } from "@/lib/erp/types";
import { handleReminderAction } from "../actions";
import { RuleFormDialog, type RuleFormTarget } from "./RuleFormDialog";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  BTN_SM,
  BTN_SM_PRIMARY,
  URGENCY_STYLE,
} from "./ui";

interface HandleTarget {
  item: ReminderItem;
  status: "done" | "skipped";
}

export function ReminderTable({
  items,
  rules,
  vendorOptions,
  today,
  emptyText,
}: {
  items: ReminderItem[];
  /** 依 id 查規則（編輯用）。 */
  rules: Record<string, ReminderRuleFull>;
  vendorOptions: VendorOption[];
  today: string;
  emptyText: string;
}) {
  const [handle, setHandle] = useState<HandleTarget | null>(null);
  const [edit, setEdit] = useState<RuleFormTarget | null>(null);

  function openEdit(ruleId: string) {
    const r = rules[ruleId];
    if (!r) return;
    setEdit({
      ruleId: r.id,
      initial: ruleToInput(r, today),
      source: r.source,
      sourceText: r.source_text,
    });
  }

  return (
    <>
      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[880px] border-collapse text-left text-[14px]">
          <thead>
            <tr className="border-border text-text-muted border-b text-[13px]">
              <th className="w-[130px] px-4 py-3 font-medium">緊急程度</th>
              <th className="px-3 py-3 font-medium">到期日</th>
              <th className="px-3 py-3 font-medium">對象</th>
              <th className="px-3 py-3 font-medium">事項</th>
              <th className="px-3 py-3 font-medium">來源</th>
              <th className="px-3 py-3 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="text-text-muted px-4 py-10 text-center"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              items.map((i) => {
                const style = URGENCY_STYLE[i.urgency];
                return (
                  <tr
                    key={i.key}
                    className="border-border border-b last:border-b-0"
                  >
                    <td className="relative px-4 py-3">
                      <span
                        aria-hidden="true"
                        className={`absolute inset-y-0 left-0 w-1.5 ${style.bar}`}
                      />
                      <span
                        className={`inline-flex rounded-md px-2 py-0.5 text-[13px] font-semibold whitespace-nowrap ring-1 ${style.badge}`}
                        title={URGENCY_LABEL[i.urgency]}
                      >
                        {daysLeftLabel(i.daysLeft)}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {rocDate(i.dueDate)}
                    </td>
                    <td className="px-3 py-3">
                      {i.party ? (
                        <Link
                          href={i.party.href}
                          className="text-ink hover:text-primary-deep font-medium"
                        >
                          {i.party.name}
                        </Link>
                      ) : (
                        <span className="text-text-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-ink font-semibold">{i.title}</p>
                      <p className="text-text-muted text-[12px]">{i.detail}</p>
                      {i.sourceText && (
                        <p
                          className="text-text-muted max-w-[360px] truncate text-[12px]"
                          title={i.sourceText}
                        >
                          備註：{i.sourceText}
                        </p>
                      )}
                      {i.note && (
                        <p className="text-text-muted text-[12px]">{i.note}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      {SOURCE_LABEL[i.source]}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1.5">
                        {i.ruleId ? (
                          <>
                            <button
                              type="button"
                              className={BTN_SM_PRIMARY}
                              onClick={() =>
                                setHandle({ item: i, status: "done" })
                              }
                            >
                              完成
                            </button>
                            <button
                              type="button"
                              className={BTN_SM}
                              onClick={() =>
                                setHandle({ item: i, status: "skipped" })
                              }
                            >
                              略過
                            </button>
                            <button
                              type="button"
                              className={BTN_SM}
                              onClick={() => openEdit(i.ruleId as string)}
                            >
                              編輯規則
                            </button>
                          </>
                        ) : (
                          i.href && (
                            <Link href={i.href} className={BTN_SM}>
                              查看單據
                            </Link>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <HandleDialog target={handle} onClose={() => setHandle(null)} />
      <RuleFormDialog
        target={edit}
        onClose={() => setEdit(null)}
        vendorOptions={vendorOptions}
      />
    </>
  );
}

function HandleDialog({
  target,
  onClose,
}: {
  target: HandleTarget | null;
  onClose: () => void;
}) {
  const done = target?.status === "done";
  return (
    <ErpDialog
      open={target !== null}
      onClose={onClose}
      title={done ? "標記完成" : "略過這次"}
      description={
        target
          ? `${target.item.party?.name ? `${target.item.party.name}・` : ""}${target.item.title}，到期日 ${rocDate(target.item.dueDate)}。${done ? "完成" : "略過"}後這次不再出現，下一次照常提醒。`
          : undefined
      }
      size="md"
    >
      {target && (
        <HandleForm key={target.item.key} target={target} onClose={onClose} />
      )}
    </ErpDialog>
  );
}

function HandleForm({
  target,
  onClose,
}: {
  target: HandleTarget;
  onClose: () => void;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = target.status === "done" ? "完成" : "略過";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await handleReminderAction({
      ruleId: target.item.ruleId as string,
      dueDate: target.item.dueDate,
      status: target.status,
      note,
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="text-ink text-[14px] font-medium" htmlFor="handle-note">
        備註（選填）
      </label>
      <textarea
        id="handle-note"
        data-autofocus
        rows={3}
        maxLength={500}
        className={ERP_AREA}
        placeholder={
          target.status === "done" ? "例：已於 10/8 匯款" : "例：本月免付"
        }
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && (
        <p role="alert" className="text-[14px] text-red-600">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          取消
        </button>
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>
          {busy ? "儲存中…" : label}
        </button>
      </div>
    </form>
  );
}
