import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getServerSupabase } from "@/lib/supabase-server";
import { getWarehouse, warehouseInUse } from "@/lib/erp/queries/master-data";
import { MasterTabs } from "../../../items/_components/master-ui";
import { ConfirmDeleteButton } from "../../../items/_components/ConfirmDeleteButton";
import { WarehouseForm } from "../../_components/WarehouseForm";
import { deleteWarehouseAction } from "../../actions";

export const metadata = { title: "編輯倉庫 · ERP 基本資料" };

export default async function EditWarehousePage({
  params,
}: {
  params: Promise<{ warehouseId: string }>;
}) {
  await requireModule("erp");
  const { warehouseId } = await params;
  const wh = await getWarehouse(warehouseId);
  if (!wh) notFound();
  const inUse = await warehouseInUse(await getServerSupabase(), warehouseId);

  return (
    <div className="mx-auto max-w-[800px]">
      <MasterTabs active="warehouses" />
      <h1 className="text-ink mb-6 text-[24px] font-bold">
        編輯倉庫
        <span className="text-text-muted ml-2 font-mono text-[16px] font-normal">
          {wh.code}
        </span>
      </h1>
      <WarehouseForm
        warehouseId={warehouseId}
        initial={{
          code: wh.code,
          name: wh.name,
          is_default: wh.is_default,
          active: wh.active,
          note: wh.note ?? "",
        }}
      />

      <section className="border-border mt-10 rounded-xl border bg-white p-5">
        <h2 className="text-ink text-[16px] font-bold">刪除倉庫</h2>
        {wh.is_default ? (
          <p className="text-text-muted mt-1 text-[14px]">
            預設倉不可刪除；請先將其他倉庫設為預設。
          </p>
        ) : inUse ? (
          <p className="text-text-muted mt-1 text-[14px]">
            此倉庫已有庫存或異動，不能刪除，只能取消勾選「啟用」停用。
          </p>
        ) : (
          <>
            <p className="text-text-muted mt-1 mb-3 text-[14px]">
              此倉庫尚無庫存與異動，可以刪除。
            </p>
            <ConfirmDeleteButton
              id={warehouseId}
              action={deleteWarehouseAction}
              confirmText={`確定刪除倉庫「${wh.code} ${wh.name}」？`}
              redirectTo="/admin/erp/warehouses"
            />
          </>
        )}
      </section>
    </div>
  );
}
