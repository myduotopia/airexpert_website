"use client";

// 機台維護報告單開單／編輯表單（spec §6）：左表單、右即時預覽（同一個 ReportSheet）。
// 狀態轉換與帶入決策都在 ./form-state.ts（純函式、可單測），這裡只做 React 綁定與錯誤呈現。
//
// 派工單號：開頁不取號（會白白吃掉一個流水號），留空＝儲存時自動編號；
// 需要先知道號碼時按「預先取號」。已列印過的報告單不可改號（DB 觸發器亦會擋）。
import {
  useCallback,
  useDeferredValue,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Combobox } from "@/components/erp/Combobox";
import { RocDateInput } from "@/components/erp/RocDateInput";
import {
  ERP_AREA,
  ERP_INPUT,
  ERP_LABEL,
  ERP_BUTTON_SECONDARY,
} from "@/components/erp/styles";
import {
  customerOptionLabel,
  machineOptionLabel,
  type SrCustomerOption,
  type SrMachineOption,
} from "@/lib/service-report/prefill";
import {
  CHECK_STATUS_LABELS,
  FILTER_CONSUMABLE_LABELS,
  MACHINE_STATE_LABELS,
  SERVICE_ITEM_LABELS,
  SUGGESTION_LABELS,
  TIME_SLOT_LABELS,
  type CheckStatus,
  type FilterConsumable,
  type MachineState,
  type ServiceItem,
  type ServiceReportInput,
  type ServiceReportStatus,
  type Suggestion,
  type TimeSlot,
} from "@/lib/service-report/types";
import { TEXT_LIMITS } from "@/lib/service-report/validate";
import { ReportSheet } from "./ReportSheet";
import {
  FIELD_LABELS,
  applyCustomerPrefill,
  applyMachinePrefill,
  clearCustomer,
  clearMachine,
  customerPrefillConflicts,
  formStateToInput,
  formStateToSheetData,
  setFilterConsumable,
  setResultField,
  toggleSingle,
  toggleValue,
  updatePart,
  type ReportFormState,
  type ReportTextField,
} from "./form-state";

export const SERVICE_REPORTS_PATH = "/admin/service-reports";

type SaveResult =
  | { ok: true; data: { id: string; report_no: string } }
  | { ok: false; error: string };

export interface ReportFormProps {
  /** 編輯既有報告單時的 id（新增時不傳）。 */
  reportId?: string | null;
  initial: ReportFormState;
  customers: SrCustomerOption[];
  /** 全部未封存機台；依所選客戶於 client 端篩選。 */
  machines: SrMachineOption[];
  /** 編輯時的狀態（completed 需二次確認才儲存）。 */
  status?: ServiceReportStatus;
  /** 已列印過（print_count > 0）→ 派工單號唯讀。 */
  printed?: boolean;
  logoUrl?: string | null;
  /** 儲存（server action，由 page 傳入）。 */
  onSave: (input: ServiceReportInput) => Promise<SaveResult>;
  /** 預先取號（server action）；不傳則不顯示按鈕。 */
  onReserveNo?: (
    isoDate: string,
  ) => Promise<
    { ok: true; data: { report_no: string } } | { ok: false; error: string }
  >;
}

// 回填欄位（key 型別對齊 ServiceReportResults，讀寫都不必轉型）。
type CompressorTextKey =
  | "run_hours"
  | "consumable_hours"
  | "frequency"
  | "set_pressure"
  | "temperature"
  | "current";
type CompressorCheckKey = "fan" | "inverter_fan" | "inverter_params";
type DryerTextKey = "total_hours" | "saving_rate";
type DryerCheckKey =
  | "refrigerant_high"
  | "refrigerant_low"
  | "cooling_fan"
  | "auto_drain"
  | "tank_drain";

const COMPRESSOR_TEXTS: { key: CompressorTextKey; label: string }[] = [
  { key: "run_hours", label: "運轉時數" },
  { key: "consumable_hours", label: "耗材時數" },
  { key: "frequency", label: "運轉頻率" },
  { key: "set_pressure", label: "設定壓力" },
  { key: "temperature", label: "運轉溫度" },
  { key: "current", label: "運轉電流" },
];
const COMPRESSOR_CHECKS: { key: CompressorCheckKey; label: string }[] = [
  { key: "fan", label: "空壓機風扇" },
  { key: "inverter_fan", label: "變頻器風扇" },
  { key: "inverter_params", label: "變頻器參數" },
];
const DRYER_TEXTS: { key: DryerTextKey; label: string }[] = [
  { key: "total_hours", label: "總時數" },
  { key: "saving_rate", label: "節能率" },
];
const DRYER_CHECKS: { key: DryerCheckKey; label: string }[] = [
  { key: "refrigerant_high", label: "冷媒高壓" },
  { key: "refrigerant_low", label: "冷媒低壓" },
  { key: "cooling_fan", label: "散熱風扇" },
  { key: "auto_drain", label: "自動排水器" },
  { key: "tank_drain", label: "貯氣桶排水" },
];

const SERVICE_ITEMS = Object.keys(SERVICE_ITEM_LABELS) as ServiceItem[];
const SUGGESTIONS = Object.keys(SUGGESTION_LABELS) as Suggestion[];
const TIME_SLOTS = Object.keys(TIME_SLOT_LABELS) as TimeSlot[];
const MACHINE_STATES = Object.keys(MACHINE_STATE_LABELS) as MachineState[];
const FILTER_OPTIONS = Object.keys(
  FILTER_CONSUMABLE_LABELS,
) as FilterConsumable[];
const CHECK_STATUSES = Object.keys(CHECK_STATUS_LABELS) as CheckStatus[];

export function ReportForm({
  reportId,
  initial,
  customers,
  machines,
  status,
  printed = false,
  logoUrl,
  onSave,
  onReserveNo,
}: ReportFormProps) {
  const router = useRouter();
  const [state, setState] = useState<ReportFormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [resultsOpen, setResultsOpen] = useState(
    status === "printed" || status === "completed",
  );
  const [pending, startTransition] = useTransition();

  // 預覽跟著輸入更新，但讓輸入優先（整張 A4 重繪較重）。
  const deferred = useDeferredValue(state);
  const sheetData = useMemo(() => formStateToSheetData(deferred), [deferred]);

  const set = useCallback(
    (patch: Partial<ReportFormState>) => setState((s) => ({ ...s, ...patch })),
    [],
  );
  const setText = useCallback(
    (field: ReportTextField, value: string) =>
      setState((s) => ({ ...s, [field]: value })),
    [],
  );

  const machineOptions = useMemo(
    () =>
      state.customer_id
        ? machines.filter((m) => m.customer_id === state.customer_id)
        : machines,
    [machines, state.customer_id],
  );

  function pickCustomer(option: SrCustomerOption | null) {
    setError(null);
    if (!option) {
      setState((s) => clearCustomer(s));
      return;
    }
    if (state.customer_id === option.id) return;
    const conflicts = customerPrefillConflicts(state, option);
    const overwrite =
      conflicts.length === 0 ||
      window.confirm(
        `以下欄位已有內容，要改用「${customerOptionLabel(option)}」的資料嗎？\n\n` +
          conflicts.map((f) => FIELD_LABELS[f]).join("、") +
          "\n\n確定：覆蓋這些欄位；取消：保留現有內容，只補空白欄位。",
      );
    setState((s) => applyCustomerPrefill(s, option, overwrite));
  }

  function pickMachine(option: SrMachineOption | null) {
    setError(null);
    if (!option) {
      setState((s) => clearMachine(s));
      return;
    }
    const customer =
      customers.find(
        (c) => c.id === (state.customer_id ?? option.customer_id),
      ) ?? null;
    setState((s) => applyMachinePrefill(s, option, customer));
  }

  function reserveNo() {
    if (!onReserveNo) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await onReserveNo(state.report_date);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        set({ report_no: res.data.report_no });
      } catch (e) {
        unstable_rethrow(e);
        setError("取號失敗，請檢查網路連線後再試一次。");
      }
    });
  }

  function save(thenPrint: boolean) {
    setError(null);
    if (
      status === "completed" &&
      !window.confirm("這張報告單已結案，確定要修改內容並儲存嗎？")
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await onSave(formStateToInput(state, reportId));
        if (!res.ok) {
          setError(res.error);
          return;
        }
        router.push(
          thenPrint
            ? `${SERVICE_REPORTS_PATH}/print/${res.data.id}`
            : `${SERVICE_REPORTS_PATH}/${res.data.id}`,
        );
        router.refresh();
      } catch (e) {
        unstable_rethrow(e);
        setError("儲存失敗，請檢查網路連線後再試一次。");
      }
    });
  }

  const cancelHref = reportId
    ? `${SERVICE_REPORTS_PATH}/${reportId}`
    : SERVICE_REPORTS_PATH;

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-[14px] text-red-800"
        >
          {error}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <div className="flex min-w-0 flex-col gap-4">
          {/* ── 表頭 ─────────────────────────────── */}
          <Section title="基本資料">
            <Grid>
              <Field label="派工單號" htmlFor="sr-report-no">
                <div className="flex items-center gap-2">
                  <input
                    id="sr-report-no"
                    className={ERP_INPUT}
                    value={state.report_no}
                    readOnly={printed}
                    maxLength={TEXT_LIMITS.report_no}
                    placeholder={printed ? "" : "留空＝儲存時自動編號"}
                    onChange={(e) => set({ report_no: e.target.value })}
                  />
                  {!printed && onReserveNo && (
                    <button
                      type="button"
                      className={`${ERP_BUTTON_SECONDARY} shrink-0 whitespace-nowrap`}
                      disabled={pending}
                      onClick={reserveNo}
                    >
                      預先取號
                    </button>
                  )}
                </div>
                <Hint>
                  {printed
                    ? "已列印的報告單不可改派工單號。"
                    : "留空即可，儲存時自動編號（例：X11509009）。"}
                </Hint>
              </Field>

              <Field label="維護日期" htmlFor="sr-date">
                <RocDateInput
                  id="sr-date"
                  value={state.report_date}
                  onChange={(iso) => set({ report_date: iso })}
                  aria-label="維護日期"
                />
              </Field>

              <Field label="時段">
                <OptionRow
                  options={TIME_SLOTS}
                  labels={TIME_SLOT_LABELS}
                  selected={(k) => state.time_slot === k}
                  onPick={(k) =>
                    set({ time_slot: toggleSingle(state.time_slot, k) })
                  }
                />
              </Field>

              <Field label="代號（左上）" htmlFor="sr-header-code">
                <input
                  id="sr-header-code"
                  className={ERP_INPUT}
                  value={state.header_code}
                  maxLength={TEXT_LIMITS.header_code}
                  onChange={(e) => setText("header_code", e.target.value)}
                />
                <Hint>
                  選客戶與機台後自動組成「客戶編號-機台代號」，可修改。
                </Hint>
              </Field>
            </Grid>
          </Section>

          {/* ── 客戶 ─────────────────────────────── */}
          <Section title="客戶">
            <Grid>
              <Field label="從保養卡選客戶" htmlFor="sr-customer">
                <Combobox
                  id="sr-customer"
                  options={customers}
                  value={state.customer_id}
                  onChange={(_id, option) => pickCustomer(option)}
                  getLabel={customerOptionLabel}
                  aria-label="客戶"
                  placeholder="輸入客戶編號或名稱搜尋"
                />
              </Field>
              <Field label="客戶名稱" htmlFor="sr-customer-name">
                <input
                  id="sr-customer-name"
                  className={ERP_INPUT}
                  value={state.customer_name}
                  maxLength={TEXT_LIMITS.customer_name}
                  onChange={(e) => setText("customer_name", e.target.value)}
                />
              </Field>
              <Field label="電話" htmlFor="sr-phone">
                <input
                  id="sr-phone"
                  className={ERP_INPUT}
                  value={state.phone}
                  maxLength={TEXT_LIMITS.phone}
                  onChange={(e) => setText("phone", e.target.value)}
                />
              </Field>
              <Field label="統一編號" htmlFor="sr-tax-id">
                <input
                  id="sr-tax-id"
                  className={ERP_INPUT}
                  value={state.tax_id}
                  maxLength={TEXT_LIMITS.tax_id}
                  onChange={(e) => setText("tax_id", e.target.value)}
                />
              </Field>
              <Field label="聯絡人" htmlFor="sr-contact">
                <input
                  id="sr-contact"
                  className={ERP_INPUT}
                  value={state.contact}
                  maxLength={TEXT_LIMITS.contact}
                  onChange={(e) => setText("contact", e.target.value)}
                />
              </Field>
              <Field label="地址" htmlFor="sr-address" wide>
                <input
                  id="sr-address"
                  className={ERP_INPUT}
                  value={state.address}
                  maxLength={TEXT_LIMITS.address}
                  onChange={(e) => setText("address", e.target.value)}
                />
              </Field>
            </Grid>
          </Section>

          {/* ── 服務項目與設備 ───────────────────── */}
          <Section title="服務項目與設備">
            <Grid>
              <Field label="服務項目" wide>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {SERVICE_ITEMS.map((k) => (
                    <CheckLabel
                      key={k}
                      checked={state.service_items.includes(k)}
                      onChange={() =>
                        set({
                          service_items: toggleValue(state.service_items, k),
                        })
                      }
                    >
                      {SERVICE_ITEM_LABELS[k]}
                    </CheckLabel>
                  ))}
                </div>
              </Field>

              <Field label="從保養卡選機台" htmlFor="sr-machine">
                <Combobox
                  id="sr-machine"
                  options={machineOptions}
                  value={state.machine_id}
                  onChange={(_id, option) => pickMachine(option)}
                  getLabel={machineOptionLabel}
                  aria-label="機台"
                  placeholder={
                    state.customer_id
                      ? "輸入機號或型號搜尋"
                      : "先選客戶（或直接搜尋全部機台）"
                  }
                />
              </Field>
              <Field label="設備" htmlFor="sr-equipment">
                <input
                  id="sr-equipment"
                  className={ERP_INPUT}
                  value={state.equipment}
                  maxLength={TEXT_LIMITS.equipment}
                  onChange={(e) => setText("equipment", e.target.value)}
                />
              </Field>
              <Field label="型號" htmlFor="sr-model">
                <input
                  id="sr-model"
                  className={ERP_INPUT}
                  value={state.model}
                  maxLength={TEXT_LIMITS.model}
                  onChange={(e) => setText("model", e.target.value)}
                />
              </Field>
              <Field label="電壓" htmlFor="sr-voltage">
                <input
                  id="sr-voltage"
                  className={ERP_INPUT}
                  value={state.voltage}
                  maxLength={TEXT_LIMITS.voltage}
                  onChange={(e) => setText("voltage", e.target.value)}
                />
              </Field>
              <Field label="編號（機號）" htmlFor="sr-serial-no">
                <input
                  id="sr-serial-no"
                  className={ERP_INPUT}
                  value={state.serial_no}
                  maxLength={TEXT_LIMITS.serial_no}
                  onChange={(e) => setText("serial_no", e.target.value)}
                />
              </Field>
              <Field label="狀態">
                <OptionRow
                  options={MACHINE_STATES}
                  labels={MACHINE_STATE_LABELS}
                  selected={(k) => state.machine_state === k}
                  onPick={(k) =>
                    set({ machine_state: toggleSingle(state.machine_state, k) })
                  }
                />
              </Field>
            </Grid>
          </Section>

          {/* ── 修護記要 ─────────────────────────── */}
          <Section title="修護記要及建議">
            <textarea
              aria-label="修護記要及建議"
              className={ERP_AREA}
              rows={6}
              value={state.summary}
              maxLength={TEXT_LIMITS.summary}
              onChange={(e) => setText("summary", e.target.value)}
            />
            <Hint>表單上約 8 行；過長的內容在紙上會被裁掉。</Hint>
          </Section>

          {/* ── 回填結果 ─────────────────────────── */}
          <Section
            title="回填結果（技師現場手寫後回填）"
            action={
              <button
                type="button"
                className={ERP_BUTTON_SECONDARY}
                aria-expanded={resultsOpen}
                onClick={() => setResultsOpen((v) => !v)}
              >
                {resultsOpen ? "收合" : "展開"}
              </button>
            }
          >
            {resultsOpen && (
              <div className="flex flex-col gap-5">
                <SubSection title="空壓機檢查">
                  <Grid>
                    {COMPRESSOR_TEXTS.map((f) => (
                      <Field
                        key={f.key}
                        label={f.label}
                        htmlFor={`sr-comp-${f.key}`}
                      >
                        <input
                          id={`sr-comp-${f.key}`}
                          className={ERP_INPUT}
                          value={state.results.compressor?.[f.key] ?? ""}
                          onChange={(e) =>
                            set({
                              results: setResultField(
                                state.results,
                                "compressor",
                                f.key,
                                e.target.value,
                              ),
                            })
                          }
                        />
                      </Field>
                    ))}
                  </Grid>
                  <div className="mt-3 flex flex-col gap-2">
                    {COMPRESSOR_CHECKS.map((f) => (
                      <CheckStatusRow
                        key={f.key}
                        label={f.label}
                        value={state.results.compressor?.[f.key] ?? null}
                        onPick={(v) =>
                          set({
                            results: setResultField(
                              state.results,
                              "compressor",
                              f.key,
                              v,
                            ),
                          })
                        }
                      />
                    ))}
                  </div>
                </SubSection>

                <SubSection title="乾燥機檢查">
                  <Grid>
                    {DRYER_TEXTS.map((f) => (
                      <Field
                        key={f.key}
                        label={f.label}
                        htmlFor={`sr-dryer-${f.key}`}
                      >
                        <input
                          id={`sr-dryer-${f.key}`}
                          className={ERP_INPUT}
                          value={state.results.dryer?.[f.key] ?? ""}
                          onChange={(e) =>
                            set({
                              results: setResultField(
                                state.results,
                                "dryer",
                                f.key,
                                e.target.value,
                              ),
                            })
                          }
                        />
                      </Field>
                    ))}
                  </Grid>
                  <div className="mt-3 flex flex-col gap-2">
                    {DRYER_CHECKS.map((f) => (
                      <CheckStatusRow
                        key={f.key}
                        label={f.label}
                        value={state.results.dryer?.[f.key] ?? null}
                        onPick={(v) =>
                          set({
                            results: setResultField(
                              state.results,
                              "dryer",
                              f.key,
                              v,
                            ),
                          })
                        }
                      />
                    ))}
                  </div>
                </SubSection>

                <SubSection title="過濾耗材">
                  <OptionRow
                    options={FILTER_OPTIONS}
                    labels={FILTER_CONSUMABLE_LABELS}
                    selected={(k) => state.results.filter_consumable === k}
                    onPick={(k) =>
                      set({
                        results: setFilterConsumable(
                          state.results,
                          state.results.filter_consumable === k ? null : k,
                        ),
                      })
                    }
                  />
                </SubSection>

                <SubSection title="更換料件編號及數量">
                  <div className="flex flex-col gap-2">
                    {state.parts.map((p) => (
                      <div key={p.no} className="flex items-center gap-2">
                        <span className="text-text-muted w-6 shrink-0 text-right text-[13px] tabular-nums">
                          {p.no}
                        </span>
                        <input
                          aria-label={`第 ${p.no} 列品名`}
                          className={ERP_INPUT}
                          value={p.name}
                          maxLength={50}
                          placeholder="品名"
                          onChange={(e) =>
                            set({
                              parts: updatePart(state.parts, p.no, {
                                name: e.target.value,
                              }),
                            })
                          }
                        />
                        <input
                          aria-label={`第 ${p.no} 列數量`}
                          className={`${ERP_INPUT} w-28 shrink-0`}
                          value={p.qty}
                          maxLength={20}
                          placeholder="數量"
                          onChange={(e) =>
                            set({
                              parts: updatePart(state.parts, p.no, {
                                qty: e.target.value,
                              }),
                            })
                          }
                        />
                      </div>
                    ))}
                  </div>
                </SubSection>

                <SubSection title="建議事項">
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {SUGGESTIONS.map((k) => (
                      <CheckLabel
                        key={k}
                        checked={state.suggestions.includes(k)}
                        onChange={() =>
                          set({
                            suggestions: toggleValue(state.suggestions, k),
                          })
                        }
                      >
                        {SUGGESTION_LABELS[k]}
                      </CheckLabel>
                    ))}
                  </div>
                </SubSection>

                <Grid>
                  <Field label="維護人員" htmlFor="sr-technician">
                    <input
                      id="sr-technician"
                      className={ERP_INPUT}
                      value={state.technician}
                      maxLength={TEXT_LIMITS.technician}
                      onChange={(e) => setText("technician", e.target.value)}
                    />
                  </Field>
                  <Field label="客戶簽名人" htmlFor="sr-signer">
                    <input
                      id="sr-signer"
                      className={ERP_INPUT}
                      value={state.customer_signer}
                      maxLength={TEXT_LIMITS.customer_signer}
                      onChange={(e) =>
                        setText("customer_signer", e.target.value)
                      }
                    />
                  </Field>
                </Grid>
              </div>
            )}
          </Section>

          {/* ── 內部備註 ─────────────────────────── */}
          <Section title="內部備註（不列印）">
            <textarea
              aria-label="內部備註"
              className={ERP_AREA}
              rows={3}
              value={state.note}
              maxLength={TEXT_LIMITS.note}
              onChange={(e) => setText("note", e.target.value)}
            />
          </Section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-5 text-[14px] font-semibold text-white disabled:opacity-50"
              disabled={pending}
              onClick={() => save(false)}
            >
              {pending ? "儲存中…" : "儲存草稿"}
            </button>
            <button
              type="button"
              className="border-primary text-primary-deep hover:bg-surface-muted inline-flex h-10 items-center rounded-lg border bg-white px-5 text-[14px] font-semibold disabled:opacity-50"
              disabled={pending}
              onClick={() => save(true)}
            >
              儲存並列印
            </button>
            <Link
              href={cancelHref}
              className="text-text-muted hover:text-ink text-[14px] font-semibold"
            >
              取消
            </Link>
          </div>
        </div>

        {/* ── 即時預覽 ───────────────────────────── */}
        <aside className="min-w-0">
          <div className="xl:sticky xl:top-4">
            <h2 className="text-ink mb-2 text-[15px] font-semibold">
              列印預覽
            </h2>
            <div className="border-border overflow-hidden rounded-xl border bg-white shadow-sm">
              <ReportSheet mode="preview" data={sheetData} logoUrl={logoUrl} />
            </div>
            <p className="text-text-muted mt-2 text-[12px]">
              實際列印位置可在列印頁的「校正設定」微調。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- 小元件 */

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-border rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-ink text-[15px] font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h3 className="text-ink mb-2 text-[14px] font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">{children}</div>;
}

function Field({
  label,
  htmlFor,
  wide,
  children,
}: {
  label: string;
  htmlFor?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}>
      {htmlFor ? (
        <label className={ERP_LABEL} htmlFor={htmlFor}>
          {label}
        </label>
      ) : (
        <span className={ERP_LABEL}>{label}</span>
      )}
      {children}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <span className="text-text-muted text-[12px]">{children}</span>;
}

function CheckLabel({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
}) {
  return (
    <label className="text-ink inline-flex items-center gap-2 text-[14px]">
      <input
        type="checkbox"
        className="accent-primary size-4"
        checked={checked}
        onChange={onChange}
      />
      {children}
    </label>
  );
}

/** 單選列（再點一次可取消）。 */
function OptionRow<T extends string>({
  options,
  labels,
  selected,
  onPick,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  selected: (k: T) => boolean;
  onPick: (k: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((k) => {
        const on = selected(k);
        return (
          <button
            key={k}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(k)}
            className={`inline-flex h-9 items-center rounded-lg border px-3 text-[14px] font-medium ${
              on
                ? "border-primary bg-primary text-white"
                : "border-border hover:bg-surface-muted bg-white"
            }`}
          >
            {labels[k]}
          </button>
        );
      })}
    </div>
  );
}

function CheckStatusRow({
  label,
  value,
  onPick,
}: {
  label: string;
  value: CheckStatus | null;
  onPick: (v: CheckStatus | null) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-ink w-28 shrink-0 text-[14px]">{label}</span>
      <OptionRow
        options={CHECK_STATUSES}
        labels={CHECK_STATUS_LABELS}
        selected={(k) => value === k}
        onPick={(k) => onPick(toggleSingle(value, k))}
      />
    </div>
  );
}
