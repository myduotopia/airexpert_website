"use client";

// 單據明細頁動作列：草稿 → 編輯 / 過帳 / 刪除；已過帳 → 轉單 / 作廢（需原因 + 二次確認）；列印連結。
// action 皆為已 bind 單據 id 的 server action，回傳 { ok, error }；錯誤就地顯示。
import Link from "next/link";
import { useRouter, unstable_rethrow } from "next/navigation";
import { useState, useTransition } from "react";
import { ERP_AREA } from "@/components/erp/styles";
import type { DocStatus } from "@/lib/erp/types";

type DocActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };
type SaveResult = { ok: true; id: string } | { ok: false; error: string };

const BTN_SECONDARY =
  "border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold disabled:opacity-60";
const BTN_PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60";
const BTN_DANGER =
  "inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-4 text-[14px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60";

export function DocActionBar({
  docId,
  status,
  basePath,
  listPath,
  postAction,
  voidAction,
  deleteAction,
  convert,
}: {
  docId: string;
  status: DocStatus;
  basePath: string;
  listPath: string;
  postAction: () => Promise<DocActionResult>;
  voidAction: (reason: string) => Promise<DocActionResult>;
  deleteAction: () => Promise<DocActionResult>;
  /** 已過帳時的轉單按鈕（轉進貨單 / 轉進退單）；成功後導向新草稿編輯頁。 */
  convert?: {
    label: string;
    targetBasePath: string;
    action: () => Promise<SaveResult>;
  } | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  function run(fn: () => Promise<void>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        await fn();
      } catch (e) {
        unstable_rethrow(e);
        setError((e as Error)?.message || "操作失敗，請確認網路後再試一次。");
      }
    });
  }

  const handle = (res: DocActionResult) => {
    if (!res.ok) {
      setError(res.error);
      return false;
    }
    if (res.message) setMessage(res.message);
    return true;
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={`/admin/erp/print/${docId}`}
          target="_blank"
          className={BTN_SECONDARY}
        >
          列印
        </Link>
        {status === "draft" && (
          <>
            <button
              type="button"
              disabled={pending}
              className={BTN_DANGER}
              onClick={() => {
                if (!window.confirm("確定刪除此草稿？此動作無法復原。")) return;
                run(async () => {
                  if (handle(await deleteAction())) router.push(listPath);
                });
              }}
            >
              刪除草稿
            </button>
            <Link href={`${basePath}/${docId}/edit`} className={BTN_SECONDARY}>
              編輯
            </Link>
            <button
              type="button"
              disabled={pending}
              className={BTN_PRIMARY}
              onClick={() => {
                if (
                  !window.confirm(
                    "確定過帳？過帳後將取號並異動庫存，只能以作廢撤銷。",
                  )
                ) {
                  return;
                }
                run(async () => {
                  if (handle(await postAction())) router.refresh();
                });
              }}
            >
              {pending ? "處理中…" : "確認過帳"}
            </button>
          </>
        )}
        {status === "posted" && (
          <>
            {!voiding && (
              <button
                type="button"
                disabled={pending}
                className={BTN_DANGER}
                onClick={() => {
                  setVoiding(true);
                  setError(null);
                }}
              >
                作廢
              </button>
            )}
            {convert && (
              <button
                type="button"
                disabled={pending}
                className={BTN_PRIMARY}
                onClick={() =>
                  run(async () => {
                    const res = await convert.action();
                    if (!res.ok) setError(res.error);
                    else
                      router.push(`${convert.targetBasePath}/${res.id}/edit`);
                  })
                }
              >
                {pending ? "處理中…" : convert.label}
              </button>
            )}
          </>
        )}
      </div>

      {voiding && status === "posted" && (
        <div className="border-border flex w-full max-w-[420px] flex-col gap-2 rounded-xl border bg-white p-3">
          <label
            htmlFor="erp-void-reason"
            className="text-ink text-[14px] font-medium"
          >
            作廢原因 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="erp-void-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className={ERP_AREA}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className={BTN_SECONDARY}
              disabled={pending}
              onClick={() => setVoiding(false)}
            >
              取消
            </button>
            <button
              type="button"
              className={BTN_DANGER}
              disabled={pending || !reason.trim()}
              onClick={() => {
                if (
                  !window.confirm("確定作廢此單據？庫存將回沖，單號不再使用。")
                ) {
                  return;
                }
                run(async () => {
                  if (handle(await voidAction(reason))) {
                    setVoiding(false);
                    setReason("");
                    router.refresh();
                  }
                });
              }}
            >
              {pending ? "處理中…" : "確認作廢"}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="max-w-[520px] rounded-lg bg-red-50 px-3 py-2 text-[14px] text-red-700"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="bg-primary/5 text-primary-deep max-w-[520px] rounded-lg px-3 py-2 text-[14px]"
        >
          {message}
        </p>
      )}
    </div>
  );
}
