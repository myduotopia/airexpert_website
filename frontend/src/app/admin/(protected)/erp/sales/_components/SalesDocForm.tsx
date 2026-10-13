"use client";
// 銷售單據表單（報價 / 銷貨 / 銷退共用）：受控表頭 + 明細編輯器，存檔後導向明細頁。
// - 報價單：儲存即確認（存草稿後立刻過帳取號，列表直接看到正式單）；品項欄可自由輸入或帶入保養卡機型。
// - 銷貨 / 銷退單：「儲存草稿」或「儲存並過帳」（#240，比照採購／進貨）：存草稿成功後過帳，
//   過帳失敗時留在本頁（草稿已存）並顯示錯誤。
// - 送出前先做前端檢核（存草稿條件；過帳時另加倉庫、品項、數量、機號數），一次列出所有錯誤；
//   有錯就不跳確認框（#238 A-4 順帶）。server／RPC 的錯誤仍一次一條。
// - 銷貨單：追機號品項只列「出庫倉」中 in_stock 的機號（serials 由 server 讀出，client 依倉庫篩選）。
// - 銷退單：客戶、稅別稅率、幣別鎖定為來源銷貨單；上方列出各來源行可退數量與可退金額（折扣分攤後淨額，#233），
//   明細合計超過可退金額時即時提示（存草稿時 server 會擋，過帳時 DB 再檢查一次）。
//   即時提示（黃底）已顯示的訊息不再出現在紅底錯誤清單（#248 N-5，excludeLiveHints）。
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { useConfirm } from "@/components/erp/ConfirmDialog";
import { DocumentHeaderFields } from "@/components/erp/DocumentHeaderFields";
import { DocumentLinesEditor } from "@/components/erp/DocumentLinesEditor";
import { ErrorList } from "@/components/erp/ErrorList";
import { ERP_BUTTON_SECONDARY } from "@/components/erp/styles";
import { linesMissingItem } from "@/lib/erp/draft";
import { formatMoney, formatQty } from "@/lib/erp/format";
import { quickCreateTargets } from "@/lib/erp/quick-create";
import type { ReturnableLine, SalesDocType } from "@/lib/erp/queries/sales";
import {
  validateReturnAmount,
  type ReturnAmountLimit,
} from "@/lib/erp/returns";
import type {
  CustomerOption,
  DraftDocument,
  DraftDocumentHeader,
  DraftLine,
  ItemOption,
  SerialOption,
  TaxType,
  WarehouseOption,
} from "@/lib/erp/types";
import type { EmployeeOption } from "@/lib/employees/types";
import {
  collectDraftDocumentErrors,
  collectPostErrors,
  excludeLiveHints,
  mergeErrors,
} from "@/lib/erp/validate";
import { postSalesDocumentAction, saveSalesDraftAction } from "../actions";
import { SALES_BASE_PATH, SALES_DOC_LABEL } from "./sales-config";

export interface SalesDocFormProps {
  initial: DraftDocument;
  customers: CustomerOption[];
  warehouses: WarehouseOption[];
  /** 業務選取器選項（員工主檔，#223）。 */
  employees: EmployeeOption[];
  items: ItemOption[];
  serials: SerialOption[];
  /** 銷退單：來源銷貨單號、稅別幣別、各行可退數量／金額與整張單的金額上限。 */
  returnSource?: {
    docNo: string | null;
    customerId: string | null;
    taxType: TaxType;
    taxRate: number;
    currency: string;
    lines: ReturnableLine[];
    /** 讀取已退金額失敗時為 null（不即時提示；存草稿時 server 仍會檢查）。 */
    amountLimit: ReturnAmountLimit | null;
  } | null;
  /** 報價單：保養卡 / 維護報告單上的機型，供品項欄搜尋帶入。 */
  machineModels?: string[];
}

export function SalesDocForm({
  initial,
  customers,
  warehouses,
  employees,
  items,
  serials,
  returnSource,
  machineModels = [],
}: SalesDocFormProps) {
  const router = useRouter();
  const docType = initial.doc_type as SalesDocType;
  const basePath = SALES_BASE_PATH[docType];
  const { lines: initialLines, ...initialHeader } = initial;
  const [header, setHeader] = useState<DraftDocumentHeader>(initialHeader);
  const [lines, setLines] = useState<DraftLine[]>(initialLines);
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [askConfirm, confirmDialog] = useConfirm();

  // 銷貨：只列出庫倉的在庫機號；銷退：server 已限定為來源單已售機號。
  const serialOptions =
    docType === "S"
      ? serials.filter(
          (s) =>
            !!header.warehouse_id && s.warehouse_id === header.warehouse_id,
        )
      : serials;

  function onHeaderChange(next: DraftDocumentHeader) {
    if (docType === "SR" && returnSource) {
      next = {
        ...next,
        customer_id: returnSource.customerId,
        tax_type: returnSource.taxType,
        tax_rate: returnSource.taxRate,
        currency: returnSource.currency,
      };
    }
    setHeader(next);
  }

  /** andPost：銷貨 / 銷退「儲存並過帳」。報價單一律儲存即確認（confirmOnSave）。 */
  async function save(andPost: boolean) {
    setErrors([]);
    const doc = { ...header, lines };
    const posting = andPost || confirmOnSave;
    const problems = mergeErrors(
      collectDraftDocumentErrors(doc),
      posting ? collectPostErrors(doc, items) : [],
      returnAmountError,
    );
    if (problems.length > 0) {
      // 銷退超額仍擋下存檔，但該訊息已在黃底即時提示，紅底只列其他錯誤；
      // 不存入 errors，之後改金額時也不會留下舊金額的紅底訊息。
      setErrors(excludeLiveHints(problems, returnAmountError));
      return;
    }
    if (
      andPost &&
      !(await askConfirm({
        title: `確定儲存並過帳此${SALES_DOC_LABEL[docType]}？`,
        message: "過帳後將取號並異動庫存，不可再修改（需作廢）。",
        confirmLabel: "過帳",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await saveSalesDraftAction(doc);
        if (!res.ok) {
          setErrors([res.error]);
          return;
        }
        if (posting) {
          // 記住草稿 id：過帳（確認）失敗時修正後再存，會更新同一張草稿而非另建新單。
          setHeader((h) => ({ ...h, id: res.data.id }));
          const posted = await postSalesDocumentAction(res.data.id);
          if (!posted.ok) {
            setErrors([
              confirmOnSave
                ? `報價單已存為草稿，但確認失敗：${posted.error}`
                : `草稿已儲存，但過帳失敗：${posted.error}`,
            ]);
            return;
          }
        }
        router.push(`${basePath}/${res.data.id}`);
      } catch (e) {
        unstable_rethrow(e);
        setErrors(["儲存失敗，請檢查網路連線後再試一次。"]);
      }
    });
  }

  // 報價單目前不經草稿流程：儲存即確認（草稿狀態保留供日後流程調整）。
  const confirmOnSave = docType === "Q";
  const cancelHref = initial.id ? `${basePath}/${initial.id}` : basePath;
  const itemCode = new Map(items.map((i) => [i.id, i.code]));
  const missingItemLines = docType === "S" ? linesMissingItem(lines) : [];
  // 銷退單客戶與品項行固定來自來源銷貨單，不提供新增客戶／品項。
  const quickCreate = quickCreateTargets(docType);
  const returnAmountError =
    returnSource?.amountLimit && docType === "SR"
      ? validateReturnAmount(
          lines,
          returnSource.amountLimit,
          returnSource.taxType,
          returnSource.currency,
        )
      : null;
  const money = (x: number) =>
    formatMoney(x, { currency: returnSource?.currency ?? header.currency });

  return (
    <div className="flex flex-col gap-6">
      {returnSource && (
        <section className="border-border rounded-xl border bg-white p-4">
          <h2 className="text-ink mb-2 text-[15px] font-semibold">
            來源銷貨單 {returnSource.docNo ?? ""}：可退數量與金額
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-[13px]">
              <thead className="text-text-muted text-left">
                <tr>
                  <th className="py-1 pr-3 font-medium">#</th>
                  <th className="py-1 pr-3 font-medium">品項</th>
                  <th className="py-1 pr-3 text-right font-medium">銷貨</th>
                  <th className="py-1 pr-3 text-right font-medium">已退</th>
                  <th className="py-1 pr-3 text-right font-medium">可退</th>
                  <th className="py-1 text-right font-medium">可退金額</th>
                </tr>
              </thead>
              <tbody>
                {returnSource.lines.map((l) => (
                  <tr key={l.line_id} className="border-border border-t">
                    <td className="py-1 pr-3 tabular-nums">{l.line_no}</td>
                    <td className="py-1 pr-3">
                      <span className="font-mono">
                        {(l.item_id && itemCode.get(l.item_id)) || ""}
                      </span>{" "}
                      {l.description}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {formatQty(l.sold)}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {formatQty(l.returned)}
                    </td>
                    <td className="py-1 pr-3 text-right font-semibold tabular-nums">
                      {formatQty(l.remaining)}
                    </td>
                    <td className="py-1 text-right tabular-nums">
                      {money(l.remaining_amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {returnSource.amountLimit && (
            <p className="text-ink mt-2 text-[13px]">
              原單金額 {money(returnSource.amountLimit.original)}
              ，已退 {money(returnSource.amountLimit.returned)}
              ，本單最多可退{" "}
              <span className="font-semibold tabular-nums">
                {money(
                  returnSource.amountLimit.original -
                    returnSource.amountLimit.returned,
                )}
              </span>
              （{returnSource.taxType === "included" ? "含稅" : "未稅"}）。
            </p>
          )}
          <p className="text-text-muted mt-2 text-[12px]">
            退貨單價預設為原單折扣依品項金額比例分攤後的淨價，可手動調整（例如折讓），但累計退貨金額不可超過原單；除不盡時同一品項會拆成兩行。
            退貨數量不可超過可退數量；追蹤機號的品項請勾選實際退回的機號。過帳後機號回到入庫倉，保養卡機台保留。
          </p>
        </section>
      )}

      <section className="border-border rounded-xl border bg-white p-4">
        <DocumentHeaderFields
          value={header}
          onChange={onHeaderChange}
          customers={customers}
          warehouses={warehouses}
          employees={employees}
          disabled={pending}
          allowCreate={quickCreate}
        />
        {docType === "SR" && (
          <p className="text-text-muted mt-2 text-[12px]">
            銷退單的客戶、稅別與幣別固定沿用來源銷貨單。
          </p>
        )}
        {docType === "Q" && (
          <p className="text-text-muted mt-2 text-[12px]">
            報價單不動庫存；儲存後即確認取號，可再「轉銷貨單」。
          </p>
        )}
      </section>

      <section>
        <h2 className="text-ink mb-2 text-[15px] font-semibold">明細</h2>
        <DocumentLinesEditor
          value={lines}
          onChange={setLines}
          items={items}
          serials={serialOptions}
          serialMode={docType === "Q" ? "none" : "existing"}
          priceField="sale_price"
          taxType={header.tax_type}
          taxRate={header.tax_rate}
          currency={header.currency}
          exchangeRate={header.exchange_rate}
          disabled={pending}
          freeText={docType === "Q" ? { models: machineModels } : undefined}
          allowedLineTypes={
            // 小計／總價款行只開放報價單（#221）；轉銷貨單時改為備註行。
            docType === "Q"
              ? ["item", "discount", "note", "subtotal"]
              : undefined
          }
          itemLabel={docType === "Q" ? "產品編號" : undefined}
          allowCreateItem={quickCreate.item}
        />
        {docType === "S" && missingItemLines.length > 0 && (
          <p
            role="status"
            className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800"
          >
            第 {missingItemLines.join("、")}{" "}
            行尚未選擇品項（報價單為自由輸入，未能自動對應品項主檔），過帳前請選定品項。
          </p>
        )}
        {returnAmountError && (
          <p
            role="status"
            className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800"
          >
            {returnAmountError}
          </p>
        )}
        {docType === "S" && !header.warehouse_id && (
          <p className="mt-2 text-[13px] text-amber-700">
            請先選擇出庫倉，才能選取該倉的在庫機號。
          </p>
        )}
      </section>

      {/* server 回傳與即時提示相同的訊息（例：銷退超額）時也只顯示一次。 */}
      <ErrorList errors={excludeLiveHints(errors, returnAmountError)} />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => save(false)}
          disabled={pending}
          className={
            confirmOnSave
              ? "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-semibold text-white disabled:opacity-60"
              : `${ERP_BUTTON_SECONDARY} h-10`
          }
        >
          {pending
            ? "儲存中…"
            : confirmOnSave
              ? `儲存${SALES_DOC_LABEL[docType]}`
              : `儲存${SALES_DOC_LABEL[docType]}草稿`}
        </button>
        {!confirmOnSave && (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={pending}
            className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-semibold text-white disabled:opacity-60"
          >
            {pending ? "處理中…" : "儲存並過帳"}
          </button>
        )}
        <Link href={cancelHref} className={`${ERP_BUTTON_SECONDARY} h-10`}>
          取消
        </Link>
      </div>
      {confirmDialog}
    </div>
  );
}
