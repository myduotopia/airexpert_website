// ERP 列印頁（#178）的補充查詢 — SERVER ONLY。
// 單據表頭 / 明細由 getDocumentWithLines 讀取；此處補上列印需要、但快照沒有的欄位：
// 品項編號與單位、倉庫名稱、客戶編號、廠商編號與傳真。讀取走登入者 session（RLS）。
import "server-only";

import { getServerSupabase } from "@/lib/supabase-server";
import { erpErrorMessage } from "../errors";
import type { PrintItemInfo } from "../print";
import type { ErpDocumentWithLines, ErpResult } from "../types";

export interface DocumentPrintContext {
  items: Map<string, PrintItemInfo>;
  warehouses: Map<string, { code: string; name: string }>;
  customerCode: string | null;
  vendor: { code: string; fax: string | null } | null;
}

export async function getDocumentPrintContext(
  doc: ErpDocumentWithLines,
): Promise<ErpResult<DocumentPrintContext>> {
  const supabase = await getServerSupabase();
  const itemIds = [
    ...new Set(doc.lines.map((l) => l.item_id).filter((v): v is string => !!v)),
  ];
  const warehouseIds = [doc.warehouse_id, doc.to_warehouse_id].filter(
    (v): v is string => !!v,
  );

  const [items, warehouses, customer, vendor] = await Promise.all([
    itemIds.length
      ? supabase
          .from("erp_items")
          .select("id, code, name, unit")
          .in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    warehouseIds.length
      ? supabase
          .from("erp_warehouses")
          .select("id, code, name")
          .in("id", warehouseIds)
      : Promise.resolve({ data: [], error: null }),
    doc.customer_id
      ? supabase
          .from("mx_customers")
          .select("code")
          .eq("id", doc.customer_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    doc.vendor_id
      ? supabase
          .from("erp_vendors")
          .select("code, fax")
          .eq("id", doc.vendor_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  const failed = [items, warehouses, customer, vendor].find((r) => r.error);
  if (failed?.error) return { ok: false, error: erpErrorMessage(failed.error) };

  return {
    ok: true,
    data: {
      items: new Map(
        ((items.data ?? []) as (PrintItemInfo & { id: string })[]).map((i) => [
          i.id,
          { code: i.code, name: i.name, unit: i.unit },
        ]),
      ),
      warehouses: new Map(
        (
          (warehouses.data ?? []) as {
            id: string;
            code: string;
            name: string;
          }[]
        ).map((w) => [w.id, { code: w.code, name: w.name }]),
      ),
      customerCode:
        (customer.data as { code: string | null } | null)?.code ?? null,
      vendor:
        (vendor.data as { code: string; fax: string | null } | null) ?? null,
    },
  };
}
