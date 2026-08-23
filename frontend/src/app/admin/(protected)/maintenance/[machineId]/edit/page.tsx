import { notFound } from "next/navigation";
import { requireRole } from "@/lib/admin/auth";
import { getMachine } from "@/lib/admin/maintenance";
import { EditMachineForm } from "@/components/admin/maintenance/EditMachineForm";

export const metadata = { title: "編輯保養卡 · 後台" };

export default async function EditMachinePage({
  params,
}: {
  params: Promise<{ machineId: string }>;
}) {
  await requireRole(["office"]);
  const { machineId } = await params;
  const data = await getMachine(machineId);
  if (!data) notFound();
  const { machine, customer, columns } = data;

  return (
    <div className="mx-auto max-w-[800px]">
      <h1 className="text-ink mb-6 text-[24px] font-bold">編輯保養卡</h1>
      <EditMachineForm
        machineId={machineId}
        cardType={machine.card_type}
        columns={columns.map((c) => ({ id: c.id, label: c.label }))}
        values={{
          customer_code: customer.code ?? undefined,
          customer_name: customer.name ?? undefined,
          serial_no: machine.serial_no ?? undefined,
          machine_no: machine.machine_no ?? undefined,
          location: machine.location ?? undefined,
          purchased_at: machine.purchased_at ?? undefined,
          model: machine.model ?? undefined,
          horsepower: machine.horsepower ?? undefined,
          voltage: machine.voltage ?? undefined,
          filter_spec: machine.filter_spec ?? undefined,
          drain_spec: machine.drain_spec ?? undefined,
        }}
      />
    </div>
  );
}
