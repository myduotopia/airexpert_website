import { requireModule } from "@/lib/admin/auth";
import { getBranding } from "@/lib/data/site";
import { emptySheetData } from "@/lib/service-report/types";
import { SheetPrintView } from "@/components/service-report/SheetPrintView";

export const metadata = { title: "空白報告單列印 · 後台" };

// 空白表單列印（spec §5.3）：只有固定文字與格線，不寫 DB、不記錄列印次數。
export default async function BlankServiceReportPrintPage() {
  await requireModule("service_report");
  const branding = await getBranding();
  return (
    <SheetPrintView
      title="空白機台維護報告單"
      backHref="/admin/service-reports"
      data={emptySheetData()}
      logoUrl={branding.logo_url}
    />
  );
}
