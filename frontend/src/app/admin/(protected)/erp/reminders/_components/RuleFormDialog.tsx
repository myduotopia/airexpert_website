"use client";
// 提醒規則新增／編輯（#274）：頁內 Dialog。新增一律為手動規則；由備註產生（auto）的規則可改事項、日期、
// 提前天數等，但對象固定、不可改成單次。存檔後 router.refresh() 重讀清單。
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ErpDialog } from "@/components/erp/ErpDialog";
import { RocDateInput } from "@/components/erp/RocDateInput";
import { VendorPicker } from "@/components/erp/VendorPicker";
import { ERP_AREA, ERP_INPUT, ERP_SELECT } from "@/components/erp/styles";
import {
  RULE_KINDS,
  type ReminderRuleInput,
  type RuleInputField,
} from "@/lib/erp/reminders/rule-input";
import { WEEKDAY_LABEL } from "@/lib/erp/reminders/schedule";
import type { VendorOption } from "@/lib/erp/types";
import {
  Field,
  fieldErrorId,
  INPUT_INVALID,
} from "../../items/_components/master-ui";
import { saveReminderRuleAction } from "../actions";
import { BTN_PRIMARY, BTN_SECONDARY } from "./ui";

export interface RuleFormTarget {
  /** null = 新增。 */
  ruleId: string | null;
  initial: ReminderRuleInput;
  source: "auto" | "manual";
  sourceText?: string | null;
}

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export function RuleFormDialog({
  target,
  onClose,
  vendorOptions,
  fixedVendorName,
}: {
  /** null = 關閉。 */
  target: RuleFormTarget | null;
  onClose: () => void;
  /** 可選對象（全部規則、待確認頁）；未傳時對象固定為 initial.vendor_id（廠商詳情頁）。 */
  vendorOptions?: VendorOption[];
  /** 對象固定時顯示的名稱。 */
  fixedVendorName?: string | null;
}) {
  return (
    <ErpDialog
      open={target !== null}
      onClose={onClose}
      title={target?.ruleId ? "編輯提醒規則" : "新增提醒規則"}
      description={
        target?.source === "auto"
          ? "此規則由廠商備註自動產生：可修改內容，備註改變時只會更新原文，不會覆蓋你的修改。"
          : "手動規則不會被廠商備註的同步改動。"
      }
      size="lg"
    >
      {target && (
        <RuleForm
          // 換目標時重設表單
          key={target.ruleId ?? "new"}
          target={target}
          onClose={onClose}
          vendorOptions={vendorOptions}
          fixedVendorName={fixedVendorName}
        />
      )}
    </ErpDialog>
  );
}

function RuleForm({
  target,
  onClose,
  vendorOptions,
  fixedVendorName,
}: {
  target: RuleFormTarget;
  onClose: () => void;
  vendorOptions?: VendorOption[];
  fixedVendorName?: string | null;
}) {
  const router = useRouter();
  const uid = useId();
  const fid = (k: string) => `${uid}-${k}`;
  const [v, setV] = useState<ReminderRuleInput>(target.initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<RuleInputField | null>(null);
  const isAuto = target.source === "auto";
  const vendorFixed = isAuto || !vendorOptions;

  function set<K extends keyof ReminderRuleInput>(
    k: K,
    value: ReminderRuleInput[K],
  ) {
    setV((p) => ({ ...p, [k]: value }));
  }
  const invalid = (k: RuleInputField) => ({
    "aria-invalid": errorField === k ? ("true" as const) : undefined,
    "aria-describedby": errorField === k ? fieldErrorId(fid(k)) : undefined,
  });
  const fieldError = (k: RuleInputField) => (errorField === k ? error : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setErrorField(null);
    const res = await saveReminderRuleAction(target.ruleId, v);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      setErrorField(res.field ?? null);
      return;
    }
    onClose();
    router.refresh();
  }

  const kinds = isAuto
    ? RULE_KINDS.filter((k) => k.value !== "once")
    : RULE_KINDS;

  return (
    <form onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="對象（廠商）" htmlFor={fid("vendor")} wide>
        {vendorFixed ? (
          <p id={fid("vendor")} className="text-ink py-2 text-[14px]">
            {fixedVendorName ??
              vendorOptions?.find((o) => o.id === v.vendor_id)?.name ??
              (v.vendor_id ? "（原廠商）" : "（無）")}
          </p>
        ) : (
          <VendorPicker
            id={fid("vendor")}
            options={vendorOptions ?? []}
            value={v.vendor_id}
            onChange={(id) => set("vendor_id", id)}
            placeholder="選填：搜尋廠商代碼 / 名稱"
          />
        )}
      </Field>

      <Field
        label="事項"
        htmlFor={fid("title")}
        required
        wide
        error={fieldError("title")}
      >
        <input
          id={fid("title")}
          data-autofocus
          className={`${ERP_INPUT} ${INPUT_INVALID}`}
          value={v.title}
          maxLength={100}
          placeholder="例：匯款、請款、對帳"
          onChange={(e) => set("title", e.target.value)}
          {...invalid("title")}
        />
      </Field>

      <Field
        label="週期"
        htmlFor={fid("kind")}
        required
        error={fieldError("kind")}
      >
        <select
          id={fid("kind")}
          className={`${ERP_SELECT} ${INPUT_INVALID}`}
          value={v.kind}
          onChange={(e) =>
            set("kind", e.target.value as ReminderRuleInput["kind"])
          }
          {...invalid("kind")}
        >
          {kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </Field>

      {v.kind === "monthly" && (
        <Field
          label="每月幾日"
          htmlFor={fid("day_of_month")}
          required
          hint="29–31 日遇小月時以當月最後一天計。"
          error={fieldError("day_of_month")}
        >
          <select
            id={fid("day_of_month")}
            className={`${ERP_SELECT} ${INPUT_INVALID}`}
            value={v.day_of_month ?? 1}
            onChange={(e) => set("day_of_month", Number(e.target.value))}
            {...invalid("day_of_month")}
          >
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d} 日
              </option>
            ))}
            <option value={-1}>月底</option>
          </select>
        </Field>
      )}

      {v.kind === "weekly" && (
        <Field
          label="星期"
          htmlFor={fid("weekday")}
          required
          error={fieldError("weekday")}
        >
          <select
            id={fid("weekday")}
            className={`${ERP_SELECT} ${INPUT_INVALID}`}
            value={v.weekday ?? 1}
            onChange={(e) => set("weekday", Number(e.target.value))}
            {...invalid("weekday")}
          >
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <option key={d} value={d}>
                星期{WEEKDAY_LABEL[d]}
              </option>
            ))}
          </select>
        </Field>
      )}

      {v.kind === "yearly" && (
        <Field
          label="每年幾月幾日"
          htmlFor={fid("month")}
          required
          hint="2/29 在平年以 2/28 計。"
          error={fieldError("month") ?? fieldError("day_of_month")}
        >
          <div className="flex gap-2">
            <select
              id={fid("month")}
              aria-label="月"
              className={`${ERP_SELECT} ${INPUT_INVALID}`}
              value={v.month ?? 1}
              onChange={(e) => set("month", Number(e.target.value))}
              {...invalid("month")}
            >
              {MONTHS.map((m) => (
                <option key={m} value={m}>
                  {m} 月
                </option>
              ))}
            </select>
            <select
              aria-label="日"
              className={`${ERP_SELECT} ${INPUT_INVALID}`}
              value={v.day_of_month && v.day_of_month > 0 ? v.day_of_month : 1}
              onChange={(e) => set("day_of_month", Number(e.target.value))}
              {...invalid("day_of_month")}
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d} 日
                </option>
              ))}
            </select>
          </div>
        </Field>
      )}

      {v.kind === "once" && (
        <Field
          label="日期"
          htmlFor={fid("once_date")}
          required
          error={fieldError("once_date")}
        >
          <RocDateInput
            id={fid("once_date")}
            value={v.once_date}
            onChange={(iso) => set("once_date", iso)}
            aria-label="日期"
          />
        </Field>
      )}

      <Field
        label="提前幾天提醒"
        htmlFor={fid("lead_days")}
        required
        hint="0 到 90 天；預設 7 天。"
        error={fieldError("lead_days")}
      >
        <input
          id={fid("lead_days")}
          inputMode="numeric"
          className={`${ERP_INPUT} ${INPUT_INVALID}`}
          value={String(v.lead_days)}
          onChange={(e) => set("lead_days", e.target.value)}
          {...invalid("lead_days")}
        />
      </Field>

      {v.kind !== "once" && (
        <Field
          label="起算日"
          htmlFor={fid("start_date")}
          required
          hint="此日之前的到期不列入提醒。"
          error={fieldError("start_date")}
        >
          <RocDateInput
            id={fid("start_date")}
            value={v.start_date}
            onChange={(iso) => set("start_date", iso)}
            aria-label="起算日"
          />
        </Field>
      )}

      <Field label="備註" htmlFor={fid("note")} wide>
        <textarea
          id={fid("note")}
          rows={2}
          className={ERP_AREA}
          value={v.note}
          onChange={(e) => set("note", e.target.value)}
        />
      </Field>

      {target.sourceText && (
        <div className="sm:col-span-2">
          <p className="text-text-muted text-[13px]">原始備註片段</p>
          <p className="bg-surface-muted text-ink mt-1 rounded-lg px-3 py-2 text-[13px] whitespace-pre-wrap">
            {target.sourceText}
          </p>
        </div>
      )}

      <label className="text-ink flex items-center gap-2 text-[14px] sm:col-span-2">
        <input
          type="checkbox"
          checked={v.active}
          onChange={(e) => set("active", e.target.checked)}
          className="h-4 w-4"
        />
        啟用
      </label>

      {error && !errorField && (
        <p role="alert" className="text-[14px] text-red-600 sm:col-span-2">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <button type="button" onClick={onClose} className={BTN_SECONDARY}>
          取消
        </button>
        <button type="submit" disabled={busy} className={BTN_PRIMARY}>
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
    </form>
  );
}
