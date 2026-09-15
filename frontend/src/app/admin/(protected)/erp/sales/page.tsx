import { requireModule } from "@/lib/admin/auth";
import {
  SalesDocList,
  type ListSearchParams,
} from "./_components/SalesDocList";

export const metadata = { title: "銷貨單 · ERP" };

export default async function SalesListPage({
  searchParams,
}: {
  searchParams: Promise<ListSearchParams>;
}) {
  await requireModule("erp");
  return (
    <SalesDocList
      docType="S"
      searchParams={await searchParams}
      description="銷貨出庫；過帳後扣庫存、機號出庫，整機自動建立保養卡機台。"
      newHref="/admin/erp/sales/new"
      newLabel="新增銷貨單"
    />
  );
}
