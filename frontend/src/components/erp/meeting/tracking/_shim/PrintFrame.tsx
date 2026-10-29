"use client";
// ⚠️ 暫代版（#272）：#271 合併後改用 #271 的 A4 橫式列印版型，並刪除本檔。
// 列印模式外框：A4 橫式；列印時只印 .meeting-print-area（後台側欄、工具列皆隱藏）。
// 螢幕上方有「列印」「返回清單」按鈕（列印時隱藏）。
import Link from "next/link";
import type { ReactNode } from "react";

const PRINT_CSS = `
@page { size: A4 landscape; margin: 10mm; }
@media print {
  body * { visibility: hidden; }
  .meeting-print-area, .meeting-print-area * { visibility: visible; }
  .meeting-print-area { position: absolute; left: 0; top: 0; width: 100%; }
  .meeting-print-area * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .meeting-print-area tr { break-inside: avoid; }
  .meeting-print-area thead { display: table-header-group; }
}
`;

const BTN =
  "inline-flex h-9 items-center rounded-lg px-4 text-[14px] font-semibold";

export function PrintFrame({
  title,
  subtitle,
  backHref,
  children,
}: {
  title: string;
  subtitle?: string;
  backHref: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-[1400px]">
      <style>{PRINT_CSS}</style>
      <div className="mb-4 flex items-center justify-end gap-2 print:hidden">
        <Link
          href={backHref}
          className={`${BTN} border-border hover:bg-surface-muted border bg-white`}
        >
          返回清單
        </Link>
        <button
          type="button"
          className={`${BTN} bg-primary hover:bg-primary-deep text-white`}
          onClick={() => window.print()}
        >
          列印
        </button>
      </div>
      <div className="meeting-print-area bg-white">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h1 className="text-ink text-[20px] font-bold">{title}</h1>
          {subtitle && (
            <p className="text-text-muted text-[12px]">{subtitle}</p>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
