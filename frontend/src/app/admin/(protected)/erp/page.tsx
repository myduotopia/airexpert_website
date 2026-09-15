import Link from "next/link";
import type { ReactNode } from "react";
import { MoneyText } from "@/components/erp/MoneyText";
import { requireModule } from "@/lib/admin/auth";
import { rocDate } from "@/lib/admin/minguo";
import { getOverviewData } from "@/lib/erp/queries/reports";
import { paymentHref, percentValue } from "@/lib/erp/reports";

export const metadata = { title: "ERP 總覽 · 後台" };

const QUICK_LINKS: { label: string; href: string }[] = [
  { label: "採購", href: "/admin/erp/purchases" },
  { label: "進貨", href: "/admin/erp/receipts" },
  { label: "庫存", href: "/admin/erp/inventory" },
  { label: "收款", href: "/admin/erp/collections" },
  { label: "付款", href: "/admin/erp/disbursements" },
  { label: "對帳單", href: "/admin/erp/statements" },
  { label: "報表", href: "/admin/erp/reports" },
  { label: "基本資料", href: "/admin/erp/items" },
];

function Card({
  title,
  href,
  children,
  sub,
}: {
  title: string;
  href: string;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <Link
      href={href}
      className="border-border hover:border-primary block rounded-xl border bg-white p-4 transition-colors"
    >
      <p className="text-text-muted text-[13px]">{title}</p>
      <p className="text-ink mt-1 text-[24px] font-bold">{children}</p>
      {sub && <p className="text-text-muted mt-1 text-[12px]">{sub}</p>}
    </Link>
  );
}

export default async function ErpOverviewPage() {
  // layout 已守門；page 與 layout 平行 render，保險起見再檢查一次（cache 去重，不多查）。
  await requireModule("erp");
  const res = await getOverviewData();

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-ink text-[24px] font-bold">ERP 總覽</h1>
      <p className="text-text-muted mt-1 mb-5 text-[14px]">
        本月銷售、應收應付、低庫存與近期到期支票。金額皆為新台幣。
      </p>

      {!res.ok ? (
        <p role="alert" className="text-[14px] text-red-600">
          {res.error}
        </p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Card
              title="本月銷貨額（未稅）"
              href={`/admin/erp/reports?tab=margin&from=${res.data.month.from}&to=${res.data.month.to}`}
              sub={`${rocDate(res.data.month.from)} 起，銷貨 − 銷退`}
            >
              <MoneyText value={res.data.monthRevenue} negativeRed />
            </Card>
            <Card
              title="本月毛利"
              href={`/admin/erp/reports?tab=margin&from=${res.data.month.from}&to=${res.data.month.to}`}
              sub={(() => {
                const p = percentValue(res.data.monthMarginRate);
                return p === null ? "毛利率 —" : `毛利率 ${p.toFixed(1)}%`;
              })()}
            >
              <MoneyText value={res.data.monthMargin} negativeRed />
            </Card>
            <Card
              title="應收總額"
              href="/admin/erp/reports?tab=ar"
              sub={
                <>
                  未沖銷預收 <MoneyText value={res.data.advanceReceived} />
                </>
              }
            >
              <MoneyText value={res.data.arTotal} negativeRed />
            </Card>
            <Card
              title="應付總額"
              href="/admin/erp/reports?tab=ap"
              sub={
                <>
                  未沖銷預付 <MoneyText value={res.data.advancePaid} />
                </>
              }
            >
              <MoneyText value={res.data.apTotal} negativeRed />
            </Card>
            <Card
              title="低庫存品項"
              href="/admin/erp/inventory?low=1"
              sub="各倉合計低於安全存量"
            >
              <span
                className={
                  res.data.lowStockCount > 0 ? "text-red-600" : undefined
                }
              >
                {res.data.lowStockCount}
              </span>
            </Card>
          </div>

          <section className="mt-8">
            <h2 className="text-ink mb-2 text-[18px] font-bold">
              7 日內到期支票
            </h2>
            <div className="border-border overflow-x-auto rounded-xl border bg-white">
              <table className="w-full min-w-[720px] text-[14px]">
                <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
                  <tr>
                    <th className="px-3 py-2 font-medium">到期日</th>
                    <th className="px-3 py-2 font-medium">類別</th>
                    <th className="px-3 py-2 font-medium">單號</th>
                    <th className="px-3 py-2 font-medium">對象</th>
                    <th className="px-3 py-2 font-medium">票號</th>
                    <th className="px-3 py-2 font-medium">銀行</th>
                    <th className="px-3 py-2 text-right font-medium">金額</th>
                  </tr>
                </thead>
                <tbody>
                  {res.data.checksDue.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-text-muted px-3 py-8 text-center"
                      >
                        {rocDate(res.data.today)} 起 7
                        日內沒有未兌現的到期支票。
                      </td>
                    </tr>
                  )}
                  {res.data.checksDue.map((c) => (
                    <tr key={c.id} className="border-border border-t">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {rocDate(c.check_due_date)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {c.direction === "in" ? "收票" : "開票"}
                      </td>
                      <td className="px-3 py-2 font-mono text-[13px]">
                        <Link
                          href={paymentHref(c)}
                          className="text-ink hover:text-primary-deep"
                        >
                          {c.doc_no ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{c.party_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[13px]">
                        {c.check_no ?? "—"}
                      </td>
                      <td className="px-3 py-2">{c.bank ?? "—"}</td>
                      <td className="px-3 py-2 text-right">
                        <MoneyText value={c.amount} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <section className="mt-8">
        <h2 className="text-ink mb-2 text-[18px] font-bold">快速連結</h2>
        <div className="flex flex-wrap gap-2">
          {QUICK_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
