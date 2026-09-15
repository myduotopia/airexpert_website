import Link from "next/link";
import { MoneyText } from "@/components/erp/MoneyText";
import { requireModule } from "@/lib/admin/auth";
import { rocDate } from "@/lib/admin/minguo";
import { formatQty } from "@/lib/erp/format";
import {
  getAgingReport,
  getSalesMarginReport,
} from "@/lib/erp/queries/reports";
import {
  AGING_BUCKETS,
  AGING_BUCKET_LABEL,
  SALES_GROUP_BY,
  currentMonthRange,
  percentValue,
  type SalesGroupBy,
} from "@/lib/erp/reports";
import { isIsoDate, taipeiToday } from "@/lib/erp/statement";
import { CsvExportButton } from "./_components/CsvExportButton";
import { ReportFilter } from "./_components/ReportFilter";

export const metadata = { title: "報表 · ERP · 後台" };

type Tab = "margin" | "ar" | "ap";
const TABS: { key: Tab; label: string }[] = [
  { key: "margin", label: "銷售毛利" },
  { key: "ar", label: "應收帳齡" },
  { key: "ap", label: "應付總表" },
];

const GROUP_LABEL: Record<SalesGroupBy, string> = {
  customer: "客戶",
  item: "品項",
  sales_rep: "業務",
};

const TH = "px-3 py-2 font-medium whitespace-nowrap";
const TD = "px-3 py-2 align-top";
const NUM = `${TD} text-right tabular-nums whitespace-nowrap`;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

function Percent({ rate }: { rate: number | null }) {
  const v = percentValue(rate);
  if (v === null) return <span className="text-text-muted">—</span>;
  return (
    <span className={`tabular-nums ${v < 0 ? "text-red-600" : ""}`}>
      {v.toFixed(1)}%
    </span>
  );
}

export default async function ErpReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const tabParam = one(sp.tab);
  const tab: Tab = tabParam === "ar" || tabParam === "ap" ? tabParam : "margin";
  const today = taipeiToday();
  const month = currentMonthRange(today);
  const from = isIsoDate(one(sp.from)) ? one(sp.from) : month.from;
  const to = isIsoDate(one(sp.to)) ? one(sp.to) : month.to;
  const groupParam = one(sp.group) as SalesGroupBy;
  const group: SalesGroupBy = SALES_GROUP_BY.includes(groupParam)
    ? groupParam
    : "customer";
  const asOf = isIsoDate(one(sp.asOf)) ? one(sp.asOf) : today;

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-ink text-[24px] font-bold">報表</h1>
      <p className="text-text-muted mt-1 mb-4 text-[14px]">
        銷售毛利、應收帳齡與應付總表，金額皆為新台幣；可匯出 CSV（Excel
        可直接開啟）。
      </p>

      <nav
        className="border-border mb-5 flex gap-1 overflow-x-auto border-b"
        aria-label="報表類型"
      >
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/admin/erp/reports?tab=${t.key}`}
              aria-current={active ? "page" : undefined}
              className={`-mb-px inline-flex h-10 shrink-0 items-center border-b-2 px-4 text-[14px] font-semibold ${
                active
                  ? "border-primary text-primary-deep"
                  : "text-text-muted hover:text-ink border-transparent"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      <ReportFilter
        key={`${tab}|${from}|${to}|${group}|${asOf}`}
        tab={tab}
        initial={{ from, to, group, asOf }}
      />

      {tab === "margin" ? (
        <MarginSection from={from} to={to} group={group} />
      ) : (
        <AgingSection tab={tab} asOf={asOf} />
      )}
    </div>
  );
}

async function MarginSection({
  from,
  to,
  group,
}: {
  from: string;
  to: string;
  group: SalesGroupBy;
}) {
  if (from > to) {
    return (
      <p role="alert" className="mt-4 text-[14px] text-red-600">
        起日不可晚於迄日。
      </p>
    );
  }
  const res = await getSalesMarginReport({ from, to, groupBy: group });
  if (!res.ok) {
    return (
      <p role="alert" className="mt-4 text-[14px] text-red-600">
        {res.error}
      </p>
    );
  }
  const { rows, totals, documentCount } = res.data;
  const showCode = group !== "sales_rep";

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p className="text-text-muted text-[13px]">
          {rocDate(from)} ～ {rocDate(to)}　依{GROUP_LABEL[group]}
          彙總　已過帳銷貨／銷退單 {documentCount} 張
        </p>
        <CsvExportButton input={{ tab: "margin", from, to, group }} />
      </div>
      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[760px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              {showCode && (
                <th className={TH}>{group === "item" ? "代碼" : "編號"}</th>
              )}
              <th className={TH}>{GROUP_LABEL[group]}</th>
              <th className={`${TH} text-right`}>數量</th>
              <th className={`${TH} text-right`}>未稅銷售額</th>
              <th className={`${TH} text-right`}>成本</th>
              <th className={`${TH} text-right`}>毛利</th>
              <th className={`${TH} text-right`}>毛利率</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={showCode ? 7 : 6}
                  className="text-text-muted px-3 py-8 text-center"
                >
                  期間內沒有已過帳的銷貨或銷退單。
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.key ?? "__null"} className="border-border border-t">
                {showCode && (
                  <td className={`${TD} font-mono text-[13px]`}>
                    {r.code ?? "—"}
                  </td>
                )}
                <td className={TD}>{r.label}</td>
                <td className={NUM}>
                  {formatQty(r.qty)}
                  {r.unit ? ` ${r.unit}` : ""}
                </td>
                <td className={NUM}>
                  <MoneyText value={r.revenue} negativeRed />
                </td>
                <td className={NUM}>
                  <MoneyText value={r.cost} negativeRed />
                </td>
                <td className={NUM}>
                  <MoneyText value={r.margin} negativeRed />
                </td>
                <td className={NUM}>
                  <Percent rate={r.marginRate} />
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-border bg-surface-muted/50 border-t font-semibold">
                <td className={TD} colSpan={showCode ? 2 : 1}>
                  合計
                </td>
                <td className={NUM}>
                  {group === "item" ? formatQty(totals.qty) : ""}
                </td>
                <td className={NUM}>
                  <MoneyText value={totals.revenue} negativeRed />
                </td>
                <td className={NUM}>
                  <MoneyText value={totals.cost} negativeRed />
                </td>
                <td className={NUM}>
                  <MoneyText value={totals.margin} negativeRed />
                </td>
                <td className={NUM}>
                  <Percent rate={totals.marginRate} />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-text-muted mt-2 text-[12px]">
        已過帳銷貨減銷退，作廢與草稿不計。內含稅單據以單據未稅額計，外幣依單據匯率換算新台幣。
        折扣行歸入所屬單據的客戶／業務；依品項彙總時折扣依該單各品項金額比例分攤（無品項可分攤者列「未分攤折扣」）。
        成本 = 數量 × 過帳成本（服務、費用等不追蹤庫存品項成本為 0）。
      </p>
    </section>
  );
}

async function AgingSection({ tab, asOf }: { tab: "ar" | "ap"; asOf: string }) {
  const isAr = tab === "ar";
  const res = await getAgingReport({
    partyType: isAr ? "customer" : "vendor",
    asOf,
  });
  if (!res.ok) {
    return (
      <p role="alert" className="mt-4 text-[14px] text-red-600">
        {res.error}
      </p>
    );
  }
  const { rows, totals } = res.data;
  const partyLabel = isAr ? "客戶" : "廠商";
  const advanceLabel = isAr ? "預收" : "預付";

  return (
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <p className="text-text-muted text-[13px]">
          帳齡基準日 {rocDate(asOf)}　共 {rows.length} 個{partyLabel}
        </p>
        <CsvExportButton input={{ tab, asOf }} />
      </div>
      <div className="border-border overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[900px] text-[14px]">
          <thead className="bg-surface-muted text-text-muted text-left text-[13px]">
            <tr>
              <th className={TH}>編號</th>
              <th className={TH}>{partyLabel}</th>
              {AGING_BUCKETS.map((b) => (
                <th key={b} className={`${TH} text-right`}>
                  {AGING_BUCKET_LABEL[b]}
                </th>
              ))}
              <th className={`${TH} text-right`}>
                {isAr ? "應收合計" : "應付合計"}
              </th>
              <th className={`${TH} text-right`}>{advanceLabel}</th>
              <th className={`${TH} text-right`}>淨額</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={9}
                  className="text-text-muted px-3 py-8 text-center"
                >
                  沒有未沖銷的{isAr ? "應收" : "應付"}或{advanceLabel}款。
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.party_id} className="border-border border-t">
                <td className={`${TD} font-mono text-[13px]`}>
                  {r.code ?? "—"}
                </td>
                <td className={TD}>
                  <Link
                    href={`/admin/erp/statements?party=${isAr ? "customer" : "vendor"}:${r.party_id}`}
                    className="text-ink hover:text-primary-deep"
                  >
                    {r.name}
                  </Link>
                </td>
                {AGING_BUCKETS.map((b) => (
                  <td
                    key={b}
                    className={`${NUM} ${b === "d90p" && r.buckets[b] > 0 ? "font-semibold text-red-600" : ""}`}
                  >
                    {r.buckets[b] === 0 ? (
                      <span className="text-text-muted">0</span>
                    ) : (
                      <MoneyText value={r.buckets[b]} negativeRed />
                    )}
                  </td>
                ))}
                <td className={`${NUM} font-semibold`}>
                  <MoneyText value={r.outstanding} negativeRed />
                </td>
                <td className={NUM}>
                  <MoneyText value={r.unallocated} />
                </td>
                <td className={`${NUM} font-semibold`}>
                  <MoneyText value={r.net} negativeRed />
                </td>
              </tr>
            ))}
            {rows.length > 0 && (
              <tr className="border-border bg-surface-muted/50 border-t font-semibold">
                <td className={TD} colSpan={2}>
                  合計
                </td>
                {AGING_BUCKETS.map((b) => (
                  <td key={b} className={NUM}>
                    <MoneyText value={totals.buckets[b]} negativeRed />
                  </td>
                ))}
                <td className={NUM}>
                  <MoneyText value={totals.outstanding} negativeRed />
                </td>
                <td className={NUM}>
                  <MoneyText value={totals.unallocated} />
                </td>
                <td className={NUM}>
                  <MoneyText value={totals.net} negativeRed />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-text-muted mt-2 text-[12px]">
        未沖銷金額為目前沖銷狀態；帳齡以單據日期距基準日天數分區（未來日期的單據歸
        0–30 天）。{isAr ? "銷退" : "進退"}
        以負數扣減。淨額 = {isAr ? "應收" : "應付"}合計 − {advanceLabel}。
      </p>
    </section>
  );
}
