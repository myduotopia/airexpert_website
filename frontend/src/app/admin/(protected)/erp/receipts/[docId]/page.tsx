import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getDocumentWithLines } from "@/lib/erp/documents";
import {
  listItemOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import {
  getDocumentBrief,
  listDownstreamDocuments,
} from "@/lib/erp/queries/purchasing";
import { DocActionBar } from "../../purchases/_components/DocActionBar";
import {
  DocHeaderSummary,
  DocLinesTable,
  DocTitle,
  RelatedDocsList,
} from "../../purchases/_components/DocDetail";
import { PurchasingTabs } from "../../purchases/_components/PurchasingTabs";
import {
  convertReceiptToReturnAction,
  deleteReceiptDraftAction,
  postReceiptAction,
  voidReceiptAction,
} from "../actions";

export const metadata = { title: "進貨單 · ERP" };

const BASE = "/admin/erp/receipts";

export default async function ReceiptDetailPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  await requireModule("erp");
  const { docId } = await params;
  const res = await getDocumentWithLines(docId);
  if (!res.ok || res.data.doc_type !== "I") notFound();
  const doc = res.data;

  const [items, warehouses, downstream, source] = await Promise.all([
    listItemOptions({ includeInactive: true }),
    listWarehouseOptions({ includeInactive: true }),
    listDownstreamDocuments(doc.id),
    doc.source_doc_id ? getDocumentBrief(doc.source_doc_id) : null,
  ]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div>
        <Link
          href={BASE}
          className="text-text-muted text-[13px] hover:underline"
        >
          ← 進貨單列表
        </Link>
      </div>
      <PurchasingTabs active="receipts" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DocTitle doc={doc} />
        <DocActionBar
          docId={doc.id}
          status={doc.status}
          basePath={BASE}
          listPath={BASE}
          postAction={postReceiptAction.bind(null, doc.id)}
          voidAction={voidReceiptAction.bind(null, doc.id)}
          deleteAction={deleteReceiptDraftAction.bind(null, doc.id)}
          convert={
            doc.status === "posted"
              ? {
                  label: "轉進退單",
                  targetBasePath: "/admin/erp/purchase-returns",
                  action: convertReceiptToReturnAction.bind(null, doc.id),
                }
              : null
          }
        />
      </div>
      <DocHeaderSummary
        doc={doc}
        warehouses={warehouses}
        source={source?.ok ? source.data : null}
      />
      <DocLinesTable doc={doc} items={items} />
      {downstream.ok && (
        <RelatedDocsList title="相關進退單" docs={downstream.data} />
      )}
    </div>
  );
}
