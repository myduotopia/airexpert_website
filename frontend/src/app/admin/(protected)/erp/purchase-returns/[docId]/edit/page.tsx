import { notFound, redirect } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getDocumentWithLines } from "@/lib/erp/documents";
import { draftDocumentFromRow } from "@/lib/erp/draft";
import {
  listItemOptions,
  listVendorOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import { getDocumentBrief } from "@/lib/erp/queries/purchasing";
import { listReceiptInStockSerials } from "../../../purchases/_lib/doc-actions";
import { DocumentForm } from "../../../purchases/_components/DocumentForm";
import { PurchasingTabs } from "../../../purchases/_components/PurchasingTabs";
import {
  postPurchaseReturnAction,
  savePurchaseReturnDraftAction,
} from "../../actions";

export const metadata = { title: "編輯進退單 · ERP" };

const BASE = "/admin/erp/purchase-returns";

export default async function EditPurchaseReturnPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  await requireModule("erp");
  const { docId } = await params;
  const res = await getDocumentWithLines(docId);
  if (!res.ok || res.data.doc_type !== "PR") notFound();
  if (res.data.status !== "draft") redirect(`${BASE}/${docId}`);
  const doc = res.data;

  const [vendors, warehouses, items, source] = await Promise.all([
    listVendorOptions({ includeInactive: true }),
    listWarehouseOptions(),
    listItemOptions({ includeInactive: true }),
    doc.source_doc_id ? getDocumentBrief(doc.source_doc_id) : null,
  ]);

  // 可退機號：限來源進貨單入庫、仍在庫的機號（表單再依出庫倉過濾）。
  const serialItemIds = [
    ...new Set(
      doc.lines
        .map((l) => l.item_id)
        .filter(
          (id): id is string =>
            !!id && !!items.find((i) => i.id === id)?.track_serial,
        ),
    ),
  ];
  const serials = await listReceiptInStockSerials(
    doc.source_doc_id,
    serialItemIds,
  );
  const src = source?.ok ? source.data : null;

  return (
    <div className="mx-auto max-w-[1100px]">
      <h1 className="text-ink mb-4 text-[24px] font-bold">編輯進退單草稿</h1>
      <PurchasingTabs active="purchase-returns" />
      <DocumentForm
        initial={draftDocumentFromRow(doc)}
        basePath={BASE}
        vendors={vendors}
        warehouses={warehouses}
        items={items}
        serials={serials}
        serialMode="existing"
        sourceLabel={
          src
            ? `由進貨單 ${src.doc_no ?? ""} 帶入可退數量；追蹤機號的品項請勾選要退回的在庫機號。`
            : null
        }
        saveAction={savePurchaseReturnDraftAction}
        postAction={postPurchaseReturnAction}
      />
    </div>
  );
}
