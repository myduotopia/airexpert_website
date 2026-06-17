import Link from "next/link";
import { CASE_CATEGORIES, CASE_FILTER_ALL } from "./constants";

// 分類 pills，對應設計稿 FilterRow（node R09KFm）。
// 以 query string ?category= 切換；server component 讀 searchParams 後重新查資料，
// 無需 client JS。active pill = 主綠底白字，其餘 = 白底邊線。
export function FilterRow({ active }: { active: string }) {
  const items = [CASE_FILTER_ALL, ...CASE_CATEGORIES];
  return (
    <nav aria-label="實績分類" className="flex flex-wrap items-center gap-2.5">
      {items.map((cat) => {
        const isActive = cat === active;
        const href =
          cat === CASE_FILTER_ALL
            ? "/cases"
            : `/cases?category=${encodeURIComponent(cat)}`;
        return (
          <Link
            key={cat}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`inline-flex items-center rounded-[20px] border px-4 py-2 text-[13px] font-medium transition-colors ${
              isActive
                ? "border-primary bg-primary text-white"
                : "border-border text-text-muted hover:border-primary hover:text-primary-deep bg-white"
            }`}
          >
            {cat}
          </Link>
        );
      })}
    </nav>
  );
}
