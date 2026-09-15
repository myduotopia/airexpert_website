"use client";
// 銷售單據表單（報價 / 銷貨 / 銷退共用）：受控表頭 + 明細編輯器，「儲存草稿」後導向明細頁（於明細頁過帳）。
// - 銷貨單：追機號品項只列「出庫倉」中 in_stock 的機號（serials 由 server 讀出，client 依倉庫篩選）。
// - 銷退單：客戶鎖定為來源銷貨單客戶；上方列出各來源行可退數量。
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { DocumentHeaderFields } from "@/components/erp/DocumentHeaderFields";
import { DocumentLinesEditor } from "@/components/erp/DocumentLinesEditor";
import { ERP_BUTTON_SECONDARY } from "@/components/erp/styles";
import { formatQty } from "@/lib/erp/format";
import type { ReturnableLine, SalesDocType } from "@/lib/erp/queries/sales";
import type {
  CustomerOption,
  DraftDocument,
  DraftDocumentHeader,
  DraftLine,
  ItemOption,
  SerialOption,
  WarehouseOption,
} from "@/lib/erp/types";
import { saveSalesDraftAction } from "../actions";
import { SALES_BASE_PATH, SALES_DOC_LABEL } from "./sales-config";

export interface SalesDocFormProps {
  initial: DraftDocument;
  customers: CustomerOption[];
  warehouses: WarehouseOption[];
  items: ItemOption[];
  serials: SerialOption[];
  /** 銷退單：來源銷貨單號與各行可退數量。 */
  returnSource?: {
    docNo: string | null;
    customerId: string | null;
    lines: ReturnableLine[];
  } | null;
}

export function SalesDocForm({
  initial,
  customers,
  warehouses,
  items,
  serials,
  returnSource,
}: SalesDocFormProps) {
  const router = useRouter();
  const docType = initial.doc_type as SalesDocType;
  const basePath = SALES_BASE_PATH[docType];
  const { lines: initialLines, ...initialHeader } = initial;
  const [header, setHeader] = useState<DraftDocumentHeader>(initialHeader);
  const [lines, setLines] = useState<DraftLine[]>(initialLines);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

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
      next = { ...next, customer_id: returnSource.customerId };
    }
    setHeader(next);
  }

  function save() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await saveSalesDraftAction({ ...header, lines });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push(`${basePath}/${res.data.id}`);
      } catch (e) {
        unstable_rethrow(e);
        setError("儲存失敗，請檢查網路連線後再試一次。");
      }
    });
  }

  const cancelHref = initial.id ? `${basePath}/${initial.id}` : basePath;
  const itemCode = new Map(items.map((i) => [i.id, i.code]));

  return (
    <div className="flex flex-col gap-6">
      {returnSource && (
        <section className="border-border rounded-xl border bg-white p-4">
          <h2 className="text-ink mb-2 text-[15px] font-semibold">
            來源銷貨單 {returnSource.docNo ?? ""}：可退數量
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-[13px]">
              <thead className="text-text-muted text-left">
                <tr>
                  <th className="py-1 pr-3 font-medium">#</th>
                  <th className="py-1 pr-3 font-medium">品項</th>
                  <th className="py-1 pr-3 text-right font-medium">銷貨</th>
                  <th className="py-1 pr-3 text-right font-medium">已退</th>
                  <th className="py-1 text-right font-medium">可退</th>
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
                    <td className="py-1 text-right font-semibold tabular-nums">
                      {formatQty(l.remaining)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-text-muted mt-2 text-[12px]">
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
          disabled={pending}
        />
        {docType === "SR" && (
          <p className="text-text-muted mt-2 text-[12px]">
            銷退單客戶固定為來源銷貨單的客戶。
          </p>
        )}
        {docType === "Q" && (
          <p className="text-text-muted mt-2 text-[12px]">
            報價單不動庫存；確認後取號，可再「轉銷貨單」。
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
        />
        {docType === "S" && !header.warehouse_id && (
          <p className="mt-2 text-[13px] text-amber-700">
            請先選擇出庫倉，才能選取該倉的在庫機號。
          </p>
        )}
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-semibold text-white disabled:opacity-60"
        >
          {pending ? "儲存中…" : `儲存${SALES_DOC_LABEL[docType]}草稿`}
        </button>
        <Link href={cancelHref} className={`${ERP_BUTTON_SECONDARY} h-10`}>
          取消
        </Link>
      </div>
    </div>
  );
}
