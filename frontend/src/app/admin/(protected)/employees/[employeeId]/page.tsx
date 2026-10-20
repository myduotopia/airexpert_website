import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentModules } from "@/lib/admin/auth";
import { getEmployee } from "@/lib/employees/queries";
import {
  getEmployeePrivate,
  listPrivateAccessLog,
} from "@/lib/employees/private-queries";
import { employeeRolesText, isEmployeeId } from "@/lib/employees/normalize";
import { taipeiToday } from "@/lib/employees/status";
import {
  Info,
  InfoGrid,
  LINK_PRIMARY,
  LINK_SECONDARY,
  MasterHeader,
} from "../../erp/items/_components/master-ui";
import { EmployeeStatusBadge } from "../_components/EmployeeStatusBadge";
import { EmployeesTabs } from "../_components/EmployeesTabs";
import { PrivateAccessLogList } from "../_components/PrivateAccessLogList";
import { PrivateDataPanel } from "../_components/PrivateDataPanel";

export const metadata = { title: "員工 · 後台" };

// 員工詳情（#257）。敏感資料區塊只對 hr 模組使用者呈現，且只有 hr 才會呼叫 hr_* RPC——
// 非 hr 使用者的 server 回應（RSC payload）不含任何敏感值或遮罩值。
export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  if (!isEmployeeId(employeeId)) notFound();
  const [employee, modules] = await Promise.all([
    getEmployee(employeeId),
    getCurrentModules(),
  ]);
  if (!employee) notFound();

  const isHr = modules.includes("hr");
  const [privateRes, logs] = isHr
    ? await Promise.all([
        getEmployeePrivate(employeeId),
        listPrivateAccessLog(employeeId),
      ])
    : [null, []];
  const today = taipeiToday();

  return (
    <div className="mx-auto max-w-[900px]">
      <EmployeesTabs />
      <MasterHeader
        title={
          <>
            {employee.name}
            {employee.code && (
              <span className="text-text-muted ml-2 font-mono text-[16px] font-normal">
                {employee.code}
              </span>
            )}
          </>
        }
        actions={
          <>
            <Link href="/admin/employees" className={LINK_SECONDARY}>
              回列表
            </Link>
            <Link
              href={`/admin/employees/${employeeId}/edit`}
              className={LINK_PRIMARY}
            >
              編輯
            </Link>
          </>
        }
      />

      <InfoGrid>
        <Info label="狀態">
          <EmployeeStatusBadge employee={employee} today={today} />
        </Info>
        <Info label="職務">{employee.title ?? "—"}</Info>
        <Info label="角色">
          {employeeRolesText(employee.roles) || "無角色"}
        </Info>
        <Info label="電話">{employee.phone ?? "—"}</Info>
        <Info label="到職日">{employee.hired_on ?? "—"}</Info>
        <Info label="離職日">{employee.left_on ?? "—"}</Info>
        <Info label="後台帳號">
          {employee.admin_profile_id ? "已連結" : "未連結"}
        </Info>
        <Info label="部門">{employee.department ?? "—"}</Info>
        <Info label="緊急聯絡人" wide>
          {employee.emergency_contact ?? "—"}
        </Info>
        <Info label="備註" wide>
          {employee.note ?? "—"}
        </Info>
      </InfoGrid>

      {isHr && privateRes && (
        <section className="border-border mt-8 rounded-xl border bg-white p-5">
          <h2 className="text-ink text-[16px] font-bold">敏感資料</h2>
          <p className="text-text-muted mt-1 mb-4 text-[13px]">
            只有人事權限（hr）看得到。預設遮罩顯示；按「顯示」會留下存取紀錄，
            顯示 30 秒後、切換到其他分頁或離開此頁時自動恢復遮罩。
          </p>
          {privateRes.ok ? (
            <PrivateDataPanel
              employeeId={employeeId}
              initial={privateRes.view}
            />
          ) : (
            <p role="alert" className="text-[14px] text-red-600">
              {privateRes.error}
            </p>
          )}
          <h3 className="text-ink mt-8 mb-2 text-[14px] font-bold">
            最近存取紀錄
          </h3>
          <PrivateAccessLogList logs={logs} />
        </section>
      )}
    </div>
  );
}
