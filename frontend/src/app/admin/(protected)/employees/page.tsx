import Link from "next/link";
import { listEmployees } from "@/lib/employees/queries";
import { employeeRolesText } from "@/lib/employees/normalize";
import {
  parseRoleFilter,
  parseStatusFilter,
  type EmployeeStatusFilter,
} from "@/lib/employees/list";
import { taipeiToday } from "@/lib/employees/status";
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  type Employee,
} from "@/lib/employees/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import {
  LINK_PRIMARY,
  LINK_SECONDARY,
  MasterHeader,
  Pager,
  TEXT_LINK,
  firstParam,
  pageParam,
} from "../erp/items/_components/master-ui";
import { EmployeeStatusBadge } from "./_components/EmployeeStatusBadge";
import { EmployeesTabs } from "./_components/EmployeesTabs";

export const metadata = { title: "員工 · 後台" };

function columns(today: string): Column<Employee>[] {
  return [
    {
      header: "代號",
      cell: (e) =>
        e.code ? <span className="font-mono text-[13px]">{e.code}</span> : "—",
    },
    {
      header: "姓名",
      cell: (e) => (
        <Link href={`/admin/employees/${e.id}`} className={TEXT_LINK}>
          {e.name}
        </Link>
      ),
    },
    { header: "職務", cell: (e) => e.title ?? "—" },
    { header: "角色", cell: (e) => employeeRolesText(e.roles) || "無角色" },
    {
      header: "電話",
      cell: (e) =>
        e.phone ? (
          <span className="font-mono text-[13px] whitespace-nowrap">
            {e.phone}
          </span>
        ) : (
          "—"
        ),
    },
    {
      header: "到職／離職",
      cell: (e) =>
        e.hired_on || e.left_on ? (
          <span className="font-mono text-[13px] whitespace-nowrap">
            {e.hired_on ?? "—"} ～ {e.left_on ?? ""}
          </span>
        ) : (
          "—"
        ),
    },
    {
      header: "狀態",
      cell: (e) => <EmployeeStatusBadge employee={e} today={today} />,
    },
  ];
}

const STATUS_OPTIONS: { value: EmployeeStatusFilter; label: string }[] = [
  { value: "current", label: "在職" },
  { value: "former", label: "離職／停用" },
  { value: "all", label: "全部" },
];

// 員工主檔列表（ERP 與機台維護報告單共用；權限由 layout 的 requireAnyModule 把關）。
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = firstParam(sp.q);
  // 舊網址 ?inactive=1（#223「顯示停用」）視同「全部」。
  const status =
    firstParam(sp.inactive) === "1" && !firstParam(sp.status)
      ? "all"
      : parseStatusFilter(firstParam(sp.status));
  const role = parseRoleFilter(firstParam(sp.role));
  const title = firstParam(sp.title) || null;
  const page = pageParam(sp.page);
  const today = taipeiToday();
  const result = await listEmployees({ q, status, role, title, page });

  return (
    <div className="mx-auto max-w-[1100px]">
      <EmployeesTabs />
      <MasterHeader
        title="員工"
        description={`符合條件 ${result.total} 位。已被客戶、單據或維護報告單使用的員工只能停用或設定離職日，不能刪除；選取器只列在職員工，舊單據上的姓名照常顯示。`}
        actions={
          <>
            <Link href="/admin/employees/import" className={LINK_SECONDARY}>
              匯入員工
            </Link>
            <Link href="/admin/employees/new" className={LINK_PRIMARY}>
              新增員工
            </Link>
          </>
        }
      />
      <form
        method="get"
        className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px]">
          <span className="text-text-muted">搜尋編號／姓名／電話</span>
          <input name="q" defaultValue={q} className={ERP_INPUT} />
        </label>
        <label className="flex min-w-[130px] flex-col gap-1 text-[13px]">
          <span className="text-text-muted">狀態</span>
          <select name="status" defaultValue={status} className={ERP_SELECT}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[130px] flex-col gap-1 text-[13px]">
          <span className="text-text-muted">職務</span>
          <select
            name="title"
            defaultValue={title ?? ""}
            className={ERP_SELECT}
          >
            <option value="">全部</option>
            {result.titles.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-[140px] flex-col gap-1 text-[13px]">
          <span className="text-text-muted">角色</span>
          <select name="role" defaultValue={role ?? ""} className={ERP_SELECT}>
            <option value="">全部</option>
            {EMPLOYEE_ROLES.map((r) => (
              <option key={r} value={r}>
                {EMPLOYEE_ROLE_LABELS[r]}
              </option>
            ))}
            <option value="none">無角色</option>
          </select>
        </label>
        <button type="submit" className={LINK_SECONDARY}>
          查詢
        </button>
      </form>
      <DataTable
        rows={result.rows}
        columns={columns(today)}
        getKey={(e) => e.id}
        empty="查無員工。"
      />
      <Pager
        basePath="/admin/employees"
        params={{
          q: q || undefined,
          status: status === "current" ? undefined : status,
          role: role ?? undefined,
          title: title ?? undefined,
        }}
        page={result.page}
        total={result.total}
        pageSize={result.pageSize}
      />
    </div>
  );
}
