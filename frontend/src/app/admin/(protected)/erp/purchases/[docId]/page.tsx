import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getDocumentWithLines } from "@/lib/erp/documents";
import {
  listItemOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import {
  getPurchaseLineProgress,
  getPurchaseProgressMap,
  listDownstreamDocuments,
  PURCHASE_PROGRESS_LABEL,
} from "@/lib/erp/queries/purchasing";
import { DocActionBar } from "../_components/DocActionBar";
import {
  DocHeaderSummary,
  DocLinesTable,
  DocTitle,
  RelatedDocsList,
  type LineProgress,
} from "../_components/DocDetail";
import { PurchasingTabs } from "../_components/PurchasingTabs";
import {
  convertPurchaseToReceiptAction,
  deletePurchaseDraftAction,
  postPurchaseAction,
  voidPurchaseAction,
} from "../actions";

export const metadata = { title: "採購單 · ERP" };

const BASE = "/admin/erp/purchases";

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  await requireModule("erp");
  const { docId } = await params;
  const res = await getDocumentWithLines(docId);
  if (!res.ok || res.data.doc_type !== "P") notFound();
  const doc = res.data;

  const [items, warehouses, downstream, lineProgress, progress] =
    await Promise.all([
      listItemOptions({ includeInactive: true }),
      listWarehouseOptions({ includeInactive: true }),
      listDownstreamDocuments(doc.id),
      doc.status === "posted" ? getPurchaseLineProgress(doc.id) : null,
      doc.status === "posted" ? getPurchaseProgressMap([doc.id]) : null,
    ]);

  const progressByLine: Map<string, LineProgress> | null = lineProgress?.ok
    ? new Map(
        [...lineProgress.data.values()].map((p) => [
          p.line_id,
          { received: p.received_qty, remaining: p.remaining_qty },
        ]),
      )
    : null;
  const status = progress?.ok ? progress.data.get(doc.id) : undefined;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div>
        <Link
          href={BASE}
          className="text-text-muted text-[13px] hover:underline"
        >
          ← 採購單列表
        </Link>
      </div>
      <PurchasingTabs active="purchases" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DocTitle doc={doc} />
        <DocActionBar
          docId={doc.id}
          status={doc.status}
          basePath={BASE}
          listPath={BASE}
          postAction={postPurchaseAction.bind(null, doc.id)}
          voidAction={voidPurchaseAction.bind(null, doc.id)}
          deleteAction={deletePurchaseDraftAction.bind(null, doc.id)}
          convert={
            doc.status === "posted" && status !== "closed"
              ? {
                  label: "轉進貨單",
                  targetBasePath: "/admin/erp/receipts",
                  action: convertPurchaseToReceiptAction.bind(null, doc.id),
                }
              : null
          }
        />
      </div>
      <DocHeaderSummary
        doc={doc}
        warehouses={warehouses}
        extra={
          status
            ? [{ label: "到貨狀態", value: PURCHASE_PROGRESS_LABEL[status] }]
            : undefined
        }
      />
      <DocLinesTable doc={doc} items={items} progress={progressByLine} />
      {downstream.ok && (
        <RelatedDocsList title="相關進貨單" docs={downstream.data} />
      )}
    </div>
  );
}
