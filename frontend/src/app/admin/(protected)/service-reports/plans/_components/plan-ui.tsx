// 保養方案頁共用的版面小元件與樣式常數。無 hooks，server / client 皆可用。
import Link from "next/link";
import type { ReactNode } from "react";
import { isDefaultHpTags } from "@/lib/service-report/plan/match";
import { SERVICE_REPORTS_PATH } from "../../_components/list-params";

export const PLANS_PATH = `${SERVICE_REPORTS_PATH}/plans`;
export const PLAN_MACHINES_PATH = `${PLANS_PATH}/machines`;

export const PLAN_LINK_PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white";
export const PLAN_LINK_SECONDARY =
  "border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-4 text-[14px] font-semibold";
export const PLAN_TEXT_LINK = "text-ink hover:text-primary-deep font-medium";

export type PlanTab = "plans" | "machines";

const TABS: { key: PlanTab; label: string; href: string }[] = [
  { key: "plans", label: "方案", href: PLANS_PATH },
  { key: "machines", label: "機台對應", href: PLAN_MACHINES_PATH },
];

/** 方案／機台對應頁內 tab（側欄只有「機台維護報告單」一個入口）。 */
export function PlanTabs({ active }: { active: PlanTab }) {
  return (
    <div className="mb-6">
      <Link
        href={SERVICE_REPORTS_PATH}
        className="text-text-muted hover:text-ink mb-3 inline-block text-[13px]"
      >
        ← 回機台維護報告單
      </Link>
      <nav
        aria-label="保養方案"
        className="border-border flex gap-1 overflow-x-auto border-b"
      >
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-[14px] font-semibold whitespace-nowrap ${
                on
                  ? "border-primary text-primary-deep"
                  : "text-text-muted hover:text-ink border-transparent"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PlanHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 break-words">
        <h1 className="text-ink text-[24px] font-bold">{title}</h1>
        {description && (
          <p className="text-text-muted mt-1 text-[14px]">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}

/** 查詢失敗時的中文提示（不擋畫面其他部分）。 */
export function PlanErrorAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-[14px] text-red-700"
    >
      {message}
    </p>
  );
}

export function PlanActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="bg-primary/10 text-primary-deep inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap">
      啟用
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap text-gray-500">
      停用
    </span>
  );
}

/** 適用馬力 chips；未填（通用預設方案）改顯示徽章。 */
export function HpTagChips({ tags }: { tags: readonly string[] }) {
  if (isDefaultHpTags(tags)) {
    return (
      <span
        title="套用到所有沒有其他對應的空壓機"
        className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-[12px] font-medium whitespace-nowrap text-amber-700"
      >
        通用預設
      </span>
    );
  }
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="border-border text-ink inline-flex items-center rounded-full border bg-white px-2 py-0.5 text-[12px] whitespace-nowrap"
        >
          {t}
        </span>
      ))}
    </span>
  );
}
