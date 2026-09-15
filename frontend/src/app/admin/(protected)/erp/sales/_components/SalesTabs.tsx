// 銷售區段頁內 tab：報價單／銷貨單／銷退單（spec §6：側欄只放「銷售」，子單別以 tab 切換）。
import Link from "next/link";
import type { SalesDocType } from "@/lib/erp/queries/sales";
import { SALES_BASE_PATH, SALES_DOC_LABEL, SALES_TABS } from "./sales-config";

export function SalesTabs({ active }: { active: SalesDocType }) {
  return (
    <nav
      className="border-border mb-4 flex gap-1 border-b"
      aria-label="銷售單別"
    >
      {SALES_TABS.map((t) => {
        const isActive = t === active;
        return (
          <Link
            key={t}
            href={SALES_BASE_PATH[t]}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px inline-flex h-10 items-center border-b-2 px-4 text-[14px] font-semibold ${
              isActive
                ? "border-primary text-primary-deep"
                : "text-text-muted hover:text-ink border-transparent"
            }`}
          >
            {SALES_DOC_LABEL[t]}
          </Link>
        );
      })}
    </nav>
  );
}
