import { requireModule } from "@/lib/admin/auth";
import { StockDocListPage } from "../inventory/_components/StockDocPages";
import type { SearchParamsRecord } from "../inventory/_lib/params";

export const metadata = { title: "調撥單 · ERP · 後台" };

export default async function TransfersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsRecord>;
}) {
  await requireModule("erp");
  return <StockDocListPage docType="T" searchParams={await searchParams} />;
}
