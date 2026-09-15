import Link from "next/link";
import { MoneyText } from "@/components/erp/MoneyText";
import { requireModule } from "@/lib/admin/auth";
import { rocDate } from "@/lib/admin/minguo";
import { getStatementData } from "@/lib/erp/queries/ar-ap";
import {
  listCustomerOptions,
  listVendorOptions,
} from "@/lib/erp/queries/pickers";
import {
  isIsoDate,
  parseStatementParty,
  previousMonthRange,
  statementPrintHref,
  taipeiToday,
} from "@/lib/erp/statement";
import { StatementFilter } from "./_components/StatementFilter";

export const metadata = { title: "對帳單 · ERP · 後台" };

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function StatementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const party = parseStatementParty(one(sp.party));
  const def = previousMonthRange(taipeiToday());
  const from = isIsoDate(one(sp.from)) ? one(sp.from) : def.from;
  const to = isIsoDate(one(sp.to)) ? one(sp.to) : def.to;

  const [customers, vendors, result] = await Promise.all([
    listCustomerOptions({ includeInactive: true }),
    listVendorOptions({ includeInactive: true }),
    party ? getStatementData({ party, from, to }) : Promise.resolve(null),
  ]);

  const isVendor = party?.type === "vendor";
  const balanceLabel = isVendor ? "應付餘額" : "應收餘額";

  return (
    <div className="mx-auto max-w-[1040px]">
      <h1 className="text-ink text-[24px] font-bold">對帳單</h1>
      <p className="text-text-muted mt-1 mb-4 text-[14px]">
        選擇客戶或廠商與期間（預設上個月），預覽期初、本期單據與收付款逐列累計、期末餘額。作廢單據不列入。
      </p>

      <StatementFilter
        key={`${party?.type ?? ""}:${party?.id ?? ""}|${from}|${to}`}
        customers={customers}
        vendors={vendors}
        initial={{
          type: party?.type ?? "customer",
          id: party?.id ?? null,
          from,
          to,
        }}
      />

      {one(sp.party) && !party && (
        <p role="alert" className="mt-4 text-[14px] text-red-600">
          對象參數不正確，請重新選擇。
        </p>
      )}

      {result && !result.ok && (
        <p role="alert" className="mt-4 text-[14px] text-red-600">
          {result.error}
        </p>
      )}
      {result?.ok && !result.data && (
        <p role="alert" className="mt-4 text-[14px] text-red-600">
          找不到所選{isVendor ? "廠商" : "客戶"}。
        </p>
      )}

      {party && result?.ok && result.data && (
        <section className="mt-6">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-ink text-[18px] font-bold">
                {result.data.party.code && (
                  <span className="font-mono">{result.data.party.code} </span>
                )}
                {result.data.party.name}
              </h2>
              <p className="text-text-muted text-[13px]">
                {isVendor ? "廠商" : "客戶"}對帳單　{rocDate(from)} ～{" "}
                {rocDate(to)}
              </p>
            </div>
            <Link
              href={statementPrintHref(party, from, to)}
              target="_blank"
              className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold"
            >
              列印
            </Link>
          </div>

          <div className="border-border overflow-x-auto rounded-xl border bg-white">
            <table className="w-full border-collapse text-left text-[14px]">
              <thead>
                <tr className="border-border text-text-muted border-b">
                  <th className="px-4 py-3 font-medium">日期</th>
                  <th className="px-4 py-3 font-medium">單號</th>
                  <th className="px-4 py-3 font-medium">摘要</th>
                  <th className="px-4 py-3 text-right font-medium">
                    {isVendor ? "進貨金額" : "銷貨金額"}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {isVendor ? "付款金額" : "收款金額"}
                  </th>
                  <th className="px-4 py-3 text-right font-medium">
                    {balanceLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-border bg-surface-muted/50 border-b">
                  <td className="px-4 py-3" colSpan={5}>
                    期初餘額
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    <MoneyText
                      value={result.data.statement.opening}
                      negativeRed
                    />
                  </td>
                </tr>
                {result.data.statement.rows.length === 0 ? (
                  <tr className="border-border border-b">
                    <td
                      colSpan={6}
                      className="text-text-muted px-4 py-8 text-center"
                    >
                      本期沒有單據或收付款。
                    </td>
                  </tr>
                ) : (
                  result.data.statement.rows.map((r) => (
                    <tr
                      key={`${r.kind}-${r.id}`}
                      className="border-border border-b"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        {rocDate(r.date)}
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px]">
                        {r.doc_no ?? "—"}
                      </td>
                      <td className="px-4 py-3">{r.description}</td>
                      <td className="px-4 py-3 text-right">
                        {r.charge !== null ? (
                          <MoneyText value={r.charge} negativeRed />
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {r.payment !== null ? (
                          <MoneyText value={r.payment} />
                        ) : (
                          ""
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <MoneyText value={r.balance} negativeRed />
                      </td>
                    </tr>
                  ))
                )}
                <tr className="border-border border-b">
                  <td className="text-text-muted px-4 py-3" colSpan={3}>
                    本期合計
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MoneyText
                      value={result.data.statement.documentsTotal}
                      negativeRed
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <MoneyText value={result.data.statement.paymentsTotal} />
                  </td>
                  <td />
                </tr>
                <tr className="bg-surface-muted/50">
                  <td className="px-4 py-3 font-semibold" colSpan={5}>
                    期末餘額
                  </td>
                  <td className="px-4 py-3 text-right text-[16px] font-bold">
                    <MoneyText
                      value={result.data.statement.closing}
                      negativeRed
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-text-muted mt-2 text-[12px]">
            期末餘額為負數表示{isVendor ? "預付" : "預收"}大於未結單據。
          </p>
        </section>
      )}
    </div>
  );
}
