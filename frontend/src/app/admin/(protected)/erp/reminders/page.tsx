import Link from "next/link";
import { requireModule } from "@/lib/admin/auth";
import { rocDate } from "@/lib/admin/minguo";
import { ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import { listVendorOptions } from "@/lib/erp/queries/pickers";
import {
  getReminderList,
  listAllReminderRules,
  listPendingNotes,
  listRecentHandled,
  type ReminderRuleFull,
} from "@/lib/erp/queries/reminders";
import {
  SOURCE_LABEL,
  URGENCY_LABEL,
  filterReminderItems,
  type ReminderItemSource,
  type ReminderParty,
  type Urgency,
} from "@/lib/erp/reminders/schedule";
import { taipeiToday } from "@/lib/erp/statement";
import { PendingList } from "./_components/PendingList";
import { RecentHandled } from "./_components/RecentHandled";
import { ReminderTable } from "./_components/ReminderTable";
import { RulesTable } from "./_components/RulesTable";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  REMINDERS_PATH,
  ReminderTabs,
  type ReminderTab,
} from "./_components/ui";

export const metadata = { title: "提醒事項 · ERP · 後台" };

type SearchParams = Record<string, string | string[] | undefined>;

function one(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}
function pick<T extends string>(v: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(v) ? (v as T) : "";
}

const URGENCIES = Object.keys(URGENCY_LABEL) as Urgency[];
const SOURCES = Object.keys(SOURCE_LABEL) as ReminderItemSource[];

export default async function RemindersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireModule("erp");
  const sp = await searchParams;
  const tab: ReminderTab =
    pick(one(sp.tab), ["rules", "pending"] as const) || "list";
  const today = taipeiToday();

  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-ink text-[24px] font-bold">提醒事項</h1>
      <p className="text-text-muted mt-1 mb-4 text-[14px]">
        依廠商備註（例如「每月10號匯款」）與手動規則產生的到期提醒，加上未兌現支票。逾期與
        3 天內到期最優先；日期以台灣時間計算（今天 {rocDate(today)}）。
      </p>
      {tab === "list" && <ListTab sp={sp} today={today} />}
      {tab === "rules" && <RulesTab today={today} />}
      {tab === "pending" && <PendingTab today={today} />}
    </div>
  );
}

async function ListTab({ sp, today }: { sp: SearchParams; today: string }) {
  const urgency = pick(one(sp.urgency), URGENCIES);
  const source = pick(one(sp.source), SOURCES);
  const party = one(sp.party);
  const q = one(sp.q).trim();
  const [res, recent, vendorOptions] = await Promise.all([
    getReminderList(),
    listRecentHandled(),
    listVendorOptions({ includeInactive: true }),
  ]);

  if (!res.ok) {
    return (
      <>
        <ReminderTabs active="list" />
        <p role="alert" className="text-[14px] text-red-600">
          {res.error}
        </p>
      </>
    );
  }
  const all = res.data.items;
  const items = filterReminderItems(all, { urgency, source, party, q });
  const parties = [
    ...new Map(
      all
        .map((i) => i.party)
        .filter((p): p is ReminderParty => p !== null)
        .map((p) => [p.key, p]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
  const rules: Record<string, ReminderRuleFull> = Object.fromEntries(
    res.data.rules.map((r) => [r.id, r]),
  );
  const count = (u: Urgency) => all.filter((i) => i.urgency === u).length;
  const filtered = !!(urgency || source || party || q);

  return (
    <>
      <ReminderTabs active="list" />
      <div className="mb-4 flex flex-wrap gap-2 text-[13px]">
        {URGENCIES.filter((u) => u !== "later" || count(u) > 0).map((u) => (
          <span
            key={u}
            className="border-border text-ink rounded-full border bg-white px-3 py-1"
          >
            {URGENCY_LABEL[u]} <strong>{count(u)}</strong>
          </span>
        ))}
      </div>

      <form
        method="get"
        action={REMINDERS_PATH}
        className="border-border mb-4 grid grid-cols-1 gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]"
      >
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-text-muted">緊急程度</span>
          <select name="urgency" defaultValue={urgency} className={ERP_SELECT}>
            <option value="">全部</option>
            {URGENCIES.map((u) => (
              <option key={u} value={u}>
                {URGENCY_LABEL[u]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-text-muted">來源</span>
          <select name="source" defaultValue={source} className={ERP_SELECT}>
            <option value="">全部</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-text-muted">對象</span>
          <select name="party" defaultValue={party} className={ERP_SELECT}>
            <option value="">全部</option>
            {parties.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          <span className="text-text-muted">關鍵字</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="事項、對象、票號、備註"
            className={ERP_INPUT}
          />
        </label>
        <div className="flex items-end gap-2">
          <button type="submit" className={BTN_PRIMARY}>
            篩選
          </button>
          {filtered && (
            <Link href={REMINDERS_PATH} className={BTN_SECONDARY}>
              清除
            </Link>
          )}
        </div>
      </form>

      <ReminderTable
        items={items}
        rules={rules}
        vendorOptions={vendorOptions}
        today={today}
        emptyText={
          filtered
            ? "沒有符合篩選條件的提醒。"
            : "目前沒有逾期或即將到期的事項。"
        }
      />
      {recent.ok ? (
        <RecentHandled rows={recent.data} />
      ) : (
        <p role="alert" className="mt-6 text-[14px] text-red-600">
          {recent.error}
        </p>
      )}
    </>
  );
}

async function RulesTab({ today }: { today: string }) {
  const [res, vendorOptions] = await Promise.all([
    listAllReminderRules(),
    listVendorOptions({ includeInactive: true }),
  ]);
  return (
    <>
      <ReminderTabs active="rules" />
      {!res.ok ? (
        <p role="alert" className="text-[14px] text-red-600">
          {res.error}
        </p>
      ) : (
        <RulesTable
          rules={res.data}
          today={today}
          vendorOptions={vendorOptions}
          showResync
        />
      )}
    </>
  );
}

async function PendingTab({ today }: { today: string }) {
  const [res, vendorOptions] = await Promise.all([
    listPendingNotes(),
    listVendorOptions({ includeInactive: true }),
  ]);
  return (
    <>
      <ReminderTabs
        active="pending"
        pendingCount={
          res.ok ? res.data.reduce((s, p) => s + p.fragments.length, 0) : 0
        }
      />
      {!res.ok ? (
        <p role="alert" className="text-[14px] text-red-600">
          {res.error}
        </p>
      ) : (
        <PendingList
          pending={res.data}
          vendorOptions={vendorOptions}
          today={today}
        />
      )}
    </>
  );
}
