"use client";
// 過濾（乾燥機）卡的維護紀錄欄位群。
// 固定欄：日期 / 服務類型 / 維護員 / 備註；中間的耗材欄由該張卡的
// mx_machine_columns 動態產生，
// input name 為 columnFieldName(column.id)（= `col_<uuid>`），與
// filterRecordPayloadFromForm() 的讀取端一致。
import type { ReactNode } from "react";
import { columnFieldName } from "@/lib/admin/maintenance-normalize";
import type { ServiceType } from "@/lib/admin/maintenance-service-type";
import { MinguoDateInput } from "./MinguoDateInput";
import { ServiceTypeSelect } from "./RecordForm";
import { PlainInput } from "./fields";

export interface FilterColumn {
  id: string;
  label: string;
}

export interface FilterRecordValues {
  service_date?: string;
  technician?: string;
  note?: string;
  /** 服務類型；未判定時為 undefined / null（下拉顯示「未判定」）。 */
  service_type?: ServiceType | null;
  /** { "<column_id>": "值" }，來自 mx_records.values。 */
  values?: Record<string, string>;
}

export function FilterRecordFields({
  columns,
  values,
}: {
  columns: FilterColumn[];
  values?: FilterRecordValues;
}): ReactNode {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="service_date"
          className="text-ink text-[14px] font-medium"
        >
          日期
        </label>
        <MinguoDateInput
          name="service_date"
          defaultIso={values?.service_date}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="service_type"
          className="text-ink text-[14px] font-medium"
        >
          服務類型
        </label>
        <ServiceTypeSelect initial={values?.service_type} />
      </div>
      {columns.map((c) => {
        const field = columnFieldName(c.id);
        return (
          <div key={c.id} className="flex flex-col gap-1.5">
            <label htmlFor={field} className="text-ink text-[14px] font-medium">
              {c.label}
            </label>
            <PlainInput name={field} initial={values?.values?.[c.id] ?? ""} />
          </div>
        );
      })}
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="technician"
          className="text-ink text-[14px] font-medium"
        >
          維護員
        </label>
        <PlainInput name="technician" initial={values?.technician ?? ""} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="note" className="text-ink text-[14px] font-medium">
          備註
        </label>
        <PlainInput name="note" initial={values?.note ?? ""} />
      </div>
      {columns.length === 0 && (
        <p className="text-[14px] text-amber-700 sm:col-span-2 lg:col-span-3">
          這張卡還沒有設定耗材欄位，請先到「編輯基本資訊」新增欄位。
        </p>
      )}
    </div>
  );
}
