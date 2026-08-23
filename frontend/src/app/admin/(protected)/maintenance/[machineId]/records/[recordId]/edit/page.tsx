import { notFound } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getMachine } from "@/lib/admin/maintenance";
import {
  EditRecordForm,
  EditFilterRecordForm,
} from "@/components/admin/maintenance/EditRecordForm";
import { readRecordValues } from "@/lib/admin/maintenance-normalize";

export const metadata = { title: "編輯維護紀錄 · 後台" };

export default async function EditRecordPage({
  params,
}: {
  params: Promise<{ machineId: string; recordId: string }>;
}) {
  await requireRole(["office"]);
  const { machineId, recordId } = await params;
  const data = await getMachine(machineId);
  if (!data) notFound();
  const record = data.records.find((r) => r.id === recordId);
  if (!record) notFound();

  return (
    <div className="mx-auto max-w-[900px]">
      <h1 className="text-ink mb-6 text-[24px] font-bold">編輯維護紀錄</h1>
      {data.machine.card_type === "filter" ? (
        <EditFilterRecordForm
          machineId={machineId}
          recordId={recordId}
          columns={data.columns.map((c) => ({ id: c.id, label: c.label }))}
          values={{
            service_date: record.service_date ?? undefined,
            technician: record.technician ?? undefined,
            note: record.note ?? undefined,
            values: readRecordValues(record.values),
          }}
        />
      ) : (
        <EditRecordForm
          machineId={machineId}
          recordId={recordId}
          values={{
            service_date: record.service_date ?? undefined,
            hours: record.hours ?? undefined,
            oil: record.oil ?? undefined,
            oil_filter: record.oil_filter ?? undefined,
            air_filter: record.air_filter ?? undefined,
            oil_separator: record.oil_separator ?? undefined,
            inverter: record.inverter ?? undefined,
            filter_system: record.filter_system ?? undefined,
            technician: record.technician ?? undefined,
            note: record.note ?? undefined,
          }}
        />
      )}
    </div>
  );
}
