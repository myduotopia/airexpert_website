import { requireModule } from "@/lib/admin/auth";
import {
  SalesDocList,
  type ListSearchParams,
} from "../sales/_components/SalesDocList";

export const metadata = { title: "報價單 · ERP" };

export default async function QuotesListPage({
  searchParams,
}: {
  searchParams: Promise<ListSearchParams>;
}) {
  await requireModule("erp");
  return (
    <SalesDocList
      docType="Q"
      searchParams={await searchParams}
      description="報價不動庫存；確認後取號，可一鍵轉為銷貨單草稿。"
      newHref="/admin/erp/quotes/new"
      newLabel="新增報價單"
    />
  );
}
