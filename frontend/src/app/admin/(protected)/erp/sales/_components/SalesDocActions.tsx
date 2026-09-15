"use client";
// 銷售單據明細頁的動作列：編輯 / 過帳（確認）/ 刪除草稿 / 作廢（原因必填、二次確認）/
// 轉銷貨單 / 建立銷退單 / 列印。過帳與作廢的 RPC 結果（取號、保養卡機台、警告）就地顯示。
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, unstable_rethrow } from "next/navigation";
import { ERP_BUTTON_SECONDARY, ERP_INPUT } from "@/components/erp/styles";
import type { SalesDocType } from "@/lib/erp/queries/sales";
import type { DocStatus, ErpResult } from "@/lib/erp/types";
import {
  convertQuoteToSaleAction,
  createSalesReturnAction,
  deleteSalesDraftAction,
  postSalesDocumentAction,
  voidSalesDocumentAction,
  type SalesPostResult,
} from "../actions";
import {
  maintenanceMachineHref,
  printHref,
  SALES_BASE_PATH,
  SALES_DOC_LABEL,
  SALES_POST_LABEL,
} from "./sales-config";

const PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60";
const DANGER =
  "inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-4 text-[14px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60";

export function SalesDocActions({
  docId,
  docType,
  status,
}: {
  docId: string;
  docType: SalesDocType;
  status: DocStatus;
}) {
  const router = useRouter();
  const basePath = SALES_BASE_PATH[docType];
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [postResult, setPostResult] = useState<SalesPostResult | null>(null);
  const [voidWarnings, setVoidWarnings] = useState<string[] | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  function run<T>(
    action: () => Promise<ErpResult<T>>,
    onOk: (data: T) => void,
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
        onOk(res.data);
      } catch (e) {
        unstable_rethrow(e);
        setError("操作失敗，請檢查網路連線後再試一次。");
      }
    });
  }

  const label = SALES_DOC_LABEL[docType];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {status === "draft" && (
          <>
            <Link href={`${basePath}/${docId}/edit`} className={PRIMARY}>
              編輯
            </Link>
            <button
              type="button"
              disabled={pending}
              className={PRIMARY}
              onClick={() =>
                run(
                  () => postSalesDocumentAction(docId),
                  (data) => {
                    setPostResult(data);
                    router.refresh();
                  },
                  docType === "Q"
                    ? "確認此報價單？確認後將取號並定稿，不可再修改。"
                    : `確定過帳此${label}？過帳後將取號並異動庫存，不可再修改（需作廢）。`,
                )
              }
            >
              {pending ? "處理中…" : SALES_POST_LABEL[docType]}
            </button>
            <button
              type="button"
              disabled={pending}
              className={DANGER}
              onClick={() =>
                run(
                  () => deleteSalesDraftAction(docId),
                  () => router.push(basePath),
                  `確定刪除此${label}草稿？`,
                )
              }
            >
              刪除草稿
            </button>
          </>
        )}
        {status === "posted" && docType === "Q" && (
          <button
            type="button"
            disabled={pending}
            className={PRIMARY}
            onClick={() =>
              run(
                () => convertQuoteToSaleAction(docId),
                (data) => router.push(`${SALES_BASE_PATH.S}/${data.id}/edit`),
                "將此報價單複製為銷貨單草稿？",
              )
            }
          >
            轉銷貨單
          </button>
        )}
        {status === "posted" && docType === "S" && (
          <button
            type="button"
            disabled={pending}
            className={PRIMARY}
            onClick={() =>
              run(
                () => createSalesReturnAction(docId),
                (data) => router.push(`${SALES_BASE_PATH.SR}/${data.id}/edit`),
                "從此銷貨單建立銷退單草稿？",
              )
            }
          >
            建立銷退單
          </button>
        )}
        {status === "posted" && !voiding && (
          <button
            type="button"
            disabled={pending}
            className={DANGER}
            onClick={() => {
              setError(null);
              setVoiding(true);
            }}
          >
            作廢
          </button>
        )}
        <Link
          href={printHref(docId)}
          target="_blank"
          className={`${ERP_BUTTON_SECONDARY} h-10`}
        >
          列印
        </Link>
      </div>

      {voiding && status === "posted" && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border border-red-200 bg-red-50/40 p-3">
          <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[13px]">
            <span className="text-ink font-medium">
              作廢原因 <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={ERP_INPUT}
              placeholder="例：客戶取消訂單"
            />
          </label>
          <button
            type="button"
            disabled={pending || !reason.trim()}
            className={DANGER}
            onClick={() =>
              run(
                () => voidSalesDocumentAction(docId, reason),
                (data) => {
                  setVoiding(false);
                  setVoidWarnings(data.warnings);
                  router.refresh();
                },
                docType === "S"
                  ? "確定作廢此銷貨單？機號將回庫，由本單建立且無保養紀錄的保養卡機台會被刪除。"
                  : `確定作廢此${label}？`,
              )
            }
          >
            {pending ? "處理中…" : "確認作廢"}
          </button>
          <button
            type="button"
            disabled={pending}
            className={`${ERP_BUTTON_SECONDARY} h-10`}
            onClick={() => setVoiding(false)}
          >
            取消
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700"
        >
          {error}
        </p>
      )}

      {postResult && (
        <div
          role="status"
          className="bg-primary/5 border-primary/30 rounded-lg border px-4 py-3 text-[14px]"
        >
          <p className="text-ink font-semibold">
            已{docType === "Q" ? "確認" : "過帳"}，單號 {postResult.doc_no}
          </p>
          {postResult.machines.length > 0 && (
            <div className="mt-2">
              <p className="text-text-muted text-[13px]">
                已建立 / 連結保養卡機台：
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {postResult.machines.map((m) => (
                  <li key={m.id}>
                    <Link
                      href={maintenanceMachineHref(m.id)}
                      className="text-primary-deep hover:underline"
                    >
                      {[m.model, m.serial_no].filter(Boolean).join(" · ") ||
                        "保養卡機台"}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <WarningList warnings={postResult.warnings} />
        </div>
      )}

      {voidWarnings && (
        <div
          role="status"
          className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-[14px]"
        >
          <p className="text-ink font-semibold">已作廢。</p>
          <WarningList warnings={voidWarnings} />
        </div>
      )}
    </div>
  );
}

function WarningList({ warnings }: { warnings: string[] }) {
  if (warnings.length === 0) return null;
  return (
    <ul className="mt-2 list-disc pl-5 text-[13px] text-amber-700">
      {warnings.map((w, i) => (
        <li key={i}>{w}</li>
      ))}
    </ul>
  );
}

/** 銷退單「選擇銷貨單」頁的建立按鈕。 */
export function CreateReturnButton({ saleId }: { saleId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-2">
      {error && <span className="text-[13px] text-red-600">{error}</span>}
      <button
        type="button"
        disabled={pending}
        className={`${ERP_BUTTON_SECONDARY}`}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const res = await createSalesReturnAction(saleId);
              if (!res.ok) setError(res.error);
              else router.push(`${SALES_BASE_PATH.SR}/${res.data.id}/edit`);
            } catch (e) {
              unstable_rethrow(e);
              setError("操作失敗，請稍後再試。");
            }
          });
        }}
      >
        {pending ? "建立中…" : "建立銷退單"}
      </button>
    </span>
  );
}
