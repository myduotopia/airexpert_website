// 銷售單據的新增 / 編輯頁（server component）：讀取選項（客戶、倉庫、品項、機號）後交給 SalesDocForm。
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDocumentWithLines } from "@/lib/erp/documents";
import { draftDocumentFromRow, newDraftDocument } from "@/lib/erp/draft";
import {
  listAvailableSerials,
  listCustomerOptions,
  listItemOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import {
  getDocumentBrief,
  getReturnedQtyBySourceLine,
  returnableLines,
  todayTaipei,
  type SalesDocType,
} from "@/lib/erp/queries/sales";
import type { DraftDocument, SerialOption } from "@/lib/erp/types";
import { SalesDocForm, type SalesDocFormProps } from "./SalesDocForm";
import { SalesTabs } from "./SalesTabs";
import { SALES_BASE_PATH, SALES_DOC_LABEL } from "./sales-config";

function Shell({
  docType,
  title,
  backHref,
  children,
}: {
  docType: SalesDocType;
  title: string;
  backHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-4">
        <h1 className="text-ink text-[24px] font-bold">銷售</h1>
      </div>
      <SalesTabs active={docType} />
      <Link
        href={backHref}
        className="text-text-muted hover:text-ink mb-3 inline-block text-[14px]"
      >
        ← 返回
      </Link>
      <h2 className="text-ink mb-4 text-[20px] font-bold">{title}</h2>
      {children}
    </div>
  );
}

/** 新增報價單 / 銷貨單（銷退單需從銷貨單建立，見 sales-returns/new）。 */
export async function SalesDocNewPage({
  docType,
}: {
  docType: Exclude<SalesDocType, "SR">;
}) {
  const [customers, warehouses, items] = await Promise.all([
    listCustomerOptions(),
    listWarehouseOptions(),
    listItemOptions(),
  ]);
  const serials =
    docType === "S"
      ? await listAvailableSerials({
          itemId: items.filter((i) => i.track_serial).map((i) => i.id),
          status: "in_stock",
        })
      : [];
  const initial = newDraftDocument(docType, todayTaipei(), {
    warehouse_id:
      docType === "S"
        ? (warehouses.find((w) => w.is_default)?.id ?? null)
        : null,
  });
  return (
    <Shell
      docType={docType}
      title={`新增${SALES_DOC_LABEL[docType]}`}
      backHref={SALES_BASE_PATH[docType]}
    >
      <SalesDocForm
        initial={initial}
        customers={customers}
        warehouses={warehouses}
        items={items}
        serials={serials}
      />
    </Shell>
  );
}

/** 編輯草稿；非草稿導回明細頁。 */
export async function SalesDocEditPage({
  docType,
  id,
}: {
  docType: SalesDocType;
  id: string;
}) {
  const res = await getDocumentWithLines(id);
  if (!res.ok || res.data.doc_type !== docType) notFound();
  const doc = res.data;
  const basePath = SALES_BASE_PATH[docType];
  if (doc.status !== "draft") redirect(`${basePath}/${doc.id}`);

  const [customers, warehouses, items] = await Promise.all([
    listCustomerOptions({ includeInactive: true }),
    listWarehouseOptions(),
    listItemOptions(),
  ]);
  const trackIds = items.filter((i) => i.track_serial).map((i) => i.id);
  const initial: DraftDocument = draftDocumentFromRow(doc);

  let serials: SerialOption[] = [];
  let returnSource: SalesDocFormProps["returnSource"] = null;
  let loadError: string | null = null;

  if (docType === "S") {
    serials = await listAvailableSerials({
      itemId: trackIds,
      status: "in_stock",
    });
  } else if (docType === "SR" && doc.source_doc_id) {
    const sale = await getDocumentWithLines(doc.source_doc_id);
    if (sale.ok) {
      const returned = await getReturnedQtyBySourceLine(
        sale.data.lines.map((l) => l.id),
        doc.id,
      );
      if (!returned.ok) loadError = returned.error;
      returnSource = {
        docNo: sale.data.doc_no,
        customerId: sale.data.customer_id,
        lines: returnableLines(sale.data, returned.ok ? returned.data : {}),
      };
      // 只列出來源銷貨單上、目前仍售予此客戶的機號。
      const soldOnSale = new Set(
        sale.data.lines.flatMap((l) => l.serials.map((s) => s.id)),
      );
      const sold = await listAvailableSerials({
        itemId: trackIds,
        status: "sold",
        customerId: sale.data.customer_id,
      });
      serials = sold.filter((s) => soldOnSale.has(s.id));
    } else {
      loadError = sale.error;
    }
  }

  const source =
    docType === "S" && doc.source_doc_id
      ? await getDocumentBrief(doc.source_doc_id)
      : null;

  return (
    <Shell
      docType={docType}
      title={`編輯${SALES_DOC_LABEL[docType]}草稿`}
      backHref={`${basePath}/${doc.id}`}
    >
      {source && (
        <p className="text-text-muted mb-4 text-[14px]">
          由報價單 <span className="font-mono">{source.doc_no}</span>{" "}
          轉入。過帳前請確認出庫倉並選取機號。
        </p>
      )}
      {loadError && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700">
          {loadError}
        </p>
      )}
      <SalesDocForm
        initial={initial}
        customers={customers}
        warehouses={warehouses}
        items={items}
        serials={serials}
        returnSource={returnSource}
      />
    </Shell>
  );
}
