"use client";
// 單據詳情頁動作：草稿 → 編輯／過帳／刪除；已過帳 → 作廢（原因必填、二次確認）。
import Link from "next/link";
import { unstable_rethrow, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DocStatus } from "@/lib/erp/types";
import { ERP_AREA } from "@/components/erp/styles";
import { PRIMARY_LINK, SECONDARY_LINK } from "./InventoryShell";

type Result = { ok: true } | { ok: false; error: string };

export function StockDocActions({
  id,
  status,
  editHref,
  listHref,
  postAction,
  deleteAction,
  voidAction,
}: {
  id: string;
  status: DocStatus;
  editHref: string;
  listHref: string;
  postAction: (id: string) => Promise<Result>;
  deleteAction: (id: string) => Promise<Result>;
  voidAction: (id: string, reason: string) => Promise<Result>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  function run(fn: () => Promise<Result>, onOk: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fn();
        if (!res.ok) setError(res.error);
        else onOk();
      } catch (e) {
        unstable_rethrow(e);
        setError((e as Error)?.message || "操作失敗，請確認網路後再試一次。");
      }
    });
  }

  if (status === "voided") return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <>
            <Link href={editHref} className={SECONDARY_LINK}>
              編輯
            </Link>
            <button
              type="button"
              disabled={pending}
              className={`${PRIMARY_LINK} disabled:opacity-60`}
              onClick={() => {
                if (!window.confirm("確定過帳？過帳後將異動庫存。")) return;
                run(
                  () => postAction(id),
                  () => router.refresh(),
                );
              }}
            >
              {pending ? "處理中…" : "過帳"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="h-10 rounded-lg px-3 text-[14px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
              onClick={() => {
                if (!window.confirm("確定刪除此草稿？此動作無法復原。")) return;
                run(
                  () => deleteAction(id),
                  () => router.push(listHref),
                );
              }}
            >
              刪除草稿
            </button>
          </>
        )}
        {status === "posted" && !voiding && (
          <button
            type="button"
            className="h-10 rounded-lg border border-red-200 bg-white px-4 text-[14px] font-semibold text-red-600 hover:bg-red-50"
            onClick={() => setVoiding(true)}
          >
            作廢
          </button>
        )}
      </div>
      {status === "posted" && voiding && (
        <div className="flex max-w-[480px] flex-col gap-2 rounded-lg border border-red-200 bg-red-50/40 p-3">
          <label
            htmlFor="void-reason"
            className="text-ink text-[14px] font-medium"
          >
            作廢原因 <span className="text-red-500">*</span>
          </label>
          <textarea
            id="void-reason"
            rows={2}
            value={reason}
            disabled={pending}
            onChange={(e) => setReason(e.target.value)}
            className={ERP_AREA}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending || !reason.trim()}
              className="h-9 rounded-lg bg-red-600 px-4 text-[14px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              onClick={() => {
                if (!window.confirm("確定作廢？將反向沖回庫存與機號。")) return;
                run(
                  () => voidAction(id, reason),
                  () => {
                    setVoiding(false);
                    router.refresh();
                  },
                );
              }}
            >
              {pending ? "作廢中…" : "確認作廢"}
            </button>
            <button
              type="button"
              disabled={pending}
              className="text-text-muted h-9 px-3 text-[14px]"
              onClick={() => setVoiding(false)}
            >
              取消
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
