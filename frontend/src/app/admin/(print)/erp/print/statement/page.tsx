import { PrintMessage, PrintShell } from "@/components/erp/print/PrintSheet";
import { StatementPrint } from "@/components/erp/print/StatementPrint";
import { requireModule } from "@/lib/admin/auth";
import { getBranding } from "@/lib/data/site";
import { getStatementData } from "@/lib/erp/queries/ar-ap";
import {
  isIsoDate,
  parseStatementParty,
  taipeiToday,
} from "@/lib/erp/statement";

export const metadata = { title: "對帳單列印 · ERP · 後台" };

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function StatementPrintPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const partyRaw = one(sp.party);
  const from = one(sp.from);
  const to = one(sp.to);
  const party = parseStatementParty(partyRaw);

  // 返回對帳單預覽頁，保留原查詢條件。
  const backQs = new URLSearchParams();
  if (partyRaw) backQs.set("party", partyRaw);
  if (from) backQs.set("from", from);
  if (to) backQs.set("to", to);
  const backHref = `/admin/erp/statements${backQs.size ? `?${backQs.toString()}` : ""}`;

  let problem: string | null = null;
  if (!party) {
    problem = "對象參數不正確，請回對帳單頁重新選擇客戶或廠商。";
  } else if (!isIsoDate(from) || !isIsoDate(to)) {
    problem = "期間參數不正確（起訖日需為 YYYY-MM-DD），請回對帳單頁重新選擇。";
  } else if (from > to) {
    problem = "起日不可晚於迄日。";
  }
  if (problem || !party) {
    return (
      <PrintShell title="對帳單列印" backHref={backHref}>
        <PrintMessage>{problem}</PrintMessage>
      </PrintShell>
    );
  }

  const [result, branding] = await Promise.all([
    getStatementData({ party, from, to }),
    getBranding(),
  ]);
  const title = party.type === "vendor" ? "廠商對帳單" : "客戶對帳單";
  if (!result.ok) {
    return (
      <PrintShell title={title} backHref={backHref}>
        <PrintMessage>讀取對帳單失敗：{result.error}</PrintMessage>
      </PrintShell>
    );
  }
  if (!result.data) {
    return (
      <PrintShell title={title} backHref={backHref}>
        <PrintMessage>
          找不到所選{party.type === "vendor" ? "廠商" : "客戶"}。
        </PrintMessage>
      </PrintShell>
    );
  }

  return (
    <PrintShell
      title={`${title} ${result.data.party.name}`}
      backHref={backHref}
    >
      <StatementPrint
        data={result.data}
        printedOn={taipeiToday()}
        logoUrl={branding.logo_url}
      />
    </PrintShell>
  );
}
