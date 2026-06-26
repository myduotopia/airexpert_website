// 管理者預覽橫幅（#89）：當內容尚未公開（隱藏），但以登入的 admin 身分預覽時顯示。
// 黏在頁面頂端的提示列，amber 色系，提醒「此內容一般訪客看不到」。
// 純 server component（無互動）。
import { EyeOff } from "lucide-react";

export function PreviewBanner() {
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-300 bg-amber-100 px-6 py-2.5 text-center text-[14px] font-medium text-amber-900"
    >
      <EyeOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      此內容尚未公開，僅管理者可預覽
    </div>
  );
}
