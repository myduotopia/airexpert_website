"use client";
// 客戶新增／編輯表單（mx_customers，含 ERP 欄位；受控，錯誤時保留輸入）。
// 傳 onSaved 時為「就地新增」模式（建單頁 Dialog 內，#218）：只新增、不導頁不 refresh，
// 存檔後以新客戶的 Picker 選項回呼；取消改呼叫 onCancel；隱藏 ERP 啟用勾選（一律啟用）。
// 「業務」為員工選取器（#223）：從員工主檔選、可就地新增；舊資料只有文字時照常顯示。
// 文字欄位設定見 lib/erp/customer-form-fields（就地新增 Dialog 也有傳真、收信人，#248 N-4）。
import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomerInput } from "@/lib/erp/queries/master-data";
import { customerFormFields } from "@/lib/erp/customer-form-fields";
import type { CustomerOption } from "@/lib/erp/types";
import type { EmployeeOption } from "@/lib/employees/types";
import { EmployeePicker } from "@/components/erp/EmployeePicker";
import { ERP_AREA, ERP_INPUT } from "@/components/erp/styles";
import {
  Field,
  fieldErrorId,
  INPUT_INVALID,
} from "../../items/_components/master-ui";
import { createCustomerAction, updateCustomerAction } from "../actions";

export function CustomerForm({
  customerId,
  initial,
  employees,
  onEmployeeCreated,
  onSaved,
  onCancel,
}: {
  customerId?: string;
  initial: CustomerInput;
  /** 業務選取器選項（員工主檔，在職者）。 */
  employees: EmployeeOption[];
  /** 業務欄就地新增員工後通知父層（單據頁的業務欄共用新員工）。 */
  onEmployeeCreated?: (employee: EmployeeOption) => void;
  /** 就地新增：存檔成功後回呼（不導頁）。 */
  onSaved?: (id: string, option: CustomerOption) => void;
  /** 就地新增：取消鈕改呼叫此回呼。 */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const embedded = !!onSaved;
  const uid = useId();
  // Dialog 內欄位 id 加前綴，避免與單據頁其他欄位撞 id。
  const fid = (key: string) => (embedded ? `${uid}-${key}` : key);
  const [v, setV] = useState<CustomerInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 錯誤屬於某一欄（server 驗證回傳 field，例：Email 格式）→ 標在該欄（紅框＋欄下訊息），
  // 不在表單底部重複顯示（B-05）；其餘錯誤（DB、網路）仍顯示在底部。
  const [errorField, setErrorField] = useState<keyof CustomerInput | null>(
    null,
  );
  const cancelHref = customerId
    ? `/admin/erp/customers/${customerId}`
    : "/admin/erp/customers";

  function set<K extends keyof CustomerInput>(k: K, value: CustomerInput[K]) {
    setV((prev) => ({ ...prev, [k]: value }));
    // 修改出錯的欄位即清除該欄錯誤（重新儲存時再驗證）。
    if (k === errorField) {
      setError(null);
      setErrorField(null);
    }
  }

  function fail(message: string, field?: keyof CustomerInput) {
    // 該欄不在畫面上（例：就地新增 Dialog 未顯示的欄位）→ 改顯示在表單底部，避免訊息消失。
    const input = field ? document.getElementById(fid(field)) : null;
    setError(message);
    setErrorField(input ? field! : null);
    setBusy(false);
    // 表單較長時欄位可能在畫面外：聚焦（並捲動到）出錯的欄位。
    input?.focus();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError(null);
    setErrorField(null);
    try {
      if (onSaved) {
        const created = await createCustomerAction(v);
        if (!created.ok) {
          fail(created.error, created.field);
          return;
        }
        onSaved(created.id, created.option);
        return;
      }
      const res = customerId
        ? await updateCustomerAction(customerId, v)
        : await createCustomerAction(v);
      if (!res.ok) {
        fail(res.error, res.field);
        return;
      }
      router.push(`/admin/erp/customers/${res.id}`);
      router.refresh();
    } catch (err) {
      fail((err as Error)?.message || "儲存失敗，請確認網路後再試一次。");
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div
        className={
          embedded
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
            : "border-border grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2"
        }
      >
        {customerFormFields(embedded).map((f) =>
          f.key === "sales_rep" ? (
            <Field key={f.key} label={f.label} htmlFor={fid(f.key)}>
              <EmployeePicker
                id={fid(f.key)}
                role="sales"
                options={employees}
                value={{ id: v.sales_rep_id, name: v.sales_rep }}
                onChange={(next) =>
                  setV((prev) => ({
                    ...prev,
                    sales_rep: next.name ?? "",
                    sales_rep_id: next.id,
                  }))
                }
                allowCreate
                onOptionCreated={onEmployeeCreated}
              />
            </Field>
          ) : (
            <Field
              key={f.key}
              label={f.label}
              htmlFor={fid(f.key)}
              required={f.required}
              wide={f.wide}
              error={errorField === f.key ? error : null}
            >
              <input
                id={fid(f.key)}
                data-autofocus={
                  embedded && f.key === (v.code ? "name" : "code")
                    ? true
                    : undefined
                }
                type={f.type ?? "text"}
                inputMode={f.inputMode}
                className={`${ERP_INPUT} ${INPUT_INVALID}`}
                aria-invalid={errorField === f.key && error ? true : undefined}
                aria-describedby={
                  errorField === f.key && error
                    ? fieldErrorId(fid(f.key))
                    : undefined
                }
                value={v[f.key]}
                placeholder={f.placeholder}
                required={f.required}
                onChange={(e) => set(f.key, e.target.value)}
              />
            </Field>
          ),
        )}
        <Field label="備註" htmlFor={fid("note")} wide>
          <textarea
            id={fid("note")}
            rows={3}
            className={ERP_AREA}
            value={v.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        {!embedded && (
          <label className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={v.erp_active}
              onChange={(e) => set("erp_active", e.target.checked)}
            />
            ERP 啟用（停用後不出現在單據客戶選單；保養卡不受影響）
          </label>
        )}
      </div>

      {error && !errorField && (
        <p role="alert" className="text-[14px] text-red-600">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="bg-primary hover:bg-primary-deep h-11 rounded-lg px-6 text-[15px] font-semibold text-white disabled:opacity-50"
        >
          {busy ? "儲存中…" : "儲存"}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold disabled:opacity-50"
          >
            取消
          </button>
        ) : (
          <Link
            href={cancelHref}
            className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold"
          >
            取消
          </Link>
        )}
      </div>
    </form>
  );
}
