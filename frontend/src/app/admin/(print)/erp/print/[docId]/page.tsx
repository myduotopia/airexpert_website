import { notFound } from "next/navigation";
import { DocumentPrint } from "@/components/erp/print/DocumentPrint";
import { PrintMessage, PrintShell } from "@/components/erp/print/PrintSheet";
import { requireModule } from "@/lib/admin/auth";
import { getBranding } from "@/lib/data/site";
import { getDocumentWithLines } from "@/lib/erp/documents";
import { DOC_LIST_PATH, PRINT_DOC_TITLE } from "@/lib/erp/print";
import { getDocumentPrintContext } from "@/lib/erp/queries/print";

export const metadata = { title: "單據列印 · ERP · 後台" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** getDocumentWithLines 找不到單據時的訊息。 */
const DOC_NOT_FOUND = "找不到此單據。";

export default async function DocumentPrintPage({
  params,
}: {
  params: Promise<{ docId: string }>;
}) {
  // layout 已守門；頁面再檢查一次（React cache 去重，不多查）。
  await requireModule("erp");
  const { docId } = await params;
  if (!UUID.test(docId)) notFound();

  const res = await getDocumentWithLines(docId);
  if (!res.ok) {
    if (res.error === DOC_NOT_FOUND) notFound();
    return (
      <PrintShell title="單據列印" backHref="/admin/erp">
        <PrintMessage>讀取單據失敗：{res.error}</PrintMessage>
      </PrintShell>
    );
  }
  const doc = res.data;
  const backHref = `${DOC_LIST_PATH[doc.doc_type]}/${doc.id}`;
  const title = `${PRINT_DOC_TITLE[doc.doc_type]} ${doc.doc_no ?? "（草稿）"}`;

  const [ctx, branding] = await Promise.all([
    getDocumentPrintContext(doc),
    getBranding(),
  ]);
  if (!ctx.ok) {
    return (
      <PrintShell title={title} backHref={backHref}>
        <PrintMessage>讀取列印資料失敗：{ctx.error}</PrintMessage>
      </PrintShell>
    );
  }

  return (
    <PrintShell title={title} backHref={backHref}>
      <DocumentPrint doc={doc} ctx={ctx.data} logoUrl={branding.logo_url} />
    </PrintShell>
  );
}
