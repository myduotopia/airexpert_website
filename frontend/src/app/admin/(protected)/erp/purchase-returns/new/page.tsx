import { requireModule } from "@/lib/admin/auth";
import { listDocuments } from "@/lib/erp/documents";
import { DocListFilters } from "../../purchases/_components/DocListFilters";
import { DocListTable } from "../../purchases/_components/DocListTable";
import { parseDocListParams } from "../../purchases/_components/list-params";
import { Pager } from "../../purchases/_components/Pager";
import { PurchasingTabs } from "../../purchases/_components/PurchasingTabs";
import { convertReceiptToReturnAction } from "../../receipts/actions";
import { PickReceiptButton } from "./PickReceiptButton";

export const metadata = { title: "新增進退單 · ERP" };

const BASE = "/admin/erp/purchase-returns/new";

// 進退單一律由已過帳進貨單帶入（source_doc_id / source_line_id），此頁選擇來源進貨單。
export default async function NewPurchaseReturnPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const params = parseDocListParams(await searchParams);
  const res = await listDocuments({
    docType: "I",
    ...params,
    status: "posted",
  });

  return (
    <div className="mx-auto max-w-[1100px]">
      <h1 className="text-ink mb-4 text-[24px] font-bold">新增進退單</h1>
      <PurchasingTabs active="purchase-returns" />
      <p className="text-text-muted mb-3 text-[14px]">
        選擇要退貨的已過帳進貨單，系統會帶入各行可退數量；追蹤機號的品項於下一步勾選在庫機號。
      </p>
      <DocListFilters
        basePath={BASE}
        q={params.q}
        status=""
        from={params.from}
        to={params.to}
        showStatus={false}
        searchPlaceholder="搜尋進貨單號 / 廠商"
      />
      {!res.ok ? (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          {res.error}
        </p>
      ) : (
        <>
          <DocListTable
            rows={res.data.rows}
            basePath="/admin/erp/receipts"
            empty="沒有符合條件的已過帳進貨單。"
            extraColumn={{
              header: "",
              cell: (r) => (
                <PickReceiptButton
                  action={convertReceiptToReturnAction.bind(null, r.id)}
                />
              ),
            }}
          />
          <Pager
            basePath={BASE}
            params={{ ...params, status: null }}
            total={res.data.total}
            pageSize={res.data.pageSize}
          />
        </>
      )}
    </div>
  );
}
