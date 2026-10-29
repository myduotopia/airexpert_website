"use client";
// 交機進度新增／編輯 Dialog（#272）。父層只在開啟時渲染（每次開啟都是新的 state）。
// - 客戶：CustomerPicker；改客戶時清除連結單據並重新讀取該客戶的報價單／銷貨單；負責業務空白時帶入客戶預設業務。
// - 來源單據（選填）：選了之後，機器設備空白時帶入整機品項、負責業務空白時帶入單據業務。
// - 訂金：有連結單據時顯示自動判斷結果（可手動覆寫）；沒有連結單據時手動選擇（預設未收）。
// - 交機時間：起迄可只填一個（視為單日），都空白＝待確認。
import { useEffect, useMemo, useState, useTransition } from "react";
import { ErpDialog } from "@/components/erp/ErpDialog";
import { CustomerPicker } from "@/components/erp/CustomerPicker";
import { EmployeePicker } from "@/components/erp/EmployeePicker";
import { Combobox } from "@/components/erp/Combobox";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { ERP_AREA, ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import { formatMoney } from "@/lib/erp/format";
import type { CustomerOption } from "@/lib/erp/types";
import type { EmployeeOption, EmployeeRef } from "@/lib/employees/types";
import {
  loadDeliveryDocumentsAction,
  saveDeliveryJobAction,
} from "@/lib/erp/tracking/actions";
import { DEPOSIT_RULE_TEXT, resolveDeposit } from "@/lib/erp/tracking/deposit";
import { rocDate } from "@/lib/admin/minguo";
import {
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS,
  DEPOSIT_LABELS,
  TRACKING_LIMITS,
  type DeliveryDocumentOption,
  type DeliveryJobInput,
  type DeliveryJobRow,
  type DepositOverride,
} from "@/lib/erp/tracking/types";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  FormField,
  withCurrentCustomer,
} from "./ui";

const DOC_TYPE_LABEL = { Q: "報價單", S: "銷貨單" } as const;

function docLabel(d: DeliveryDocumentOption): string {
  const no = d.doc_no ?? "草稿";
  return `${DOC_TYPE_LABEL[d.doc_type]} ${no}`;
}

export function DeliveryJobDialog({
  job,
  customers,
  employees,
  onClose,
  onSaved,
}: {
  job: DeliveryJobRow | null;
  customers: CustomerOption[];
  employees: EmployeeOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [customerId, setCustomerId] = useState<string | null>(
    job?.customer_id ?? null,
  );
  const [documentId, setDocumentId] = useState<string | null>(
    job?.document_id ?? null,
  );
  const [override, setOverride] = useState<DepositOverride>(
    job?.deposit_override ?? null,
  );
  const [salesRep, setSalesRep] = useState<EmployeeRef>({
    id: job?.sales_rep_id ?? null,
    name: job?.sales_rep_name ?? null,
  });
  const [owner, setOwner] = useState<EmployeeRef>({
    id: job?.delivery_owner_id ?? null,
    name: job?.delivery_owner_name ?? null,
  });
  const [materials, setMaterials] = useState(job?.materials_confirmed ?? false);
  const [equipment, setEquipment] = useState(job?.equipment ?? "");
  const [start, setStart] = useState(job?.delivery_start ?? "");
  const [end, setEnd] = useState(job?.delivery_end ?? "");
  const [note, setNote] = useState(job?.note ?? "");
  const [status, setStatus] = useState<DeliveryJobInput["status"]>(
    job?.status ?? "in_progress",
  );
  const [error, setError] = useState<string | null>(null);
  const [field, setField] = useState<keyof DeliveryJobInput | null>(null);
  const [saving, startSaving] = useTransition();

  // 連結單據選項（依客戶讀取）；編輯時先以資料列上的數字顯示訂金判斷，讀完後更新。
  const [docs, setDocs] = useState<DeliveryDocumentOption[] | null>(null);
  const [prepaid, setPrepaid] = useState<number>(
    Number(job?.customer_prepaid) || 0,
  );
  const [docsError, setDocsError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!customerId || loadedFor === customerId) return;
    let cancelled = false;
    loadDeliveryDocumentsAction(customerId).then((res) => {
      if (cancelled) return;
      setLoadedFor(customerId);
      if (!res.ok) {
        setDocsError(res.error);
        setDocs([]);
        return;
      }
      setDocsError(null);
      setDocs(res.data.documents);
      setPrepaid(res.data.customerPrepaid);
    });
    return () => {
      cancelled = true;
    };
  }, [customerId, loadedFor]);

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

  // 編輯時，連結的單據可能已不在選項（例如已作廢）：補一個項目，名稱照常顯示。
  const docOptions = useMemo(() => {
    const list = docs ?? [];
    if (
      job?.document_id &&
      job.document_id === documentId &&
      !list.some((d) => d.id === job.document_id)
    ) {
      return [
        {
          id: job.document_id,
          customer_id: job.customer_id,
          doc_type: job.doc_type ?? "Q",
          doc_no: job.doc_no,
          doc_date: "",
          status: "posted" as const,
          total_twd: 0,
          sales_rep_id: null,
          sales_rep: null,
          linked_allocated: Number(job.linked_allocated) || 0,
          machine_items: [],
        },
        ...list,
      ];
    }
    return list;
  }, [docs, job, documentId]);

  const selectedDoc = docOptions.find((d) => d.id === documentId) ?? null;
  const deposit = resolveDeposit(override, {
    hasDocument: documentId !== null,
    linkedAllocated: selectedDoc?.linked_allocated ?? 0,
    customerPrepaid: prepaid,
  });
  const autoLabel = deposit.auto === null ? null : DEPOSIT_LABELS[deposit.auto];

  function onCustomerChange(id: string | null, c: CustomerOption | null) {
    setCustomerId(id);
    setDocumentId(null);
    setDocs(null);
    setPrepaid(0);
    if (!salesRep.id && !salesRep.name && c?.sales_rep_id) {
      setSalesRep({ id: c.sales_rep_id, name: c.sales_rep });
    }
  }

  function onDocumentChange(
    id: string | null,
    d: DeliveryDocumentOption | null,
  ) {
    setDocumentId(id);
    if (!d) return;
    if (!equipment.trim() && d.machine_items.length > 0) {
      setEquipment(d.machine_items.join("、"));
    }
    if (!salesRep.id && !salesRep.name && d.sales_rep_id) {
      setSalesRep({ id: d.sales_rep_id, name: d.sales_rep });
    }
  }

  function submit() {
    setError(null);
    setField(null);
    const input: DeliveryJobInput = {
      customer_id: customerId,
      document_id: documentId,
      deposit_override: override,
      sales_rep_id: salesRep.id,
      delivery_owner_id: owner.id,
      materials_confirmed: materials,
      equipment,
      delivery_start: start,
      delivery_end: end,
      note,
      status,
    };
    startSaving(async () => {
      const res = await saveDeliveryJobAction(job?.id ?? null, input);
      if (!res.ok) {
        setError(res.error);
        setField(res.field ?? null);
        return;
      }
      onSaved();
    });
  }

  const err = (f: keyof DeliveryJobInput) => (field === f ? error : null);

  return (
    <ErpDialog
      open
      onClose={onClose}
      title={job ? "編輯交機進度" : "新增交機進度"}
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
          htmlFor="dj-customer"
          required
          wide
          error={err("customer_id")}
        >
          <CustomerPicker
            id="dj-customer"
            options={customerOptions}
            value={customerId}
            onChange={onCustomerChange}
          />
        </FormField>

        <FormField
          label="來源報價單／銷貨單"
          htmlFor="dj-document"
          wide
          hint={
            docsError ??
            (customerId
              ? docs === null
                ? "讀取單據中…"
                : "選填。選了之後，機器設備空白時會帶入整機品項。"
              : "請先選擇客戶。")
          }
          error={err("document_id")}
        >
          <Combobox
            id="dj-document"
            options={docOptions}
            value={documentId}
            onChange={onDocumentChange}
            disabled={!customerId}
            aria-label="來源單據"
            placeholder="搜尋單號（選填）"
            getLabel={docLabel}
            getSearchText={(d) =>
              `${d.doc_no ?? "草稿"} ${DOC_TYPE_LABEL[d.doc_type]}`
            }
            renderOption={(d) => (
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate">
                  {docLabel(d)}
                  {d.status === "draft" && (
                    <span className="text-text-muted text-[12px]">
                      {" "}
                      （草稿）
                    </span>
                  )}
                </span>
                <span className="text-text-muted shrink-0 text-[12px]">
                  {d.doc_date ? rocDate(d.doc_date) : ""}{" "}
                  {d.total_twd ? `$${formatMoney(d.total_twd)}` : ""}
                </span>
              </span>
            )}
          />
        </FormField>

        <FormField
          label="訂金"
          htmlFor="dj-deposit"
          wide
          error={err("deposit_override")}
          hint={
            <>
              <span
                className={deposit.status === "received" ? "" : "text-red-600"}
              >
                目前：{DEPOSIT_LABELS[deposit.status]}（{deposit.reason}）
              </span>
              <br />
              {DEPOSIT_RULE_TEXT}
            </>
          }
        >
          <select
            id="dj-deposit"
            className={ERP_SELECT}
            value={override ?? ""}
            onChange={(e) =>
              setOverride((e.target.value || null) as DepositOverride)
            }
          >
            {documentId ? (
              <>
                <option value="">自動判斷（目前：{autoLabel}）</option>
                <option value="received">手動：已收</option>
                <option value="not_received">手動：未收</option>
              </>
            ) : (
              <>
                <option value="">未收</option>
                <option value="received">已收</option>
                {override === "not_received" && (
                  <option value="not_received">未收（手動）</option>
                )}
              </>
            )}
          </select>
        </FormField>

        <FormField
          label="負責業務"
          htmlFor="dj-sales"
          error={err("sales_rep_id")}
        >
          <EmployeePicker
            id="dj-sales"
            role="sales"
            options={employees}
            value={salesRep}
            onChange={setSalesRep}
          />
        </FormField>
        <FormField
          label="交機負責人"
          htmlFor="dj-owner"
          hint="未指定＝待確認。"
          error={err("delivery_owner_id")}
        >
          <EmployeePicker
            id="dj-owner"
            role="technician"
            options={employees}
            value={owner}
            onChange={setOwner}
          />
        </FormField>

        <FormField
          label="機器設備"
          htmlFor="dj-equipment"
          wide
          error={err("equipment")}
        >
          <input
            id="dj-equipment"
            className={ERP_INPUT}
            value={equipment}
            maxLength={TRACKING_LIMITS.equipment}
            onChange={(e) => setEquipment(e.target.value)}
          />
        </FormField>

        <FormField
          label="交機時間（起）"
          htmlFor="dj-start"
          error={err("delivery_start")}
          hint="起迄都空白＝待確認；只填一個視為單日。"
        >
          <RocDateInput
            id="dj-start"
            value={start}
            onChange={setStart}
            aria-label="交機時間（起）"
          />
        </FormField>
        <FormField
          label="交機時間（迄）"
          htmlFor="dj-end"
          error={err("delivery_end")}
        >
          <RocDateInput
            id="dj-end"
            value={end}
            onChange={setEnd}
            aria-label="交機時間（迄）"
          />
        </FormField>

        <FormField label="注意事項" htmlFor="dj-note" wide error={err("note")}>
          <textarea
            id="dj-note"
            rows={2}
            className={ERP_AREA}
            value={note}
            maxLength={TRACKING_LIMITS.note}
            placeholder="例：後處理設備未交"
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>

        <FormField label="狀態" htmlFor="dj-status" error={err("status")}>
          <select
            id="dj-status"
            className={ERP_SELECT}
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as DeliveryJobInput["status"])
            }
          >
            {DELIVERY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {DELIVERY_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={materials}
              onChange={(e) => setMaterials(e.target.checked)}
            />
            材料已確認
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
