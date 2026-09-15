import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getServerSupabase } from "@/lib/supabase-server";
import { getItem, itemHasStockActivity } from "@/lib/erp/queries/master-data";
import { listVendorOptions } from "@/lib/erp/queries/pickers";
import { ItemForm } from "../../_components/ItemForm";
import { MasterTabs } from "../../_components/master-ui";

export const metadata = { title: "編輯品項 · ERP 基本資料" };

export default async function EditItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  await requireModule("erp");
  const { itemId } = await params;
  const item = await getItem(itemId);
  if (!item) notFound();
  const supabase = await getServerSupabase();
  const [vendors, hasStockActivity] = await Promise.all([
    // 含停用：既有預設廠商若已停用仍要顯示得出來。
    listVendorOptions({ includeInactive: true }),
    itemHasStockActivity(supabase, itemId),
  ]);

  return (
    <div className="mx-auto max-w-[900px]">
      <MasterTabs active="items" />
      <h1 className="text-ink mb-6 text-[24px] font-bold">編輯品項</h1>
      <ItemForm
        itemId={itemId}
        vendors={vendors}
        hasStockActivity={hasStockActivity}
        initial={{
          code: item.code,
          name: item.name,
          kind: item.kind,
          unit: item.unit,
          track_stock: item.track_stock,
          track_serial: item.track_serial,
          mx_card_type: item.mx_card_type,
          brand: item.brand ?? "",
          model: item.model ?? "",
          sale_price: item.sale_price,
          purchase_price: item.purchase_price,
          safety_stock: Number(item.safety_stock) || 0,
          default_vendor_id: item.default_vendor_id,
          active: item.active,
          note: item.note ?? "",
        }}
      />
    </div>
  );
}
