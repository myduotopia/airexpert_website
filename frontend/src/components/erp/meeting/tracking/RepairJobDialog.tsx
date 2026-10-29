"use client";
// 進廠維修新增／編輯 Dialog（#272）。父層只在開啟時渲染。處理進度另由 ProgressDialog 追加。
import { useMemo, useState, useTransition } from "react";
import { ErpDialog } from "@/components/erp/ErpDialog";
import { CustomerPicker } from "@/components/erp/CustomerPicker";
import { EmployeePicker } from "@/components/erp/EmployeePicker";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { ERP_AREA, ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import type { CustomerOption } from "@/lib/erp/types";
import type { EmployeeOption, EmployeeRef } from "@/lib/employees/types";
import { saveRepairJobAction } from "@/lib/erp/tracking/actions";
import {
  REPAIR_STATUSES,
  REPAIR_STATUS_LABELS,
  TRACKING_LIMITS,
  type RepairJobInput,
  type RepairJobRow,
} from "@/lib/erp/tracking/types";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  FormField,
  withCurrentCustomer,
} from "./ui";

export function RepairJobDialog({
  job,
  customers,
  employees,
  today,
  onClose,
  onSaved,
}: {
  job: RepairJobRow | null;
  customers: CustomerOption[];
  employees: EmployeeOption[];
  today: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState<string | null>(
    job?.customer_id ?? null,
  );
  const [receivedOn, setReceivedOn] = useState(job?.received_on ?? today);
  const [model, setModel] = useState(job?.model ?? "");
  const [description, setDescription] = useState(job?.description ?? "");
  const [owner, setOwner] = useState<EmployeeRef>({
    id: job?.owner_id ?? null,
    name: job?.owner_name ?? null,
  });
  const [status, setStatus] = useState<RepairJobInput["status"]>(
    job?.status ?? "pending",
  );
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<keyof RepairJobInput | null>(null);
  const [saving, startSaving] = useTransition();

  const customerOptions = useMemo(
    () =>
      withCurrentCustomer(
        customers,
        job
          ? {
              id: job.customer_id,
              code: job.customer_code,
              name: job.customer_name,
            }
          : null,
      ),
    [customers, job],
  );

  function submit() {
    setError(null);
    setField(null);
    startSaving(async () => {
      const res = await saveRepairJobAction(job?.id ?? null, {
        customer_id: customerId,
        received_on: receivedOn,
        model,
        description,
        owner_id: owner.id,
        status,
      });
      if (!res.ok) {
        setError(res.error);
        setField(res.field ?? null);
        return;
      }
      onSaved();
    });
  }

  const err = (f: keyof RepairJobInput) => (field === f ? error : null);

  return (
    <ErpDialog
      open
      onClose={onClose}
      title={job ? "編輯進廠維修" : "新增進廠維修"}
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
          htmlFor="rj-customer"
          required
          wide
          error={err("customer_id")}
        >
          <CustomerPicker
            id="rj-customer"
            options={customerOptions}
            value={customerId}
            onChange={(id) => setCustomerId(id)}
          />
        </FormField>
        <FormField
          label="進廠日期"
          htmlFor="rj-received"
          required
          error={err("received_on")}
        >
          <RocDateInput
            id="rj-received"
            value={receivedOn}
            onChange={setReceivedOn}
            aria-label="進廠日期"
          />
        </FormField>
        <FormField label="機型" htmlFor="rj-model" error={err("model")}>
          <input
            id="rj-model"
            className={ERP_INPUT}
            value={model}
            maxLength={TRACKING_LIMITS.model}
            onChange={(e) => setModel(e.target.value)}
          />
        </FormField>
        <FormField
          label="問題描述"
          htmlFor="rj-description"
          required
          wide
          error={err("description")}
        >
          <textarea
            id="rj-description"
            rows={3}
            className={ERP_AREA}
            value={description}
            maxLength={TRACKING_LIMITS.description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <FormField
          label="負責人"
          htmlFor="rj-owner"
          hint="選填；可依負責人篩選。"
          error={err("owner_id")}
        >
          <EmployeePicker
            id="rj-owner"
            role="technician"
            options={employees}
            value={owner}
            onChange={setOwner}
          />
        </FormField>
        <FormField label="狀態" htmlFor="rj-status" error={err("status")}>
          <select
            id="rj-status"
            className={ERP_SELECT}
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as RepairJobInput["status"])
            }
          >
            {REPAIR_STATUSES.map((s) => (
              <option key={s} value={s}>
                {REPAIR_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>
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
