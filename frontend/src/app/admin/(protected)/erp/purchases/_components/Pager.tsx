import Link from "next/link";
import { pageHref, type DocListParams } from "./list-params";

// 列表分頁（每頁 50 筆，spec §6）。
export function Pager({
  basePath,
  params,
  total,
  pageSize,
}: {
  basePath: string;
  params: DocListParams;
  total: number;
  pageSize: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(params.page, pages);
  const btn =
    "border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 text-[13px] font-semibold";
  return (
    <div className="text-text-muted mt-3 flex items-center justify-between text-[13px]">
      <span>
        共 {total} 筆，第 {page} / {pages} 頁
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={pageHref(basePath, params, page - 1)} className={btn}>
            上一頁
          </Link>
        )}
        {page < pages && (
          <Link href={pageHref(basePath, params, page + 1)} className={btn}>
            下一頁
          </Link>
        )}
      </div>
    </div>
  );
}
