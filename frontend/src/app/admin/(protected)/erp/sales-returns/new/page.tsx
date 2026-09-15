// 新增銷退單：先選擇一張已過帳的銷貨單，再帶入可退品項建立草稿。
import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { MoneyText } from "@/components/erp/MoneyText";
import { rocDate } from "@/lib/admin/minguo";
import { listDocuments } from "@/lib/erp/documents";
import { CreateReturnButton } from "../../sales/_components/SalesDocActions";
import { SalesTabs } from "../../sales/_components/SalesTabs";

export const metadata = { title: "新增銷退單 · ERP" };

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function NewSalesReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const q = first(sp.q).slice(0, 100);
  const pageNum = Number.parseInt(first(sp.page), 10);
  const page = Number.isFinite(pageNum) && pageNum > 0 ? pageNum : 1;
  const res = await listDocuments({ docType: "S", status: "posted", q, page });
  const rows = res.ok ? res.data.rows : [];
  const total = res.ok ? res.data.total : 0;
  const pageCount = Math.max(1, Math.ceil(total / 50));
  const href = (p: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs
      ? `/admin/erp/sales-returns/new?${qs}`
      : "/admin/erp/sales-returns/new";
  };

  return (
    <div className="mx-auto max-w-[1040px]">
      <div className="mb-4">
        <h1 className="text-ink text-[24px] font-bold">銷售</h1>
      </div>
      <SalesTabs active="SR" />
      <Link
        href="/admin/erp/sales-returns"
        className="text-text-muted hover:text-ink mb-3 inline-block text-[14px]"
      >
        ← 銷退單列表
      </Link>
      <h2 className="text-ink mb-1 text-[20px] font-bold">新增銷退單</h2>
      <p className="text-text-muted mb-4 text-[14px]">
        選擇要退貨的已過帳銷貨單，系統會帶入尚可退貨的品項與數量。
      </p>

      <form method="get" className="mb-4 flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="搜尋銷貨單號 / 客戶名稱"
          className="border-border focus:border-primary h-10 w-full max-w-[360px] rounded-lg border bg-white px-3 text-[14px] outline-none"
        />
        <button
          type="submit"
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
        >
          查詢
        </button>
      </form>

      {!res.ok && (
        <p className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700">
          {res.error}
        </p>
      )}

      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[640px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              <th className="px-3 py-2 font-medium">銷貨單號</th>
              <th className="px-3 py-2 font-medium">日期</th>
              <th className="px-3 py-2 font-medium">客戶</th>
              <th className="px-3 py-2 text-right font-medium">總計</th>
              <th className="px-3 py-2 text-right font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="text-text-muted px-3 py-8 text-center"
                >
                  沒有符合條件的已過帳銷貨單。
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-border border-t">
                <td className="px-3 py-2">
                  <Link
                    href={`/admin/erp/sales/${r.id}`}
                    className="text-ink hover:text-primary-deep font-mono font-medium"
                  >
                    {r.doc_no}
                  </Link>
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {rocDate(r.doc_date)}
                </td>
                <td className="px-3 py-2">{r.party_name ?? "—"}</td>
                <td className="px-3 py-2 text-right">
                  <MoneyText
                    value={Number(r.total_amount)}
                    currency={r.currency}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <CreateReturnButton saleId={r.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-text-muted mt-3 flex items-center justify-between text-[13px]">
        <span>
          共 {total} 筆，第 {Math.min(page, pageCount)} / {pageCount} 頁
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link
              href={href(page - 1)}
              className="border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 font-semibold"
            >
              上一頁
            </Link>
          )}
          {page < pageCount && (
            <Link
              href={href(page + 1)}
              className="border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border bg-white px-3 font-semibold"
            >
              下一頁
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
