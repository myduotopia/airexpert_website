import { notFound, redirect } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getDocumentWithLines } from "@/lib/erp/documents";
import { DOC_TYPE_LABEL } from "@/lib/erp/doc-no";
import { draftDocumentFromRow } from "@/lib/erp/draft";
import {
  listItemOptions,
  listVendorOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import { getDocumentBrief } from "@/lib/erp/queries/purchasing";
import { DocumentForm } from "../../../purchases/_components/DocumentForm";
import { PurchasingTabs } from "../../../purchases/_components/PurchasingTabs";
import { postReceiptAction, saveReceiptDraftAction } from "../../actions";

export const metadata = { title: "編輯進貨單 · ERP" };

const BASE = "/admin/erp/receipts";

export default async function EditReceiptPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  await requireModule("erp");
  const { docId } = await params;
  const res = await getDocumentWithLines(docId);
  if (!res.ok || res.data.doc_type !== "I") notFound();
  if (res.data.status !== "draft") redirect(`${BASE}/${docId}`);

  const [vendors, warehouses, items, source] = await Promise.all([
    listVendorOptions({ includeInactive: true }),
    listWarehouseOptions(),
    listItemOptions({ includeInactive: true }),
    res.data.source_doc_id ? getDocumentBrief(res.data.source_doc_id) : null,
  ]);
  const src = source?.ok ? source.data : null;

  return (
    <div className="mx-auto max-w-[1100px]">
      <h1 className="text-ink mb-4 text-[24px] font-bold">編輯進貨單草稿</h1>
      <PurchasingTabs active="receipts" />
      <DocumentForm
        initial={draftDocumentFromRow(res.data)}
        basePath={BASE}
        vendors={vendors}
        warehouses={warehouses}
        items={items}
        serialMode="new"
        sourceLabel={
          src
            ? `由${DOC_TYPE_LABEL.P} ${src.doc_no ?? ""} 轉入；追蹤機號的品項請每台輸入一個機號（可貼上多行）。`
            : null
        }
        saveAction={saveReceiptDraftAction}
        postAction={postReceiptAction}
      />
    </div>
  );
}
