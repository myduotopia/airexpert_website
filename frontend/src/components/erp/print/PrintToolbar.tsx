"use client";

// 列印頁上方工具列（僅螢幕顯示；@media print 隱藏）：「返回」與「列印」（window.print）。
// 列印頁多由詳情頁以新分頁開啟（無上一頁），此時「返回」改導向 backHref。
import { useRouter } from "next/navigation";

const BTN =
  "inline-flex h-9 items-center rounded-lg px-4 text-[14px] font-semibold";

export function PrintToolbar({
  title,
  backHref,
}: {
  title: string;
  backHref: string;
}) {
  const router = useRouter();
  return (
    <div className="erp-print-toolbar border-border flex items-center justify-between gap-3 border-b bg-white px-4 py-2 shadow-sm">
      <span className="text-ink truncate text-[14px] font-semibold">
        {title}
      </span>
      <div className="flex shrink-0 gap-2">
        <button
          type="button"
          className={`${BTN} border-border hover:bg-surface-muted border bg-white`}
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push(backHref);
          }}
        >
          返回
        </button>
        <button
          type="button"
          className={`${BTN} bg-primary hover:bg-primary-deep text-white`}
          onClick={() => window.print()}
        >
          列印
        </button>
      </div>
    </div>
  );
}
