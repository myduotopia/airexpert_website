// 週報追蹤清單（#272）工具列的額外篩選：狀態、負責人（原生 <select>，隨報表工具列的 GET 表單送出）。
// 無 hooks，server component 直接使用。
import { ERP_SELECT } from "@/components/erp/styles";
import type { EmployeeOption, EmployeeRole } from "@/lib/employees/types";
import type { TrackingFilters } from "@/lib/erp/tracking/filters";

export interface StatusChoice {
  value: string;
  label: string;
}

export function TrackingFilterFields({
  filters,
  statuses,
  employees,
  roles,
  ownerLabel,
  noneLabel,
}: {
  filters: TrackingFilters;
  statuses: StatusChoice[];
  employees: EmployeeOption[];
  /** 負責人選單列出哪些角色的在職員工。 */
  roles: EmployeeRole[];
  ownerLabel: string;
  /** owner=none 的文字，例「交機負責人待確認」。 */
  noneLabel: string;
}) {
  const people = ownerChoices(employees, roles, filters.owner);
  return (
    <>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="text-text-muted">狀態</span>
        <select
          name="status"
          defaultValue={filters.status}
          className={`${ERP_SELECT} w-[150px]`}
        >
          <option value="open">未結案</option>
          <option value="all">全部</option>
          {statuses.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[13px]">
        <span className="text-text-muted">{ownerLabel}</span>
        <select
          name="owner"
          defaultValue={filters.owner}
          className={`${ERP_SELECT} w-[170px]`}
        >
          <option value="">全部</option>
          <option value="none">{noneLabel}</option>
          {people.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
              {e.active ? "" : "（已停用）"}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** 負責人選項：在職且有任一指定角色者；目前篩選中的員工即使不符也列出（才看得出目前條件）。 */
export function ownerChoices(
  employees: EmployeeOption[],
  roles: EmployeeRole[],
  selected: string,
): EmployeeOption[] {
  return employees.filter(
    (e) =>
      e.id === selected || (e.active && e.roles.some((r) => roles.includes(r))),
  );
}
