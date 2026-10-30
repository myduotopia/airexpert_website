"use client";
// 銷售單據明細頁的動作列：編輯 / 過帳（確認）/ 刪除草稿 / 作廢（原因必填、二次確認）/
// 轉銷貨單 / 建立銷退單 / 列印。過帳與作廢的 RPC 結果（取號、保養卡機台、警告）就地顯示。
// 轉銷貨單 / 建立銷退單的確認框會列出已轉出的單據並視情況警示（#234，規則見 lib/erp/derived-confirm.ts）。
// 過帳：先跳確認框，按確認後才看前端檢核（postErrors，由明細頁以 collectPostErrors 算好傳入），
// 有錯一次列出、不呼叫過帳（#240；順序依 #254 A-4 維持原本做法）。
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, unstable_rethrow } from "next/navigation";
import { DocStatusBadge } from "@/components/erp/DocStatusBadge";
import { ErrorList } from "@/components/erp/ErrorList";
import { GatedLink, PermissionHint } from "@/components/erp/GatedLink";
import { ERP_BUTTON_SECONDARY, ERP_INPUT } from "@/components/erp/styles";
import {
  useConfirm,
  type ConfirmOptions,
} from "@/components/erp/ConfirmDialog";
import {
  reconvertConfirmOptions,
  returnConfirmOptions,
  type DerivedConfirm,
  type DerivedDocInput,
} from "@/lib/erp/derived-confirm";
import { maintenanceMachineHref } from "@/lib/erp/admin-links";
import type { SalesDocType } from "@/lib/erp/queries/sales";
import { gateSubmit } from "@/lib/erp/submit-gate";
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
  printHref,
  SALES_BASE_PATH,
  SALES_DOC_LABEL,
  SALES_POST_LABEL,
} from "./sales-config";

const PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60";
const DANGER =
  "inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-4 text-[14px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60";

/** 衍生單據確認框內容 → ConfirmOptions：有單據時把清單（單號／草稿 + 狀態標籤）放進說明。 */
function derivedConfirmOptions({
  docs,
  message,
  ...rest
}: DerivedConfirm): ConfirmOptions {
  if (docs.length === 0) return { ...rest, message };
  return {
    ...rest,
    message: (
      <>
        {message && <p>{message}</p>}
        <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3">
              <span
                className={`${d.status === "draft" ? "" : "font-mono"} ${d.voided ? "text-gray-400 line-through" : "text-ink"}`}
              >
                {d.label}
              </span>
              <DocStatusBadge status={d.status} />
            </li>
          ))}
        </ul>
      </>
    ),
  };
}

export function SalesDocActions({
  docId,
  docType,
  status,
  derivedDocs = [],
  postErrors = [],
  canOpenMaintenance = false,
}: {
  docId: string;
  docType: SalesDocType;
  status: DocStatus;
  /** 由本單轉出的單據（報價 → 銷貨、銷貨 → 銷退；含草稿與作廢），新→舊。 */
  derivedDocs?: DerivedDocInput[];
  /** 草稿過帳前的前端檢核錯誤（lib/erp/validate collectPostErrors）；按過帳並確認後，有錯只列出錯誤。 */
  postErrors?: string[];
  /** 可否開啟保養卡（明細頁以 hasMaintenanceAccess() 算好傳入）；否則機台只顯示文字（#283）。 */
  canOpenMaintenance?: boolean;
}) {
  const router = useRouter();
  const basePath = SALES_BASE_PATH[docType];
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [checkErrors, setCheckErrors] = useState<string[]>([]);
  const [postResult, setPostResult] = useState<SalesPostResult | null>(null);
  const [voidWarnings, setVoidWarnings] = useState<string[] | null>(null);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");
  const [askConfirm, confirmDialog] = useConfirm();

  /** confirm：先跳確認框；check：確認後才做的前端檢核，有錯一次列出、不呼叫 action（#254）。 */
  async function run<T>(
    action: () => Promise<ErpResult<T>>,
    onOk: (data: T) => void,
    confirm?: ConfirmOptions,
    check?: () => readonly string[],
  ) {
    setError(null);
    setCheckErrors([]);
    const gate = await gateSubmit({
      confirm: confirm ? () => askConfirm(confirm) : null,
      check: check ?? (() => []),
    });
    if (gate.kind === "cancelled") return;
    if (gate.kind === "invalid") {
      setCheckErrors(gate.errors);
      return;
    }
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
                    ? {
                        title: "確認此報價單？",
                        message: "確認後將取號並定稿，不可再修改。",
                        confirmLabel: "確認報價",
                      }
                    : {
                        title: `確定過帳此${label}？`,
                        message:
                          "過帳後將取號並異動庫存，不可再修改（需作廢）。",
                        confirmLabel: "過帳",
                      },
                  () => postErrors,
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
                  {
                    title: `確定刪除此${label}草稿？`,
                    confirmLabel: "刪除",
                    tone: "danger",
                  },
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
                derivedConfirmOptions(reconvertConfirmOptions(derivedDocs)),
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
                derivedConfirmOptions(returnConfirmOptions(derivedDocs)),
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
                  ? {
                      title: "確定作廢此銷貨單？",
                      message:
                        "機號將回庫，由本單建立且無保養紀錄的保養卡機台會被刪除。",
                      confirmLabel: "作廢",
                      tone: "danger",
                    }
                  : {
                      title: `確定作廢此${label}？`,
                      confirmLabel: "作廢",
                      tone: "danger",
                    },
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

      <ErrorList errors={error ? [error] : checkErrors} />

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
                {!canOpenMaintenance && <PermissionHint />}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {postResult.machines.map((m) => (
                  <li key={m.id}>
                    <GatedLink
                      href={maintenanceMachineHref(m.id)}
                      allowed={canOpenMaintenance}
                      className="text-primary-deep hover:underline"
                    >
                      {[m.model, m.serial_no].filter(Boolean).join(" · ") ||
                        "保養卡機台"}
                    </GatedLink>
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
      {confirmDialog}
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
