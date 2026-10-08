// 員工主檔頁頂端：有 ERP 模組者顯示 ERP 基本資料 tab（員工為其中一項），
// 只有維護報告單模組者不顯示（其他 tab 是 ERP 頁，進不去）。
import { getCurrentModules } from "@/lib/admin/auth";
import { MasterTabs } from "../../erp/items/_components/master-ui";

export async function EmployeesTabs() {
  const modules = await getCurrentModules();
  return modules.includes("erp") ? <MasterTabs active="employees" /> : null;
}
