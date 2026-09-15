// T / A 表單的下拉選項 — SERVER ONLY。
import "server-only";

import {
  listAvailableSerials,
  listItemOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import type {
  ItemOption,
  SerialOption,
  WarehouseOption,
} from "@/lib/erp/types";

/**
 * 追蹤庫存的品項（啟用中 + 草稿已引用的停用品項）、啟用倉庫、全部在庫機號
 * （client 端依表頭倉庫過濾；草稿已選但狀態改變的機號由 SerialPicker 標示）。
 */
export async function loadStockDocFormOptions(
  referencedItemIds: string[] = [],
): Promise<{
  items: ItemOption[];
  warehouses: WarehouseOption[];
  serials: SerialOption[];
}> {
  const referenced = new Set(referencedItemIds);
  const [allItems, warehouses] = await Promise.all([
    listItemOptions({ includeInactive: referenced.size > 0 }),
    listWarehouseOptions(),
  ]);
  const activeIds =
    referenced.size > 0
      ? new Set((await listItemOptions()).map((i) => i.id))
      : null;
  const items = allItems.filter(
    (i) =>
      i.track_stock &&
      (!activeIds || activeIds.has(i.id) || referenced.has(i.id)),
  );
  const serialItemIds = items.filter((i) => i.track_serial).map((i) => i.id);
  const serials = await listAvailableSerials({
    itemId: serialItemIds,
    status: "in_stock",
  });
  return { items, warehouses, serials };
}
