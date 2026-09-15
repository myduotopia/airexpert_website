import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/admin/auth";
import { getDocumentWithLines } from "@/lib/erp/documents";
import {
  listItemOptions,
  listWarehouseOptions,
} from "@/lib/erp/queries/pickers";
import { getDocumentBrief } from "@/lib/erp/queries/purchasing";
import { DocActionBar } from "../../purchases/_components/DocActionBar";
import {
  DocHeaderSummary,
  DocLinesTable,
  DocTitle,
} from "../../purchases/_components/DocDetail";
import { PurchasingTabs } from "../../purchases/_components/PurchasingTabs";
import {
  deletePurchaseReturnDraftAction,
  postPurchaseReturnAction,
  voidPurchaseReturnAction,
} from "../actions";

export const metadata = { title: "進退單 · ERP" };

const BASE = "/admin/erp/purchase-returns";

export default async function PurchaseReturnDetailPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  await requireModule("erp");
  const { docId } = await params;
  const res = await getDocumentWithLines(docId);
  if (!res.ok || res.data.doc_type !== "PR") notFound();
  const doc = res.data;

  const [items, warehouses, source] = await Promise.all([
    listItemOptions({ includeInactive: true }),
    listWarehouseOptions({ includeInactive: true }),
    doc.source_doc_id ? getDocumentBrief(doc.source_doc_id) : null,
  ]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-5">
      <div>
        <Link
          href={BASE}
          className="text-text-muted text-[13px] hover:underline"
        >
          ← 進退單列表
        </Link>
      </div>
      <PurchasingTabs active="purchase-returns" />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <DocTitle doc={doc} />
        <DocActionBar
          docId={doc.id}
          status={doc.status}
          basePath={BASE}
          listPath={BASE}
          postAction={postPurchaseReturnAction.bind(null, doc.id)}
          voidAction={voidPurchaseReturnAction.bind(null, doc.id)}
          deleteAction={deletePurchaseReturnDraftAction.bind(null, doc.id)}
        />
      </div>
      <DocHeaderSummary
        doc={doc}
        warehouses={warehouses}
        source={source?.ok ? source.data : null}
      />
      <DocLinesTable doc={doc} items={items} />
    </div>
  );
}
