"use client";
// 維護紀錄一列的欄位群。可獨立提交（新增/編輯列），或被 ImportReview 逐列內嵌。
import type { ReactNode } from "react";
import { MinguoDateInput } from "./MinguoDateInput";
import { PlainInput, PlainSelect } from "./fields";
import {
  SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  UNCLASSIFIED_LABEL,
  type ServiceType,
} from "@/lib/admin/maintenance-service-type";

export interface RecordValues {
  service_date?: string;
  hours?: string;
  oil?: string;
  oil_filter?: string;
  air_filter?: string;
  oil_separator?: string;
  inverter?: string;
  filter_system?: string;
  technician?: string;
  note?: string;
  /** 服務類型；未判定時為 undefined（下拉顯示「未判定」）。 */
  service_type?: ServiceType | null;
}

/** 純文字（含日期）欄位名；service_type 不在其中，另以下拉呈現。 */
export type TextFieldName = Exclude<keyof RecordValues, "service_type">;

/**
 * 服務類型下拉（受控）。新增／編輯／匯入核對三處共用。
 * name 可帶前綴（匯入核對頁一列一組欄位，見 ImportReview 的 rf()）。
 */
export function ServiceTypeSelect({
  name = "service_type",
  initial,
}: {
  name?: string;
  initial?: ServiceType | null;
}): ReactNode {
  return (
    <PlainSelect name={name} initial={initial ?? ""}>
      <option value="">{UNCLASSIFIED_LABEL}</option>
      {SERVICE_TYPES.map((t) => (
        <option key={t} value={t}>
          {SERVICE_TYPE_LABELS[t]}
        </option>
      ))}
    </PlainSelect>
  );
}

// service_date 改用民國日期輸入（roc）；service_type 另以下拉呈現；其餘為一般文字欄。
const FIELDS: { name: TextFieldName; label: string; roc?: boolean }[] = [
  { name: "service_date", label: "日期", roc: true },
  { name: "hours", label: "時數" },
  { name: "oil", label: "專用油" },
  { name: "oil_filter", label: "機油濾清器" },
  { name: "air_filter", label: "空氣濾清器" },
  { name: "oil_separator", label: "油氣分離器" },
  { name: "inverter", label: "變頻器" },
  { name: "filter_system", label: "過濾系統" },
  { name: "technician", label: "維護員" },
  { name: "note", label: "備註" },
];

export function RecordFields({ values }: { values?: RecordValues }): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="service_type"
          className="text-ink text-[14px] font-medium"
        >
          服務類型
        </label>
        <ServiceTypeSelect initial={values?.service_type} />
      </div>
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={f.name} className="text-ink text-[14px] font-medium">
            {f.label}
          </label>
          {f.roc ? (
            <MinguoDateInput name={f.name} defaultIso={values?.[f.name]} />
          ) : (
            <PlainInput name={f.name} initial={values?.[f.name] ?? ""} />
          )}
        </div>
      ))}
    </div>
  );
}
