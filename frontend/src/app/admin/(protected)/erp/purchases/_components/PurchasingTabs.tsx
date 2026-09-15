import Link from "next/link";

// 採購區頁內 tab（側欄只有一個「採購」項目，spec §6）。
export type PurchasingTab = "purchases" | "receipts" | "purchase-returns";

const TABS: { key: PurchasingTab; label: string; href: string }[] = [
  { key: "purchases", label: "採購單", href: "/admin/erp/purchases" },
  { key: "receipts", label: "進貨單", href: "/admin/erp/receipts" },
  {
    key: "purchase-returns",
    label: "進退單",
    href: "/admin/erp/purchase-returns",
  },
];

export function PurchasingTabs({ active }: { active: PurchasingTab }) {
  return (
    <nav
      className="border-border mb-5 flex gap-1 border-b"
      aria-label="採購單別"
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px inline-flex h-10 items-center border-b-2 px-4 text-[14px] font-semibold ${
              isActive
                ? "border-primary text-primary-deep"
                : "text-text-muted hover:text-ink border-transparent"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
