import { requireModule } from "@/lib/admin/auth";
import {
  SalesDocList,
  type ListSearchParams,
} from "../sales/_components/SalesDocList";

export const metadata = { title: "銷退單 · ERP" };

export default async function SalesReturnsListPage({
  searchParams,
}: {
  searchParams: Promise<ListSearchParams>;
}) {
  await requireModule("erp");
  return (
    <SalesDocList
      docType="SR"
      searchParams={await searchParams}
      description="從已過帳銷貨單帶入可退品項與機號；過帳後回庫，保養卡機台保留。"
      newHref="/admin/erp/sales-returns/new"
      newLabel="新增銷退單"
    />
  );
}
