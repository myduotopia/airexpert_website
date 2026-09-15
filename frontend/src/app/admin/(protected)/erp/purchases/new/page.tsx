import { requireModule } from "@/lib/admin/auth";
import { newDraftDocument, newDraftLine } from "@/lib/erp/draft";
import {
  listItemOptions,
  listVendorOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import { todayIso } from "@/lib/erp/queries/purchasing";
import { DocumentForm } from "../_components/DocumentForm";
import { PurchasingTabs } from "../_components/PurchasingTabs";
import { postPurchaseAction, savePurchaseDraftAction } from "../actions";

export const metadata = { title: "新增採購單 · ERP" };

export default async function NewPurchasePage() {
  await requireModule("erp");
  const [vendors, warehouses, items] = await Promise.all([
    listVendorOptions(),
    listWarehouseOptions(),
    listItemOptions(),
  ]);
  const initial = newDraftDocument("P", todayIso(), {
    lines: [newDraftLine("item")],
  });

  return (
    <div className="mx-auto max-w-[1100px]">
      <h1 className="text-ink mb-4 text-[24px] font-bold">新增採購單</h1>
      <PurchasingTabs active="purchases" />
      <DocumentForm
        initial={initial}
        basePath="/admin/erp/purchases"
        vendors={vendors}
        warehouses={warehouses}
        items={items}
        saveAction={savePurchaseDraftAction}
        postAction={postPurchaseAction}
      />
    </div>
  );
}
