import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getMachine } from "@/lib/admin/maintenance";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { DeleteButton } from "@/components/admin/DeleteButton";
import type { MxMachineColumn, MxRecord } from "@/lib/admin/maintenance";
import { readRecordValues } from "@/lib/admin/maintenance-normalize";
import { rocDate } from "@/lib/admin/minguo";
import { deleteRecordAction } from "../actions";

export const metadata = { title: "保養卡 · 後台" };

/** 空壓機卡的固定 9 欄。 */
function compressorColumns(): Column<MxRecord>[] {
  return [
    { header: "日期", cell: (r) => rocDate(r.service_date) },
    { header: "時數", cell: (r) => r.hours ?? "—" },
    { header: "專用油", cell: (r) => r.oil ?? "—" },
    { header: "機油濾", cell: (r) => r.oil_filter ?? "—" },
    { header: "空氣濾", cell: (r) => r.air_filter ?? "—" },
    { header: "油氣分離", cell: (r) => r.oil_separator ?? "—" },
    { header: "變頻器", cell: (r) => r.inverter ?? "—" },
    { header: "過濾系統", cell: (r) => r.filter_system ?? "—" },
    { header: "維護員", cell: (r) => r.technician ?? "—" },
  ];
}

/** 過濾卡：日期 + 依 mx_machine_columns 動態產生的耗材欄 + 維護員 + 備註。 */
function filterColumns(defs: MxMachineColumn[]): Column<MxRecord>[] {
  return [
    { header: "日期", cell: (r) => rocDate(r.service_date) },
    ...defs.map(
      (d): Column<MxRecord> => ({
        header: d.label,
        cell: (r) => readRecordValues(r.values)[d.id] ?? "—",
      }),
    ),
    { header: "維護員", cell: (r) => r.technician ?? "—" },
    { header: "備註", cell: (r) => r.note ?? "—" },
  ];
}

export default async function MachineDetailPage({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  await requireRole(["office"]);
  const { machineId } = await params;
  const data = await getMachine(machineId);
  if (!data) notFound();
  const { machine, customer, records, columns: columnDefs } = data;
  const isFilter = machine.card_type === "filter";

  const columns: Column<MxRecord>[] = [
    ...(isFilter ? filterColumns(columnDefs) : compressorColumns()),
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
          <span className="text-text-muted ml-2 text-[16px] font-normal">
            {customer.name}
          </span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="border-border text-text-muted inline-flex h-7 items-center rounded-full border px-3 text-[13px]">
            {isFilter ? "過濾系統（乾燥機）卡" : "空壓機卡"}
          </span>
          <Link
            href={`/admin/maintenance/${machineId}/edit`}
            className="border-border hover:bg-surface-muted inline-flex h-9 items-center rounded-lg border px-4 text-[14px] font-medium"
          >
            編輯基本資訊
          </Link>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-4">
        <div>
          <dt className="text-text-muted">機型</dt>
          <dd className="text-ink">{machine.model ?? "—"}</dd>
        </div>
        {!isFilter && (
          <>
            <div>
              <dt className="text-text-muted">馬力</dt>
              <dd className="text-ink">{machine.horsepower ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-text-muted">電壓</dt>
              <dd className="text-ink">{machine.voltage ?? "—"}</dd>
            </div>
          </>
        )}
        <div>
          <dt className="text-text-muted">使用地點</dt>
          <dd className="text-ink">{machine.location ?? "—"}</dd>
        </div>
        {!isFilter && (
          <div>
            <dt className="text-text-muted">購買時間</dt>
            <dd className="text-ink">{rocDate(machine.purchased_at)}</dd>
          </div>
        )}
        <div>
          <dt className="text-text-muted">客戶編號</dt>
          <dd className="text-ink">{customer.code ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-text-muted">機台編號</dt>
          <dd className="text-ink">{machine.machine_no ?? "—"}</dd>
        </div>
        {isFilter && (
          <>
            {/* 表頭的兩塊規格清單為多行原文，用 whitespace-pre-line 保留換行。 */}
            <div className="col-span-2">
              <dt className="text-text-muted">過濾器</dt>
              <dd className="text-ink whitespace-pre-line">
                {machine.filter_spec ?? "—"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-text-muted">排水器 / 馬達葉片</dt>
              <dd className="text-ink whitespace-pre-line">
                {machine.drain_spec ?? "—"}
              </dd>
            </div>
          </>
        )}
      </dl>

      <div className="mt-8 mb-4 flex items-center justify-between">
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
      {isFilter && columnDefs.length === 0 && (
        <p className="mb-3 text-[14px] text-amber-700">
          這張卡還沒有設定耗材欄位，請先到「編輯基本資訊」新增。
        </p>
      )}
      <DataTable
        rows={records}
        columns={columns}
        getKey={(r) => r.id}
        empty="尚無維護紀錄。"
      />
    </div>
  );
}
