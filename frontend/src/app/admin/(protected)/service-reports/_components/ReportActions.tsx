"use client";
// 報告單詳情頁的動作列（spec §4.4）：依狀態顯示編輯 / 列印 / 回填結果 / 結案 /
// 重新開啟 / 作廢（原因必填）/ 刪除草稿（僅未列印）。
// 動作錯誤就地顯示；若是「狀態已被他人變更」類的錯誤，另提供「重新整理」按鈕。
import { useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { ERP_AREA, ERP_BUTTON_SECONDARY } from "@/components/erp/styles";
import type { ServiceReportStatus, SrResult } from "@/lib/service-report/types";
import {
  completeReportAction,
  deleteDraftReportAction,
  reopenReportAction,
  voidReportAction,
} from "../actions";
import { SERVICE_REPORTS_PATH } from "./list-params";
import {
  actionsForStatus,
  needsEditConfirm,
  REPORT_ACTION_LABELS,
  shouldOfferRefresh,
  type ReportActionKey,
} from "./report-actions";

const PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60";
const SECONDARY =
  "border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold disabled:opacity-60";
const DANGER =
  "inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-4 text-[14px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60";

const EDIT_CONFIRM = "此報告單已結案，確定要再修改內容嗎？（結案時間不會改變）";

export function ReportActions({
  id,
  status,
  printCount,
}: {
  id: string;
  status: ServiceReportStatus;
  printCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  const keys = actionsForStatus(status, printCount);
  const editHref = `${SERVICE_REPORTS_PATH}/${id}/edit`;
  const printHref = `${SERVICE_REPORTS_PATH}/print/${id}`;

  function run<T>(
    action: () => Promise<SrResult<T>>,
    onOk: () => void,
    confirmText?: string,
  ) {
    setError(null);
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      try {
        const res = await action();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        onOk();
      } catch (e) {
        unstable_rethrow(e);
        setError("操作失敗，請檢查網路連線後再試一次。");
      }
    });
  }

  function button(key: ReportActionKey) {
    const label = REPORT_ACTION_LABELS[key];
    switch (key) {
      case "edit":
        return needsEditConfirm(status) ? (
          <button
            key={key}
            type="button"
            disabled={pending}
            className={PRIMARY}
            onClick={() => {
              if (window.confirm(EDIT_CONFIRM)) router.push(editHref);
            }}
          >
            {label}
          </button>
        ) : (
          <Link key={key} href={editHref} className={PRIMARY}>
            {label}
          </Link>
        );
      case "fill":
        return (
          <Link key={key} href={editHref} className={SECONDARY}>
            {label}
          </Link>
        );
      case "print":
        return (
          <Link key={key} href={printHref} className={SECONDARY}>
            {label}
          </Link>
        );
      case "complete":
        return (
          <button
            key={key}
            type="button"
            disabled={pending}
            className={PRIMARY}
            onClick={() =>
              run(
                () => completeReportAction(id),
                () => router.refresh(),
                "確定結案此報告單？結案後仍可重新開啟。",
              )
            }
          >
            {pending ? "處理中…" : label}
          </button>
        );
      case "reopen":
        return (
          <button
            key={key}
            type="button"
            disabled={pending}
            className={SECONDARY}
            onClick={() =>
              run(
                () => reopenReportAction(id),
                () => router.refresh(),
                "確定重新開啟此報告單？狀態會回到「已列印」並清除結案時間。",
              )
            }
          >
            {pending ? "處理中…" : label}
          </button>
        );
      case "void":
        return voiding ? null : (
          <button
            key={key}
            type="button"
            disabled={pending}
            className={DANGER}
            onClick={() => {
              setError(null);
              setVoiding(true);
            }}
          >
            {label}
          </button>
        );
      case "delete":
        return (
          <button
            key={key}
            type="button"
            disabled={pending}
            className={DANGER}
            onClick={() =>
              run(
                () => deleteDraftReportAction(id),
                () => {
                  router.push(SERVICE_REPORTS_PATH);
                  router.refresh();
                },
                "確定刪除此草稿？刪除後無法復原。",
              )
            }
          >
            {pending ? "處理中…" : label}
          </button>
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {keys.map((key) => button(key))}
        {keys.length === 0 && (
          <p className="text-text-muted text-[14px]">
            已作廢的報告單為唯讀，不可再修改或列印。
          </p>
        )}
      </div>

      {voiding && (
        <div className="flex flex-col gap-2 rounded-lg border border-red-200 bg-red-50/40 p-3">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="text-ink font-medium">
              作廢原因 <span className="text-red-500">*</span>
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className={ERP_AREA}
              placeholder="例：客戶取消、單號重複開立"
              required
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending || !reason.trim()}
              className={DANGER}
              onClick={() =>
                run(
                  () => voidReportAction(id, reason),
                  () => {
                    setVoiding(false);
                    setReason("");
                    router.refresh();
                  },
                  "確定作廢此報告單？作廢後為唯讀，無法復原。",
                )
              }
            >
              {pending ? "處理中…" : "確認作廢"}
            </button>
            <button
              type="button"
              disabled={pending}
              className={`${ERP_BUTTON_SECONDARY} h-10`}
              onClick={() => {
                setVoiding(false);
                setError(null);
              }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700"
        >
          <span>{error}</span>
          {shouldOfferRefresh(error) && (
            <button
              type="button"
              className={`${ERP_BUTTON_SECONDARY} h-9`}
              onClick={() => {
                setError(null);
                setVoiding(false);
                router.refresh();
              }}
            >
              重新整理
            </button>
          )}
        </div>
      )}
    </div>
  );
}
