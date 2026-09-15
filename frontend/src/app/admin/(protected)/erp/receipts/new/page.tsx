import { requireModule } from "@/lib/admin/auth";
import { newDraftDocument, newDraftLine } from "@/lib/erp/draft";
import {
  listItemOptions,
  listVendorOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import { todayIso } from "@/lib/erp/queries/purchasing";
import { DocumentForm } from "../../purchases/_components/DocumentForm";
import { PurchasingTabs } from "../../purchases/_components/PurchasingTabs";
import { postReceiptAction, saveReceiptDraftAction } from "../actions";

export const metadata = { title: "新增進貨單 · ERP" };

export default async function NewReceiptPage() {
  await requireModule("erp");
  const [vendors, warehouses, items] = await Promise.all([
    listVendorOptions(),
    listWarehouseOptions(),
    listItemOptions(),
  ]);
  const initial = newDraftDocument("I", todayIso(), {
    warehouse_id: warehouses[0]?.id ?? null,
    lines: [newDraftLine("item")],
  });

  return (
    <div className="mx-auto max-w-[1100px]">
      <h1 className="text-ink mb-4 text-[24px] font-bold">新增進貨單</h1>
      <PurchasingTabs active="receipts" />
      <DocumentForm
        initial={initial}
        basePath="/admin/erp/receipts"
        vendors={vendors}
        warehouses={warehouses}
        items={items}
        serialMode="new"
        saveAction={saveReceiptDraftAction}
        postAction={postReceiptAction}
      />
    </div>
  );
}
