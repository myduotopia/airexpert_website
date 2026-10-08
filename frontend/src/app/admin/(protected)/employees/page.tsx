import Link from "next/link";
import { listEmployees } from "@/lib/employees/queries";
import { employeeRolesText } from "@/lib/employees/normalize";
import {
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  type Employee,
  type EmployeeRole,
} from "@/lib/employees/types";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import {
  ActiveBadge,
  LINK_PRIMARY,
  LINK_SECONDARY,
  MasterHeader,
  Pager,
  TEXT_LINK,
  firstParam,
  pageParam,
} from "../erp/items/_components/master-ui";
import { EmployeesTabs } from "./_components/EmployeesTabs";

export const metadata = { title: "員工 · 後台" };

const COLUMNS: Column<Employee>[] = [
  {
    header: "姓名",
    cell: (e) => (
      <Link href={`/admin/employees/${e.id}/edit`} className={TEXT_LINK}>
        {e.name}
      </Link>
    ),
  },
  {
    header: "代號",
    cell: (e) =>
      e.code ? <span className="font-mono text-[13px]">{e.code}</span> : "—",
  },
  { header: "角色", cell: (e) => employeeRolesText(e.roles) || "—" },
  { header: "狀態", cell: (e) => <ActiveBadge active={e.active} /> },
  { header: "備註", cell: (e) => e.note ?? "—" },
];

function roleParam(v: string): EmployeeRole | null {
  return (EMPLOYEE_ROLES as readonly string[]).includes(v)
    ? (v as EmployeeRole)
    : null;
}

// 員工主檔列表（ERP 與機台維護報告單共用；權限由 layout 的 requireAnyModule 把關）。
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = firstParam(sp.q);
  const role = roleParam(firstParam(sp.role));
  const inactive = firstParam(sp.inactive) === "1";
  const page = pageParam(sp.page);
  const result = await listEmployees({
    q,
    role,
    includeInactive: inactive,
    page,
  });

  return (
    <div className="mx-auto max-w-[1100px]">
      <EmployeesTabs />
      <MasterHeader
        title="員工"
        description={`業務與維修師傅，共 ${result.total} 位${inactive ? "（含停用）" : ""}。已被客戶、單據或維護報告單使用的員工只能停用，不能刪除。`}
        actions={
          <Link href="/admin/employees/new" className={LINK_PRIMARY}>
            新增員工
          </Link>
        }
      />
      <form
        method="get"
        className="border-border mb-4 flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"
      >
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px]">
          <span className="text-text-muted">搜尋姓名／代號</span>
          <input name="q" defaultValue={q} className={ERP_INPUT} />
        </label>
        <label className="flex min-w-[160px] flex-col gap-1 text-[13px]">
          <span className="text-text-muted">角色</span>
          <select name="role" defaultValue={role ?? ""} className={ERP_SELECT}>
            <option value="">全部</option>
            {EMPLOYEE_ROLES.map((r) => (
              <option key={r} value={r}>
                {EMPLOYEE_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex h-10 items-center gap-2 text-[14px]">
          <input
            type="checkbox"
            name="inactive"
            value="1"
            defaultChecked={inactive}
          />
          顯示停用
        </label>
        <button type="submit" className={LINK_SECONDARY}>
          查詢
        </button>
      </form>
      <DataTable
        rows={result.rows}
        columns={COLUMNS}
        getKey={(e) => e.id}
        empty="查無員工。"
      />
      <Pager
        basePath="/admin/employees"
        params={{
          q: q || undefined,
          role: role ?? undefined,
          inactive: inactive ? "1" : undefined,
        }}
        page={result.page}
        total={result.total}
        pageSize={result.pageSize}
      />
    </div>
  );
}
