import Link from "next/link";
import type { PaymentDirection } from "@/lib/erp/types";
import { DIRECTION_META } from "./allocation";

// 收款 / 付款頁內 tab（側欄只有「收付款」一項）。
export function PaymentTabs({ active }: { active: PaymentDirection }) {
  return (
    <nav className="border-border mb-4 flex gap-1 border-b" aria-label="收付款">
      {(["in", "out"] as const).map((d) => {
        const on = d === active;
        return (
          <Link
            key={d}
            href={DIRECTION_META[d].basePath}
            aria-current={on ? "page" : undefined}
            className={`-mb-px inline-flex h-10 items-center border-b-2 px-4 text-[14px] font-semibold ${
              on
                ? "border-primary text-primary-deep"
                : "text-text-muted hover:text-ink border-transparent"
            }`}
          >
            {DIRECTION_META[d].label}
          </Link>
        );
      })}
    </nav>
  );
}
