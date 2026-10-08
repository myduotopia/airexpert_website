"use client";
// 建單時就地新增客戶（#218）：頁內 Dialog + 客戶表單（就地新增模式），搜尋字預先帶入編號或名稱。
import { CustomerForm } from "@/app/admin/(protected)/erp/customers/_components/CustomerForm";
import { emptyCustomerInput, guessCodeOrName } from "@/lib/erp/quick-create";
import type { CustomerOption } from "@/lib/erp/types";
import { ErpDialog } from "./ErpDialog";

export function QuickCreateCustomerDialog({
  query,
  onClose,
  onCreated,
}: {
  /** null = 關閉；字串 = 開啟並以此預先帶入。 */
  query: string | null;
  onClose: () => void;
  onCreated: (customer: CustomerOption) => void;
}) {
  return (
    <ErpDialog
      open={query !== null}
      onClose={onClose}
      title="新增客戶"
      description="存檔後自動選取，單據已填內容不變；其他欄位可日後到客戶主檔補。"
      size="lg"
    >
      <CustomerForm
        initial={emptyCustomerInput(guessCodeOrName(query ?? ""))}
        onSaved={(_, option) => onCreated(option)}
        onCancel={onClose}
      />
    </ErpDialog>
  );
}
