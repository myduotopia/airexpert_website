"use client";
// 建單時就地新增倉庫（#218）：頁內 Dialog + 倉庫表單（就地新增模式；新倉一律非預設、啟用）。
import { WarehouseForm } from "@/app/admin/(protected)/erp/warehouses/_components/WarehouseForm";
import { emptyWarehouseInput } from "@/lib/erp/quick-create";
import type { WarehouseOption } from "@/lib/erp/types";
import { ErpDialog } from "./ErpDialog";

export function QuickCreateWarehouseDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (warehouse: WarehouseOption) => void;
}) {
  return (
    <ErpDialog
      open={open}
      onClose={onClose}
      title="新增倉庫"
      description="存檔後自動選取，單據已填內容不變。"
      size="md"
    >
      <WarehouseForm
        initial={emptyWarehouseInput()}
        onSaved={(_, option) => onCreated(option)}
        onCancel={onClose}
      />
    </ErpDialog>
  );
}
