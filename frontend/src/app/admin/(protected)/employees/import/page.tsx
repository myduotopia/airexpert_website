import Link from "next/link";
import { getCurrentModules } from "@/lib/admin/auth";
import { listImportExisting } from "@/lib/employees/queries";
import {
  LINK_SECONDARY,
  MasterHeader,
} from "../../erp/items/_components/master-ui";
import { EmployeesTabs } from "../_components/EmployeesTabs";
import { EmployeeImport } from "./EmployeeImport";

export const metadata = { title: "匯入員工 · 後台" };

// 員工匯入（#257）：檔案只在瀏覽器解析（不上傳、不存 storage），預覽後才把解析結果送到 server action。
// 既有員工（非敏感欄位）供預覽比對；server action 寫入前會以最新資料重算。
export default async function EmployeeImportPage() {
  const [existing, modules] = await Promise.all([
    listImportExisting(),
    getCurrentModules(),
  ]);
  const isHr = modules.includes("hr");

  return (
    <div className="mx-auto max-w-[1100px]">
      <EmployeesTabs />
      <MasterHeader
        title="匯入員工"
        description="上傳舊系統匯出的 xls／xlsx／csv。檔案只在瀏覽器中讀取，不會上傳保存；依員工編號（其次姓名）比對既有員工，可重複匯入、不會重複建檔。"
        actions={
          <Link href="/admin/employees" className={LINK_SECONDARY}>
            回員工列表
          </Link>
        }
      />
      <EmployeeImport existing={existing} canWritePrivate={isHr} />
    </div>
  );
}
