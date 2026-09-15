import { notFound, redirect } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getDocumentWithLines } from "@/lib/erp/documents";
import { draftDocumentFromRow } from "@/lib/erp/draft";
import {
  listItemOptions,
  listVendorOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import { DocumentForm } from "../../_components/DocumentForm";
import { PurchasingTabs } from "../../_components/PurchasingTabs";
import { postPurchaseAction, savePurchaseDraftAction } from "../../actions";

export const metadata = { title: "編輯採購單 · ERP" };

const BASE = "/admin/erp/purchases";

export default async function EditPurchasePage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  await requireModule("erp");
  const { docId } = await params;
  const res = await getDocumentWithLines(docId);
  if (!res.ok || res.data.doc_type !== "P") notFound();
  if (res.data.status !== "draft") redirect(`${BASE}/${docId}`);

  const [vendors, warehouses, items] = await Promise.all([
    listVendorOptions({ includeInactive: true }),
    listWarehouseOptions(),
    listItemOptions({ includeInactive: true }),
  ]);

  return (
    <div className="mx-auto max-w-[1100px]">
      <h1 className="text-ink mb-4 text-[24px] font-bold">編輯採購單草稿</h1>
      <PurchasingTabs active="purchases" />
      <DocumentForm
        initial={draftDocumentFromRow(res.data)}
        basePath={BASE}
        vendors={vendors}
        warehouses={warehouses}
        items={items}
        saveAction={savePurchaseDraftAction}
        postAction={postPurchaseAction}
      />
    </div>
  );
}
