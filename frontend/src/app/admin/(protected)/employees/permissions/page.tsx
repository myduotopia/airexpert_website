import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import {
  listAccessAudit,
  listPositions,
  listStaffPeople,
} from "@/lib/employees/permissions";
import {
  MasterHeader,
  firstParam,
} from "../../erp/items/_components/master-ui";
import { AuditList } from "./_components/AuditList";
import { PeoplePanel } from "./_components/PeoplePanel";
import { PositionsPanel } from "./_components/PositionsPanel";

export const metadata = { title: "權限管理 · 後台" };

type Tab = "positions" | "people" | "audit";

const TABS: { key: Tab; label: string }[] = [
  { key: "positions", label: "職位" },
  { key: "people", label: "人員" },
  { key: "audit", label: "稽核紀錄" },
];

function parseTab(v: string): Tab {
  return v === "people" || v === "audit" ? v : "positions";
}

// 權限管理（#261）：只限 hr 模組（人事主管）。上層 employees/layout 只要求任一員工模組，故此頁再 requireModule('hr')。
//   職位：新增、改名、停用、刪除職位，勾選每個職位可用的模組（不含 hr）。
//   人員：指派員工職位、建立員工帳號（單筆／批次）、重設為預設密碼、停用／恢復登入。
//   稽核紀錄：帳號與權限的變更紀錄。
export default async function EmployeePermissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("hr");
  const sp = await searchParams;
  const tab = parseTab(firstParam(sp.tab));
  const includeFormer = firstParam(sp.former) === "1";

  return (
    <div className="mx-auto max-w-[1100px]">
      <MasterHeader
        title="權限管理"
        description="設定每個職位可以使用哪些功能，並替員工指派職位、建立後台帳號。員工帳號能看到的內容完全由職位決定；人事（敏感資料）權限只能由管理員在人員管理頁授予。"
      />
      <nav
        aria-label="權限管理"
        className="border-border mb-6 flex gap-1 overflow-x-auto border-b"
      >
        {TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/admin/employees/permissions?tab=${t.key}`}
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
      {tab === "positions" ? (
        <PositionsPanel positions={await listPositions()} />
      ) : tab === "people" ? (
        <PeopleTab includeFormer={includeFormer} />
      ) : (
        <AuditList rows={await listAccessAudit()} />
      )}
    </div>
  );
}

async function PeopleTab({ includeFormer }: { includeFormer: boolean }) {
  const [people, positions] = await Promise.all([
    listStaffPeople({ includeFormer }),
    listPositions(),
  ]);
  return (
    <PeoplePanel
      people={people}
      positions={positions.map((p) => ({
        id: p.id,
        name: p.name,
        active: p.active,
      }))}
      includeFormer={includeFormer}
    />
  );
}
