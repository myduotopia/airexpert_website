// 員工狀態徽章（在職／預定離職／離職／停用，#257）。無 hooks，server / client 皆可用。
import {
  EMPLOYEE_STATUS_LABELS,
  employeeStatus,
  type EmployeeStatusFields,
} from "@/lib/employees/status";

const TONE = {
  active: "bg-primary/10 text-primary-deep",
  leaving: "bg-amber-50 text-amber-700",
  left: "bg-gray-100 text-gray-500",
  inactive: "bg-gray-100 text-gray-500",
} as const;

export function EmployeeStatusBadge({
  employee,
  today,
}: {
  employee: EmployeeStatusFields;
  today: string;
}) {
  const s = employeeStatus(employee, today);
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap ${TONE[s]}`}
    >
      {EMPLOYEE_STATUS_LABELS[s]}
    </span>
  );
}
