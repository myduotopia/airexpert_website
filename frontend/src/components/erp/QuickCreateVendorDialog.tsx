"use client";
// 建單時就地新增廠商（#218）：頁內 Dialog + 廠商表單（就地新增模式），搜尋字預先帶入代碼或名稱。
import { VendorForm } from "@/app/admin/(protected)/erp/vendors/_components/VendorForm";
import { emptyVendorInput, guessCodeOrName } from "@/lib/erp/quick-create";
import type { VendorOption } from "@/lib/erp/types";
import { ErpDialog } from "./ErpDialog";

export function QuickCreateVendorDialog({
  query,
  onClose,
  onCreated,
}: {
  /** null = 關閉；字串 = 開啟並以此預先帶入。 */
  query: string | null;
  onClose: () => void;
  onCreated: (vendor: VendorOption) => void;
}) {
  return (
    <ErpDialog
      open={query !== null}
      onClose={onClose}
      title="新增廠商"
      description="存檔後自動選取，單據已填內容不變；其他欄位可日後到廠商主檔補。"
      size="lg"
    >
      <VendorForm
        initial={emptyVendorInput(guessCodeOrName(query ?? ""))}
        onSaved={(_, option) => onCreated(option)}
        onCancel={onClose}
      />
    </ErpDialog>
  );
}
