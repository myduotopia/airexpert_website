import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { listDocuments } from "@/lib/erp/documents";
import { DocListFilters } from "../purchases/_components/DocListFilters";
import { DocListTable } from "../purchases/_components/DocListTable";
import { parseDocListParams } from "../purchases/_components/list-params";
import { Pager } from "../purchases/_components/Pager";
import { PurchasingTabs } from "../purchases/_components/PurchasingTabs";

export const metadata = { title: "進退單 · ERP" };

const BASE = "/admin/erp/purchase-returns";

export default async function PurchaseReturnsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const params = parseDocListParams(await searchParams);
  const res = await listDocuments({ docType: "PR", ...params });

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-ink text-[24px] font-bold">採購</h1>
        <Link
          href={`${BASE}/new`}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
        >
          新增進退單
        </Link>
      </div>
      <PurchasingTabs active="purchase-returns" />
      <DocListFilters
        basePath={BASE}
        q={params.q}
        status={params.status ?? ""}
        from={params.from}
        to={params.to}
      />
      {!res.ok ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          {res.error}
        </p>
      ) : (
        <>
          <DocListTable
            rows={res.data.rows}
            basePath={BASE}
            empty="尚無進退單。"
          />
          <Pager
            basePath={BASE}
            params={params}
            total={res.data.total}
            pageSize={res.data.pageSize}
          />
        </>
      )}
    </div>
  );
}
