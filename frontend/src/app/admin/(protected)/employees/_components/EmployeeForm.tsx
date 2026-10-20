"use client";
// 員工新增／編輯表單（受控，錯誤時保留輸入）。
// 傳 onSaved 時為「就地新增」模式（單據／客戶／維護報告單頁的 Dialog 內，#223）：只新增、不導頁不 refresh，
// 存檔後以新員工的選取器選項回呼；取消改呼叫 onCancel；只顯示姓名、代號、角色、職務、備註（一律在職）。
// 離職日 ≤ 今天時「在職」強制取消（與 DB 觸發器 employees_left_on_active 一致）。
import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EMPLOYEE_CONTACT_MAX,
  EMPLOYEE_NAME_MAX,
  EMPLOYEE_ROLES,
  EMPLOYEE_ROLE_LABELS,
  EMPLOYEE_ROLE_USAGE,
  EMPLOYEE_SHORT_TEXT_MAX,
  type EmployeeInput,
  type EmployeeOption,
  type EmployeeRole,
} from "@/lib/employees/types";
import { taipeiToday } from "@/lib/employees/status";
import { ERP_AREA, ERP_INPUT } from "@/components/erp/styles";
import { Field } from "../../erp/items/_components/master-ui";
import { createEmployeeAction, updateEmployeeAction } from "../actions";

export function EmployeeForm({
  employeeId,
  initial,
  onSaved,
  onCancel,
}: {
  employeeId?: string;
  initial: EmployeeInput;
  /** 就地新增：存檔成功後回呼（不導頁）。 */
  onSaved?: (id: string, option: EmployeeOption) => void;
  /** 就地新增：取消鈕改呼叫此回呼。 */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const embedded = !!onSaved;
  const uid = useId();
  // Dialog 內欄位 id 加前綴，避免與單據頁其他欄位撞 id。
  const fid = (key: string) => (embedded ? `${uid}-${key}` : key);
  const [v, setV] = useState<EmployeeInput>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof EmployeeInput>(k: K, value: EmployeeInput[K]) {
    setV((prev) => ({ ...prev, [k]: value }));
  }

  function toggleRole(role: EmployeeRole, on: boolean) {
    setV((prev) => ({
      ...prev,
      roles: on
        ? [...prev.roles.filter((r) => r !== role), role]
        : prev.roles.filter((r) => r !== role),
    }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError(null);
    try {
      if (onSaved) {
        const created = await createEmployeeAction(v);
        if (!created.ok) {
          setError(created.error);
          setBusy(false);
          return;
        }
        onSaved(created.id, created.option);
        return;
      }
      const res = employeeId
        ? await updateEmployeeAction(employeeId, v)
        : await createEmployeeAction(v);
      if (!res.ok) {
        setError(res.error);
        setBusy(false);
        return;
      }
      router.push(
        employeeId ? `/admin/employees/${employeeId}` : "/admin/employees",
      );
      router.refresh();
    } catch (err) {
      setError((err as Error)?.message || "儲存失敗，請確認網路後再試一次。");
      setBusy(false);
    }
  }

  const departed = !!v.left_on && v.left_on <= taipeiToday();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div
        className={
          embedded
            ? "grid grid-cols-1 gap-4 sm:grid-cols-2"
            : "border-border grid grid-cols-1 gap-4 rounded-xl border bg-white p-5 sm:grid-cols-2"
        }
      >
        <Field label="姓名" htmlFor={fid("name")} required>
          <input
            id={fid("name")}
            data-autofocus={embedded && !v.code ? true : undefined}
            className={ERP_INPUT}
            value={v.name}
            maxLength={EMPLOYEE_NAME_MAX}
            onChange={(e) => set("name", e.target.value)}
            required
          />
        </Field>
        <Field
          label="員工代號"
          htmlFor={fid("code")}
          hint="選填；有填時不可重複。"
        >
          <input
            id={fid("code")}
            data-autofocus={embedded && !!v.code ? true : undefined}
            className={ERP_INPUT}
            value={v.code}
            placeholder="例：S01"
            onChange={(e) => set("code", e.target.value)}
          />
        </Field>
        <Field
          label="職務"
          htmlFor={fid("title")}
          hint="原文保存，供顯示與篩選（例：業務、服務、內勤）。"
        >
          <input
            id={fid("title")}
            className={ERP_INPUT}
            value={v.title}
            maxLength={EMPLOYEE_SHORT_TEXT_MAX}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        {!embedded && (
          <Field label="電話" htmlFor={fid("phone")} hint="存檔時去除空白。">
            <input
              id={fid("phone")}
              type="tel"
              className={ERP_INPUT}
              value={v.phone}
              maxLength={EMPLOYEE_SHORT_TEXT_MAX}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
        )}
        <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
          <legend className="text-ink mb-1.5 text-[14px] font-medium">
            角色
          </legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {EMPLOYEE_ROLES.map((role) => (
              <label key={role} className="flex items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={v.roles.includes(role)}
                  onChange={(e) => toggleRole(role, e.target.checked)}
                />
                {EMPLOYEE_ROLE_LABELS[role]}
              </label>
            ))}
          </div>
          <p className="text-text-muted text-[12px]">
            可複選；決定員工會出現在哪些選取器：
            {EMPLOYEE_ROLES.map(
              (r) => `${EMPLOYEE_ROLE_LABELS[r]} → ${EMPLOYEE_ROLE_USAGE[r]}`,
            ).join("；")}
            。未勾選任何角色的員工不會出現在選取器。
          </p>
        </fieldset>
        {!embedded && (
          <>
            <Field label="到職日" htmlFor={fid("hired_on")}>
              <input
                id={fid("hired_on")}
                type="date"
                className={ERP_INPUT}
                value={v.hired_on}
                onChange={(e) => set("hired_on", e.target.value)}
              />
            </Field>
            <Field
              label="離職日"
              htmlFor={fid("left_on")}
              hint="離職日到了（≤ 今天）就自動改為不在職，不再出現在選取器；舊單據上的姓名照常顯示。"
            >
              <input
                id={fid("left_on")}
                type="date"
                className={ERP_INPUT}
                value={v.left_on}
                min={v.hired_on || undefined}
                onChange={(e) => set("left_on", e.target.value)}
              />
            </Field>
            <Field
              label="緊急聯絡人"
              htmlFor={fid("emergency_contact")}
              wide
              hint="只填可公開給 ERP／維護報告單同仁看到的內容（例：姓名、關係、電話）；請勿填身份證號。舊系統的聯絡人原文另以加密保存，只有人事權限可看。"
            >
              <input
                id={fid("emergency_contact")}
                className={ERP_INPUT}
                value={v.emergency_contact}
                maxLength={EMPLOYEE_CONTACT_MAX}
                onChange={(e) => set("emergency_contact", e.target.value)}
              />
            </Field>
          </>
        )}
        <Field label="備註" htmlFor={fid("note")} wide>
          <textarea
            id={fid("note")}
            rows={embedded ? 2 : 3}
            className={ERP_AREA}
            value={v.note}
            onChange={(e) => set("note", e.target.value)}
          />
        </Field>
        {!embedded && (
          <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
            <input
              type="checkbox"
              checked={v.active && !departed}
              disabled={departed}
              onChange={(e) => set("active", e.target.checked)}
            />
            {departed
              ? "已離職（離職日已到；要復職請先清除離職日）"
              : "在職（停用後不出現在選單；既有客戶、單據與報告單照常顯示）"}
          </label>
        )}
      </div>

      {error && (
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
            href={
              employeeId ? `/admin/employees/${employeeId}` : "/admin/employees"
            }
            className="border-border hover:bg-surface-muted inline-flex h-11 items-center rounded-lg border px-6 text-[15px] font-semibold"
          >
            取消
          </Link>
        )}
      </div>
    </form>
  );
}
