"use client";

import { ActionButton } from "@/components/admin/ActionButton";
import type { ActionResult } from "@/lib/admin/crud";

// 刪除按鈕：確認後呼叫「已 bind 好的」server action（例如 deleteRow.bind(null, "products", id, tags)）。
// 實作共用 ActionButton（pending / 錯誤就地顯示），這裡只固定成「危險動作 + 確認視窗」的樣子。
export function DeleteButton({
  onDelete,
  label = "刪除",
  confirmText = "確定刪除？此動作無法復原。",
}: {
  onDelete: () => Promise<ActionResult>;
  label?: string;
  confirmText?: string;
}) {
  return (
    <ActionButton
      action={onDelete}
      label={label}
      pendingLabel="刪除中…"
      confirmText={confirmText}
      variant="danger"
    />
  );
}
