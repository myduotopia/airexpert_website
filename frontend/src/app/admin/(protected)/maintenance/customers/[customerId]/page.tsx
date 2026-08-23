import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getCustomer } from "@/lib/admin/maintenance";
import type { MxCustomerMachine } from "@/lib/admin/maintenance";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { cardTypeLabel } from "@/lib/admin/maintenance-normalize";
import { rocDate, rocDateTime } from "@/lib/admin/minguo";

export const metadata = { title: "客戶 · 後台" };

/** 機台列表欄位。archived=true 時把「最後保養日」換成「封存時間」。 */
function machineColumns(archived: boolean): Column<MxCustomerMachine>[] {
  return [
    {
      header: "卡別",
      cell: (m) => (
        <span className="border-border text-text-muted inline-flex items-center rounded-full border px-2 py-0.5 text-[12px]">
          {cardTypeLabel(m.card_type)}
        </span>
      ),
    },
    {
      header: "機號",
      cell: (m) => (
        <Link
          href={`/admin/maintenance/${m.id}`}
          className="text-ink hover:text-primary-deep font-medium"
        >
          {m.serial_no}
        </Link>
      ),
    },
    { header: "機台編號", cell: (m) => m.machine_no ?? "—" },
    { header: "機型", cell: (m) => m.model ?? "—" },
    { header: "使用地點", cell: (m) => m.location ?? "—" },
    archived
      ? { header: "封存時間", cell: (m) => rocDateTime(m.archived_at) }
      : { header: "最後保養日", cell: (m) => rocDate(m.last_service_date) },
    {
      header: "",
      className: "text-right whitespace-nowrap",
      cell: (m) => (
        <Link
          href={`/admin/maintenance/${m.id}`}
          className="text-primary-deep hover:bg-surface-muted inline-flex h-9 items-center rounded-md px-3 text-[13px] font-medium"
        >
          進入卡片
        </Link>
      ),
    },
  ];
}

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  await requireRole(["office"]);
  const { customerId } = await params;
  const data = await getCustomer(customerId);
  if (!data) notFound();
  const { customer, active, archived } = data;

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="flex items-center justify-between gap-4">
        {/* 客戶名稱可能很長：左側允許縮到 0 並斷字，右側動作鈕不被壓縮。 */}
        <div className="min-w-0 break-words">
          <h1 className="text-ink text-[24px] font-bold">
            {customer.name}
            {customer.code && (
              <span className="text-text-muted ml-2 text-[16px] font-normal">
                {customer.code}
              </span>
            )}
          </h1>
          <p className="text-text-muted mt-1 text-[14px]">
            使用中機台 {active.length} 台，已封存 {archived.length} 台。
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/admin/maintenance/customers"
            className="border-border hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border px-4 text-[14px] font-semibold"
          >
            返回客戶列表
          </Link>
          <Link
            href={`/admin/maintenance/customers/${customerId}/edit`}
            className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white"
          >
            編輯
          </Link>
        </div>
      </div>

      {/* break-words：地址 / 備註 可能有超長不換行字串（網址等），避免撐破卡片。 */}
      <dl className="border-border mt-4 grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border bg-white p-5 text-[14px] break-words sm:grid-cols-4">
        <div>
          <dt className="text-text-muted">客戶編號</dt>
          <dd className="text-ink">{customer.code ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">客戶名稱</dt>
          <dd className="text-ink">{customer.name}</dd>
        </div>
        <div>
          <dt className="text-text-muted">聯絡人</dt>
          <dd className="text-ink">{customer.contact_person ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">電話</dt>
          <dd className="text-ink">{customer.phone ?? "—"}</dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-text-muted">地址</dt>
          <dd className="text-ink">{customer.address ?? "—"}</dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-text-muted">備註</dt>
          <dd className="text-ink whitespace-pre-wrap">
            {customer.note ?? "—"}
          </dd>
        </div>
        <div className="col-span-2 sm:col-span-4">
          <dt className="text-text-muted">最後更新</dt>
          <dd className="text-ink">{rocDateTime(customer.updated_at)}</dd>
        </div>
      </dl>

      <h2 className="text-ink mt-8 mb-4 text-[18px] font-bold">
        名下機台（{active.length}）
      </h2>
      <DataTable
        rows={active}
        columns={machineColumns(false)}
        getKey={(m) => m.id}
        empty="此客戶尚無使用中的機台。"
      />

      {archived.length > 0 && (
        <>
          <h2 className="text-ink mt-8 mb-4 text-[18px] font-bold">
            已封存機台（{archived.length}）
          </h2>
          <DataTable
            rows={archived}
            columns={machineColumns(true)}
            getKey={(m) => m.id}
            empty="無已封存機台。"
          />
        </>
      )}
    </div>
  );
}
