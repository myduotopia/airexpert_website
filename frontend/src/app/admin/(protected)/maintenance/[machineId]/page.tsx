import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getMachine } from "@/lib/admin/maintenance";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { DeleteButton } from "@/components/admin/DeleteButton";
import type { MxRecord } from "@/lib/admin/maintenance";
import { rocDate } from "@/lib/admin/minguo";
import { ServiceTypeBadge } from "@/components/admin/maintenance/ServiceTypeBadge";
import {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  type ServiceType,
} from "@/lib/admin/maintenance-service-type";
import { deleteRecordAction } from "../actions";

export const metadata = { title: "保養卡 · 後台" };

/** 將 ?type= 收斂到允許值；非法或未帶 → null（全部）。 */
function resolveServiceType(raw: string | undefined): ServiceType | null {
  return (SERVICE_TYPES as readonly string[]).includes(raw ?? "")
    ? (raw as ServiceType)
    : null;
}

/** 服務類型篩選頁籤（純連結，無 client JS）。 */
function ServiceTypeTabs({
  machineId,
  current,
  counts,
}: {
  machineId: string;
  current: ServiceType | null;
  counts: Record<ServiceType, number>;
}) {
  const tabs: { value: ServiceType | null; label: string }[] = [
    { value: null, label: "全部" },
    ...SERVICE_TYPES.map((t) => ({
      value: t,
      label: `${SERVICE_TYPE_LABELS[t]}（${counts[t]}）`,
    })),
  ];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tabs.map((t) => {
        const active = t.value === current;
        const href = t.value
          ? `/admin/maintenance/${machineId}?type=${t.value}`
          : `/admin/maintenance/${machineId}`;
        return (
          <Link
            key={t.value ?? "all"}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex h-9 items-center rounded-lg border px-3 text-[13px] font-medium ${
              active
                ? "border-primary bg-primary text-white"
                : "border-border hover:bg-surface-muted text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}

export default async function MachineDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ machineId: string }>;
  // Next.js 16：params / searchParams 皆為非同步。
  searchParams: Promise<{ type?: string }>;
}) {
  await requireRole(["office"]);
  const { machineId } = await params;
  const { type } = await searchParams;
  const data = await getMachine(machineId);
  if (!data) notFound();
  const { machine, customer, records } = data;
  // 客戶為防呆佔位（id 為空）時不做成連結，避免連到 /customers/ 空白路徑。
  const customerHref = customer.id
    ? `/admin/maintenance/customers/${customer.id}`
    : null;

  const activeType = resolveServiceType(type);
  const counts = SERVICE_TYPES.reduce(
    (acc, t) => {
      acc[t] = records.filter((r) => r.service_type === t).length;
      return acc;
    },
    {} as Record<ServiceType, number>,
  );
  const visibleRecords = activeType
    ? records.filter((r) => r.service_type === activeType)
    : records;

  const columns: Column<MxRecord>[] = [
    { header: "日期", cell: (r) => rocDate(r.service_date) },
    {
      header: "類型",
      cell: (r) => <ServiceTypeBadge type={r.service_type} />,
    },
    { header: "時數", cell: (r) => r.hours ?? "—" },
    { header: "專用油", cell: (r) => r.oil ?? "—" },
    { header: "機油濾", cell: (r) => r.oil_filter ?? "—" },
    { header: "空氣濾", cell: (r) => r.air_filter ?? "—" },
    { header: "油氣分離", cell: (r) => r.oil_separator ?? "—" },
    { header: "變頻器", cell: (r) => r.inverter ?? "—" },
    { header: "過濾系統", cell: (r) => r.filter_system ?? "—" },
    { header: "維護員", cell: (r) => r.technician ?? "—" },
    {
      header: "",
      cell: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/admin/maintenance/${machineId}/records/${r.id}/edit`}
            className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
          >
            編輯
          </Link>
          <DeleteButton
            onDelete={deleteRecordAction.bind(null, r.id, machineId)}
          />
        </div>
      ),
      className: "text-right whitespace-nowrap",
    },
  ];

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex items-center justify-between">
        <h1 className="text-ink text-[24px] font-bold">
          {machine.serial_no}
          {customerHref ? (
            <Link
              href={customerHref}
              className="text-text-muted hover:text-primary-deep ml-2 text-[16px] font-normal"
            >
              {customer.name}
            </Link>
          ) : (
            <span className="text-text-muted ml-2 text-[16px] font-normal">
              {customer.name}
            </span>
          )}
        </h1>
        <Link
          href={`/admin/maintenance/${machineId}/edit`}
          className="border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border px-4 text-[14px] font-medium"
        >
          編輯基本資訊
        </Link>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-4">
        <div>
          <dt className="text-text-muted">機型</dt>
          <dd className="text-ink">{machine.model ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">馬力</dt>
          <dd className="text-ink">{machine.horsepower ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">電壓</dt>
          <dd className="text-ink">{machine.voltage ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">使用地點</dt>
          <dd className="text-ink">{machine.location ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">購買時間</dt>
          <dd className="text-ink">{rocDate(machine.purchased_at)}</dd>
        </div>
        <div>
          <dt className="text-text-muted">客戶編號</dt>
          <dd className="text-ink">
            {/* 無客戶編號時不做成連結——否則連結文字會是「—」，
                螢幕閱讀器只會念出一個破折號（可辨識連結目的失效）。
                此情境仍可由標題旁的客戶名稱進客戶頁。 */}
            {customerHref && customer.code ? (
              <Link
                href={customerHref}
                className="text-ink hover:text-primary-deep underline-offset-2 hover:underline"
              >
                {customer.code}
              </Link>
            ) : (
              (customer.code ?? "—")
            )}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">機台編號</dt>
          <dd className="text-ink">{machine.machine_no ?? "—"}</dd>
        </div>
      </dl>

      <div className="mt-8 mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-ink text-[18px] font-bold">
          維護紀錄（{records.length}）
        </h2>
        <Link
          href={`/admin/maintenance/${machineId}/records/new`}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
        >
          新增維護紀錄
        </Link>
      </div>
      <div className="mb-3">
        <ServiceTypeTabs
          machineId={machineId}
          current={activeType}
          counts={counts}
        />
      </div>
      <DataTable
        rows={visibleRecords}
        columns={columns}
        getKey={(r) => r.id}
        empty={
          activeType
            ? `沒有「${SERVICE_TYPE_LABELS[activeType]}」的維護紀錄。`
            : "尚無維護紀錄。"
        }
      />
    </div>
  );
}
