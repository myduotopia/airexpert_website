"use client";
// 新機問題新增／編輯 Dialog（#272）。父層只在開啟時渲染。
// - 機台（選填）：選客戶後讀取該客戶的機台（保養卡 mx_machines）；選了機台就帶入機型與交機日期（購買日期）。
// - 重點追蹤：清單與列印以醒目底色顯示。
import { useEffect, useMemo, useState, useTransition } from "react";
import { ErpDialog } from "@/components/erp/ErpDialog";
import { CustomerPicker } from "@/components/erp/CustomerPicker";
import { EmployeePicker } from "@/components/erp/EmployeePicker";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { ERP_AREA, ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import { rocDate } from "@/lib/admin/minguo";
import type { CustomerOption } from "@/lib/erp/types";
import type { EmployeeOption, EmployeeRef } from "@/lib/employees/types";
import {
  loadCustomerMachinesAction,
  saveMachineIssueAction,
} from "@/lib/erp/tracking/actions";
import {
  MACHINE_ISSUE_STATUSES,
  MACHINE_ISSUE_STATUS_LABELS,
  TRACKING_LIMITS,
  type MachineIssueInput,
  type MachineIssueRow,
  type MachineOption,
} from "@/lib/erp/tracking/types";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  FormField,
  withCurrentCustomer,
} from "./ui";

function machineLabel(m: MachineOption): string {
  return [m.serial_no, m.model].filter(Boolean).join("　");
}

export function MachineIssueDialog({
  issue,
  customers,
  employees,
  today,
  onClose,
  onSaved,
}: {
  issue: MachineIssueRow | null;
  customers: CustomerOption[];
  employees: EmployeeOption[];
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState<string | null>(
    issue?.customer_id ?? null,
  );
  const [machineId, setMachineId] = useState<string | null>(
    issue?.machine_id ?? null,
  );
  const [model, setModel] = useState(issue?.model ?? "");
  const [deliveredOn, setDeliveredOn] = useState(issue?.delivered_on ?? "");
  const [description, setDescription] = useState(issue?.description ?? "");
  const [occurredOn, setOccurredOn] = useState(issue?.occurred_on ?? today);
  const [owner, setOwner] = useState<EmployeeRef>({
    id: issue?.owner_id ?? null,
    name: issue?.owner_name ?? null,
  });
  const [status, setStatus] = useState<MachineIssueInput["status"]>(
    issue?.status ?? "handling",
  );
  const [isKey, setIsKey] = useState(issue?.is_key ?? false);
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<keyof MachineIssueInput | null>(null);
  const [saving, startSaving] = useTransition();

  const [machines, setMachines] = useState<MachineOption[] | null>(null);
  const [machinesError, setMachinesError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId || loadedFor === customerId) return;
    let cancelled = false;
    loadCustomerMachinesAction(customerId).then((res) => {
      if (cancelled) return;
      setLoadedFor(customerId);
      if (res.ok) {
        setMachines(res.data);
        setMachinesError(null);
      } else {
        setMachines([]);
        setMachinesError(res.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [customerId, loadedFor]);

  const customerOptions = useMemo(
    () =>
      withCurrentCustomer(
        customers,
        issue
          ? {
              id: issue.customer_id,
              code: issue.customer_code,
              name: issue.customer_name,
            }
          : null,
      ),
    [customers, issue],
  );

  // 已封存的機台不在選項中：編輯時補上目前值。
  const machineOptions = useMemo(() => {
    const list = machines ?? [];
    if (
      issue?.machine_id &&
      issue.machine_id === machineId &&
      !list.some((m) => m.id === issue.machine_id)
    ) {
      return [
        {
          id: issue.machine_id,
          serial_no: issue.machine_serial_no ?? "（已封存機台）",
          model: issue.model,
          purchased_at: issue.delivered_on,
        },
        ...list,
      ];
    }
    return list;
  }, [machines, issue, machineId]);

  function onCustomerChange(id: string | null) {
    setCustomerId(id);
    setMachineId(null);
    setMachines(null);
  }

  function onMachineChange(id: string) {
    const m = machineOptions.find((x) => x.id === id) ?? null;
    setMachineId(m ? m.id : null);
    if (m?.model) setModel(m.model);
    if (m?.purchased_at) setDeliveredOn(m.purchased_at);
  }

  function submit() {
    setError(null);
    setField(null);
    startSaving(async () => {
      const res = await saveMachineIssueAction(issue?.id ?? null, {
        customer_id: customerId,
        machine_id: machineId,
        model,
        delivered_on: deliveredOn,
        description,
        occurred_on: occurredOn,
        owner_id: owner.id,
        status,
        is_key: isKey,
      });
      if (!res.ok) {
        setError(res.error);
        setField(res.field ?? null);
        return;
      }
      onSaved();
    });
  }

  const err = (f: keyof MachineIssueInput) => (field === f ? error : null);

  return (
    <ErpDialog
      open
      onClose={onClose}
      title={issue ? "編輯新機問題" : "新增新機問題"}
      size="lg"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
      >
        <FormField
          label="客戶"
          htmlFor="mi-customer"
          required
          wide
          error={err("customer_id")}
        >
          <CustomerPicker
            id="mi-customer"
            options={customerOptions}
            value={customerId}
            onChange={(id) => onCustomerChange(id)}
          />
        </FormField>
        <FormField
          label="機台"
          htmlFor="mi-machine"
          wide
          error={err("machine_id")}
          hint={
            machinesError ??
            (customerId
              ? machines === null
                ? "讀取機台中…"
                : "選填。選了之後帶入機型與交機日期（保養卡購買日期）。"
              : "請先選擇客戶。")
          }
        >
          <select
            id="mi-machine"
            className={ERP_SELECT}
            value={machineId ?? ""}
            disabled={!customerId}
            onChange={(e) => onMachineChange(e.target.value)}
          >
            <option value="">（不指定機台）</option>
            {machineOptions.map((m) => (
              <option key={m.id} value={m.id}>
                {machineLabel(m)}
                {m.purchased_at ? `（${rocDate(m.purchased_at)}）` : ""}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="機型" htmlFor="mi-model" error={err("model")}>
          <input
            id="mi-model"
            className={ERP_INPUT}
            value={model}
            maxLength={TRACKING_LIMITS.model}
            onChange={(e) => setModel(e.target.value)}
          />
        </FormField>
        <FormField
          label="交機日期"
          htmlFor="mi-delivered"
          error={err("delivered_on")}
        >
          <RocDateInput
            id="mi-delivered"
            value={deliveredOn}
            onChange={setDeliveredOn}
            aria-label="交機日期"
          />
        </FormField>
        <FormField
          label="問題描述"
          htmlFor="mi-description"
          required
          wide
          error={err("description")}
        >
          <textarea
            id="mi-description"
            rows={3}
            className={ERP_AREA}
            value={description}
            maxLength={TRACKING_LIMITS.description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField
          label="發生日期"
          htmlFor="mi-occurred"
          required
          error={err("occurred_on")}
        >
          <RocDateInput
            id="mi-occurred"
            value={occurredOn}
            onChange={setOccurredOn}
            aria-label="發生日期"
          />
        </FormField>
        <FormField label="負責人" htmlFor="mi-owner" error={err("owner_id")}>
          <EmployeePicker
            id="mi-owner"
            role="technician"
            options={employees}
            value={owner}
            onChange={setOwner}
          />
        </FormField>
        <FormField label="狀態" htmlFor="mi-status" error={err("status")}>
          <select
            id="mi-status"
            className={ERP_SELECT}
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as MachineIssueInput["status"])
            }
          >
            {MACHINE_ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {MACHINE_ISSUE_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={isKey}
              onChange={(e) => setIsKey(e.target.checked)}
            />
            重點追蹤（報表以醒目底色顯示）
          </label>
        </div>
        {error && !field && (
          <p role="alert" className="text-[14px] text-red-600 sm:col-span-2">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <button type="button" className={BTN_SECONDARY} onClick={onClose}>
            取消
          </button>
          <button type="submit" className={BTN_PRIMARY} disabled={saving}>
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </form>
    </ErpDialog>
  );
}
