"use client";
// 單據表頭欄位（受控）：依單別顯示客戶 / 廠商、日期、倉庫、稅別、幣別匯率、發票號碼、業務、備註。
// 選客戶自動帶入業務（若尚未填）；選廠商自動帶入幣別。純呈現元件，不讀 DB、不送出。
// allowCreate：客戶／廠商／倉庫找不到時可就地新增（#218），新對象自動選取並走同一個 onChange。
// 業務（#223）：從員工主檔選取（姓名快照 + sales_rep_id），客戶單據一律可就地新增業務；
// 舊單據只有文字時照常顯示。就地新增的員工在「業務」欄與「新增客戶」Dialog 的業務欄間共用。
import type { ReactNode } from "react";
import type { EmployeeOption } from "@/lib/employees/types";
import { salesRepFromCustomer } from "@/lib/erp/draft";
import type {
  CustomerOption,
  DocType,
  DraftDocumentHeader,
  TaxType,
  VendorOption,
  WarehouseOption,
} from "@/lib/erp/types";
import { CustomerPicker } from "./CustomerPicker";
import { EmployeePicker } from "./EmployeePicker";
import { NumberInput } from "./NumberInput";
import { RocDateInput } from "./RocDateInput";
import { VendorPicker } from "./VendorPicker";
import { WarehousePicker } from "./WarehousePicker";
import { useAddedOptions } from "./useAddedOptions";
import { ERP_AREA, ERP_INPUT, ERP_LABEL, ERP_SELECT } from "./styles";

const CUSTOMER_DOCS: DocType[] = ["Q", "S", "SR"];
const VENDOR_DOCS: DocType[] = ["P", "I", "PR"];
const TAXED_DOCS: DocType[] = ["Q", "P", "I", "PR", "S", "SR"];
const INVOICE_DOCS: DocType[] = ["I", "PR", "S", "SR"];
const WAREHOUSE_LABEL: Partial<Record<DocType, string>> = {
  I: "入庫倉",
  SR: "入庫倉",
  S: "出庫倉",
  PR: "出庫倉",
  T: "來源倉",
  A: "倉庫",
};
const EXPECTED_DATE_LABEL: Partial<Record<DocType, string>> = {
  P: "交貨日期",
  Q: "報價有效期限",
};

const TAX_OPTIONS: { value: TaxType; label: string }[] = [
  { value: "excluded", label: "外加稅" },
  { value: "included", label: "內含稅" },
  { value: "exempt", label: "免稅" },
];

export interface DocumentHeaderFieldsProps {
  value: DraftDocumentHeader;
  onChange: (next: DraftDocumentHeader) => void;
  customers?: CustomerOption[];
  vendors?: VendorOption[];
  warehouses?: WarehouseOption[];
  /** 業務選取器選項（員工主檔，在職者；客戶單據用）。 */
  employees?: EmployeeOption[];
  disabled?: boolean;
  /** 允許就地新增的欄位（#218）；未列出者維持只能選既有項目。 */
  allowCreate?: { customer?: boolean; vendor?: boolean; warehouse?: boolean };
}

const NO_CREATE: NonNullable<DocumentHeaderFieldsProps["allowCreate"]> = {};
const NO_WAREHOUSES: WarehouseOption[] = [];
const NO_EMPLOYEES: EmployeeOption[] = [];

export function DocumentHeaderFields({
  value,
  onChange,
  customers = [],
  vendors = [],
  warehouses = NO_WAREHOUSES,
  employees = NO_EMPLOYEES,
  disabled,
  allowCreate = NO_CREATE,
}: DocumentHeaderFieldsProps) {
  const t = value.doc_type;
  // 調撥單來源倉與目的倉共用就地新增的倉庫。
  const [allWarehouses, addWarehouse] = useAddedOptions(warehouses);
  // 業務欄與「新增客戶」Dialog 的業務欄共用就地新增的員工。
  const [allEmployees, addEmployee] = useAddedOptions(employees);
  const set = (patch: Partial<DraftDocumentHeader>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CUSTOMER_DOCS.includes(t) && (
        <Field label="客戶" required htmlFor="erp-customer">
          <CustomerPicker
            id="erp-customer"
            options={customers}
            value={value.customer_id ?? null}
            disabled={disabled}
            allowCreate={!!allowCreate.customer}
            employees={allEmployees}
            onEmployeeCreated={addEmployee}
            onChange={(id, c) =>
              set({
                customer_id: id,
                ...salesRepFromCustomer(value, c),
              })
            }
          />
        </Field>
      )}
      {VENDOR_DOCS.includes(t) && (
        <Field label="廠商" required htmlFor="erp-vendor">
          <VendorPicker
            id="erp-vendor"
            options={vendors}
            value={value.vendor_id ?? null}
            disabled={disabled}
            allowCreate={!!allowCreate.vendor}
            onChange={(id, v) => {
              const currency = v?.currency || value.currency;
              set({
                vendor_id: id,
                currency,
                exchange_rate:
                  currency === "TWD" ? 1 : value.exchange_rate || 1,
              });
            }}
          />
        </Field>
      )}

      <Field label="單據日期" required htmlFor="erp-doc-date">
        <RocDateInput
          id="erp-doc-date"
          value={value.doc_date}
          disabled={disabled}
          onChange={(iso) => set({ doc_date: iso })}
        />
      </Field>

      {EXPECTED_DATE_LABEL[t] && (
        <Field label={EXPECTED_DATE_LABEL[t]!} htmlFor="erp-expected-date">
          <RocDateInput
            id="erp-expected-date"
            value={value.expected_date ?? ""}
            disabled={disabled}
            onChange={(iso) => set({ expected_date: iso || null })}
          />
        </Field>
      )}

      {WAREHOUSE_LABEL[t] && (
        <Field
          label={WAREHOUSE_LABEL[t]!}
          required={t === "T"}
          htmlFor="erp-warehouse"
        >
          <WarehousePicker
            id="erp-warehouse"
            options={allWarehouses}
            value={value.warehouse_id ?? null}
            disabled={disabled}
            allowCreate={!!allowCreate.warehouse}
            onOptionCreated={addWarehouse}
            onChange={(id) => set({ warehouse_id: id })}
          />
        </Field>
      )}
      {t === "T" && (
        <Field label="目的倉" required htmlFor="erp-to-warehouse">
          <WarehousePicker
            id="erp-to-warehouse"
            options={allWarehouses}
            value={value.to_warehouse_id ?? null}
            excludeId={value.warehouse_id}
            disabled={disabled}
            allowCreate={!!allowCreate.warehouse}
            onOptionCreated={addWarehouse}
            onChange={(id) => set({ to_warehouse_id: id })}
          />
        </Field>
      )}

      {TAXED_DOCS.includes(t) && (
        <>
          <Field label="稅別" htmlFor="erp-tax-type">
            <select
              id="erp-tax-type"
              value={value.tax_type}
              disabled={disabled}
              onChange={(e) => set({ tax_type: e.target.value as TaxType })}
              className={ERP_SELECT}
            >
              {TAX_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          {value.tax_type !== "exempt" && (
            <Field label="稅率（%）" htmlFor="erp-tax-rate">
              <NumberInput
                id="erp-tax-rate"
                value={Math.round(value.tax_rate * 10000) / 100}
                decimals={2}
                disabled={disabled}
                onChange={(n) => set({ tax_rate: Math.round(n * 100) / 10000 })}
              />
            </Field>
          )}
        </>
      )}

      {VENDOR_DOCS.includes(t) && (
        <>
          <Field label="幣別" htmlFor="erp-currency">
            <input
              id="erp-currency"
              type="text"
              value={value.currency}
              disabled={disabled}
              maxLength={3}
              onChange={(e) => {
                const currency = e.target.value.toUpperCase();
                set({
                  currency,
                  exchange_rate: currency === "TWD" ? 1 : value.exchange_rate,
                });
              }}
              className={ERP_INPUT}
            />
          </Field>
          {value.currency !== "TWD" && (
            <Field label="匯率" htmlFor="erp-exchange-rate">
              <NumberInput
                id="erp-exchange-rate"
                value={value.exchange_rate}
                decimals={6}
                disabled={disabled}
                onChange={(n) => set({ exchange_rate: n })}
              />
            </Field>
          )}
        </>
      )}

      {INVOICE_DOCS.includes(t) && (
        <Field label="發票號碼" htmlFor="erp-invoice-no">
          <input
            id="erp-invoice-no"
            type="text"
            value={value.invoice_no ?? ""}
            disabled={disabled}
            onChange={(e) => set({ invoice_no: e.target.value })}
            className={ERP_INPUT}
          />
        </Field>
      )}

      {CUSTOMER_DOCS.includes(t) && (
        <Field label="業務" htmlFor="erp-sales-rep">
          <EmployeePicker
            id="erp-sales-rep"
            role="sales"
            options={allEmployees}
            value={{
              id: value.sales_rep_id ?? null,
              name: value.sales_rep ?? null,
            }}
            disabled={disabled}
            allowCreate
            onOptionCreated={addEmployee}
            onChange={(next) =>
              set({ sales_rep: next.name, sales_rep_id: next.id })
            }
          />
        </Field>
      )}

      <div className="sm:col-span-2 lg:col-span-3">
        <Field label="備註" htmlFor="erp-note">
          <textarea
            id="erp-note"
            rows={2}
            value={value.note ?? ""}
            disabled={disabled}
            onChange={(e) => set({ note: e.target.value })}
            className={ERP_AREA}
          />
        </Field>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className={ERP_LABEL}>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
