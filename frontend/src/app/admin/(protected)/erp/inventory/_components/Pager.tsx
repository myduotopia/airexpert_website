// 分頁連結（server component）。
import Link from "next/link";
import { withParams } from "../_lib/params";

export function Pager({
  base,
  params,
  page,
  pageSize,
  total,
}: {
  base: string;
  /** 目前的篩選參數（不含 page）。 */
  params: Record<string, string | number | null | undefined | false>;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const link =
    "border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 text-[13px] font-semibold";
  return (
    <div className="text-text-muted mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px]">
      <span>
        共 {total} 筆，第 {Math.min(page, pages)} / {pages} 頁
      </span>
      <span className="flex gap-2">
        {page > 1 && (
          <Link
            href={withParams(base, { ...params, page: page - 1 })}
            className={link}
          >
            上一頁
          </Link>
        )}
        {page < pages && (
          <Link
            href={withParams(base, { ...params, page: page + 1 })}
            className={link}
          >
            下一頁
          </Link>
        )}
      </span>
    </div>
  );
}
