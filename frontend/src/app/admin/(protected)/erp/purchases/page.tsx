import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { listDocuments } from "@/lib/erp/documents";
import {
  getPurchaseProgressMap,
  PURCHASE_PROGRESS_LABEL,
} from "@/lib/erp/queries/purchasing";
import { DocListFilters } from "./_components/DocListFilters";
import { DocListTable } from "./_components/DocListTable";
import { parseDocListParams } from "./_components/list-params";
import { Pager } from "./_components/Pager";
import { PurchasingTabs } from "./_components/PurchasingTabs";

export const metadata = { title: "採購單 · ERP" };

const BASE = "/admin/erp/purchases";

const PROGRESS_CLASS = {
  open: "bg-amber-100 text-amber-700",
  partial: "bg-sky-100 text-sky-700",
  closed: "bg-primary/10 text-primary-deep",
} as const;

export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("erp");
  const params = parseDocListParams(await searchParams);
  const res = await listDocuments({ docType: "P", ...params });
  const progress = res.ok
    ? await getPurchaseProgressMap(res.data.rows.map((r) => r.id))
    : null;
  const progressMap = progress?.ok ? progress.data : new Map();

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-ink text-[24px] font-bold">採購</h1>
        <Link
          href={`${BASE}/new`}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
        >
          新增採購單
        </Link>
      </div>
      <PurchasingTabs active="purchases" />
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
            empty="尚無採購單。"
            extraColumn={{
              header: "到貨進度",
              cell: (r) => {
                const s = progressMap.get(r.id) as
                  | keyof typeof PROGRESS_CLASS
                  | undefined;
                return s ? (
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${PROGRESS_CLASS[s]}`}
                  >
                    {PURCHASE_PROGRESS_LABEL[s]}
                  </span>
                ) : (
                  <span className="text-text-muted">—</span>
                );
              },
            }}
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
