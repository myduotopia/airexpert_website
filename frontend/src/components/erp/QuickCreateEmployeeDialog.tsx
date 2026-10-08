"use client";
// 就地新增員工（#223）：頁內 Dialog + 員工表單（就地新增模式），搜尋字預先帶入姓名或代號、
// 角色預設為欄位用途（業務欄 → 業務；維護人員欄 → 維修師傅）。
import { EmployeeForm } from "@/app/admin/(protected)/employees/_components/EmployeeForm";
import { emptyEmployeeInput } from "@/lib/employees/normalize";
import type { EmployeeOption, EmployeeRole } from "@/lib/employees/types";
import { guessCodeOrName } from "@/lib/erp/quick-create";
import { ErpDialog } from "./ErpDialog";

export function QuickCreateEmployeeDialog({
  query,
  role,
  onClose,
  onCreated,
}: {
  /** null = 關閉；字串 = 開啟並以此預先帶入。 */
  query: string | null;
  /** 預設勾選的角色。 */
  role?: EmployeeRole;
  onClose: () => void;
  onCreated: (employee: EmployeeOption) => void;
}) {
  return (
    <ErpDialog
      open={query !== null}
      onClose={onClose}
      title="新增員工"
      description="存檔後自動選取，目前頁面已填內容不變；代號等資料可日後到員工主檔補。"
      size="md"
    >
      <EmployeeForm
        initial={emptyEmployeeInput({
          ...guessCodeOrName(query ?? ""),
          roles: role ? [role] : [],
        })}
        onSaved={(_, option) => onCreated(option)}
        onCancel={onClose}
      />
    </ErpDialog>
  );
}
