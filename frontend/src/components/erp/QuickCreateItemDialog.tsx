"use client";
// 建單時就地新增品項（#218）：頁內 Dialog + 品項表單（就地新增模式），搜尋字預先帶入產品編號或品名。
import { ItemForm } from "@/app/admin/(protected)/erp/items/_components/ItemForm";
import { defaultItemInput } from "@/app/admin/(protected)/erp/items/_lib/rules";
import { guessCodeOrName } from "@/lib/erp/quick-create";
import type { ItemOption } from "@/lib/erp/types";
import { ErpDialog } from "./ErpDialog";

export function QuickCreateItemDialog({
  query,
  onClose,
  onCreated,
}: {
  /** null = 關閉；字串 = 開啟並以此預先帶入。 */
  query: string | null;
  onClose: () => void;
  onCreated: (item: ItemOption) => void;
}) {
  return (
    <ErpDialog
      open={query !== null}
      onClose={onClose}
      title="新增品項"
      description="存檔後自動帶入此明細行，單據已填內容不變；預設廠商、安全存量可日後到品項主檔補。"
      size="lg"
    >
      <ItemForm
        initial={{
          ...defaultItemInput("part"),
          ...guessCodeOrName(query ?? ""),
        }}
        onSaved={(_, option) => onCreated(option)}
        onCancel={onClose}
      />
    </ErpDialog>
  );
}
