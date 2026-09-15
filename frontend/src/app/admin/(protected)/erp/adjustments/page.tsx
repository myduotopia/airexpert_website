import { requireModule } from "@/lib/admin/auth";
import { StockDocListPage } from "../inventory/_components/StockDocPages";
import type { SearchParamsRecord } from "../inventory/_lib/params";

export const metadata = { title: "盤點調整單 · ERP · 後台" };

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireModule("erp");
  return <StockDocListPage docType="A" searchParams={await searchParams} />;
}
