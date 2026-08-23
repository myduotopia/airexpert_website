"use client";
// 保養卡「基本資訊」欄位群。可獨立提交（建卡/改卡），或被 ImportReview 內嵌。
// 客戶編號 / 客戶名稱 / 機號 / 機台編號 具 autocomplete：
//  - 客戶欄選客戶 → 帶入客戶編號 + 客戶名稱
//  - 機台欄選機台 → 帶入機號 + 機台編號 + 該機台的客戶編號 + 客戶名稱
// 機號另有「以客戶名稱為前綴」快捷（見 lib/admin/machine-serial）與衝突預檢。
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  searchCustomersAction,
  searchMachinesAction,
  checkSerialConflictAction,
  type CustomerHit,
  type MachineHit,
  type SerialConflict,
} from "@/app/admin/(protected)/maintenance/actions";
import {
  buildPrefixedSerial,
  customerSerialPrefix,
} from "@/lib/admin/machine-serial";
import { MinguoDateInput } from "./MinguoDateInput";

export interface CardBasicValues {
  customer_code?: string;
  customer_name?: string;
  serial_no?: string;
  machine_no?: string;
  location?: string;
  purchased_at?: string;
  model?: string;
  horsepower?: string;
  voltage?: string;
}

// 非受控（沿用 defaultValue）的其餘欄位；roc=true 者改用民國日期輸入。
const PLAIN_FIELDS: {
  name: keyof CardBasicValues;
  label: string;
  type?: string;
  roc?: boolean;
}[] = [
  { name: "location", label: "使用地點" },
  { name: "purchased_at", label: "購買時間", roc: true },
  { name: "model", label: "機型" },
  { name: "horsepower", label: "馬力" },
  { name: "voltage", label: "電壓" },
];

const INPUT_CLASS =
  "border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none";

/**
 * 具建議下拉的受控輸入。value/onChange 由父層控制；輸入時 debounce 查詢 fetcher，
 * 點選建議呼叫 onPick。以 onMouseDown（preventDefault）選取，避免 blur 先關閉清單。
 * labelAction 顯示在標籤右側（快捷按鈕）；hint / footer 顯示在輸入框下方。
 */
function AutocompleteField<T>({
  id,
  label,
  required,
  value,
  onChange,
  fetcher,
  getKey,
  renderHit,
  onPick,
  inputRef,
  labelAction,
  hint,
  footer,
}: {
  id: string;
  label: string;
  required?: boolean;
  value: string;
  onChange: (v: string) => void;
  fetcher: (q: string) => Promise<T[]>;
  getKey: (hit: T) => string;
  renderHit: (hit: T) => ReactNode;
  onPick: (hit: T) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  labelAction?: ReactNode;
  hint?: ReactNode;
  footer?: ReactNode;
}) {
  const [hits, setHits] = useState<T[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 1) return; // 不在 effect body 內同步 setState（避免 cascading render）
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await fetcher(q);
      if (!cancelled) setHits(res);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value, fetcher]);

  const showList = open && value.trim().length >= 1 && hits.length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-[22px] items-center justify-between gap-2">
        <label htmlFor={id} className="text-ink text-[14px] font-medium">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          id={id}
          name={id}
          ref={inputRef}
          type="text"
          autoComplete="off"
          required={required}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          className={`${INPUT_CLASS} w-full`}
        />
        {showList && (
          <ul className="border-border absolute top-full z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-white shadow-md">
            {hits.map((hit) => (
              <li key={getKey(hit)}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onPick(hit);
                    setOpen(false);
                  }}
                  className="hover:bg-surface-muted text-ink block w-full px-3 py-2 text-left text-[14px]"
                >
                  {renderHit(hit)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {hint && <p className="text-text-muted text-[13px]">{hint}</p>}
      {footer}
    </div>
  );
}

export function CardBasicFields({
  values,
  machineId,
}: {
  values?: CardBasicValues;
  /** 編輯既有卡時帶入，機號衝突預檢會排除自己。 */
  machineId?: string;
}): ReactNode {
  const [customerCode, setCustomerCode] = useState(values?.customer_code ?? "");
  const [customerName, setCustomerName] = useState(values?.customer_name ?? "");
  const [serialNo, setSerialNo] = useState(values?.serial_no ?? "");
  const [machineNo, setMachineNo] = useState(values?.machine_no ?? "");
  const [conflict, setConflict] = useState<SerialConflict | null>(null);
  const serialRef = useRef<HTMLInputElement | null>(null);

  // 客戶名稱改變時只更新這個提示字，**不**動已輸入的機號（避免覆蓋人工值）。
  const prefix = customerSerialPrefix(customerName);

  // 機號衝突預檢：debounce 後查未封存卡，讓員工送出前就看到衝突與該卡連結。
  useEffect(() => {
    const serial = serialNo.trim();
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!serial) {
        if (!cancelled) setConflict(null);
        return;
      }
      try {
        const hit = await checkSerialConflictAction(serial, machineId);
        if (!cancelled) setConflict(hit);
      } catch {
        // 預檢僅為輔助提示，查詢失敗就當作沒有衝突（送出時仍有 server 端把關）。
        if (!cancelled) setConflict(null);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [serialNo, machineId]);

  // 選客戶 → 帶入客戶編號 + 名稱（不動機台欄）。
  function pickCustomer(hit: CustomerHit) {
    setCustomerCode(hit.code ?? "");
    setCustomerName(hit.name);
  }

  // 選機台 → 帶入機號 + 機台編號 + 該機台的客戶編號 + 名稱。
  function pickMachine(hit: MachineHit) {
    setSerialNo(hit.serial_no);
    setMachineNo(hit.machine_no ?? "");
    setCustomerCode(hit.customer_code ?? "");
    setCustomerName(hit.customer_name);
  }

  // 快捷：把客戶名稱塞成機號前綴，游標停在「-」後方等使用者補打 A / 1。
  function applyCustomerPrefix() {
    const next = buildPrefixedSerial(customerName, serialNo);
    setSerialNo(next);
    requestAnimationFrame(() => {
      const el = serialRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <AutocompleteField
        id="customer_code"
        label="客戶編號"
        value={customerCode}
        onChange={setCustomerCode}
        fetcher={searchCustomersAction}
        getKey={(h) => h.id}
        renderHit={(h) => `${h.code ?? "—"} · ${h.name}`}
        onPick={pickCustomer}
      />
      <AutocompleteField
        id="customer_name"
        label="客戶名稱"
        required
        value={customerName}
        onChange={setCustomerName}
        fetcher={searchCustomersAction}
        getKey={(h) => h.id}
        renderHit={(h) => `${h.name}（${h.code ?? "—"}）`}
        onPick={pickCustomer}
      />
      <AutocompleteField
        id="serial_no"
        label="機號"
        required
        value={serialNo}
        onChange={setSerialNo}
        fetcher={searchMachinesAction}
        getKey={(h) => h.id}
        renderHit={(h) =>
          `${h.serial_no}${h.machine_no ? ` · ${h.machine_no}` : ""} · ${h.customer_name}`
        }
        onPick={pickMachine}
        inputRef={serialRef}
        labelAction={
          <button
            type="button"
            onClick={applyCustomerPrefix}
            disabled={!prefix}
            title={
              prefix
                ? `帶入「${prefix}-」作為機號前綴`
                : "請先填客戶名稱，才能帶入前綴"
            }
            className="text-primary shrink-0 text-[13px] font-medium hover:underline disabled:cursor-not-allowed disabled:text-gray-400 disabled:no-underline"
          >
            {prefix ? `以客戶名稱為前綴（${prefix}-）` : "以客戶名稱為前綴"}
          </button>
        }
        hint="可用「客戶名稱-A」形式，例：兆利科技-A"
        footer={
          conflict && (
            <p className="text-[13px] text-red-600">
              此機號已被「{conflict.customer_name || "（未命名客戶）"}
              」的卡使用（{
                conflict.serial_no
              }）。請改用「客戶名稱-A」形式，或{" "}
              <a
                href={`/admin/maintenance/${conflict.id}`}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline"
              >
                開啟該卡
              </a>
              。
            </p>
          )
        }
      />
      <AutocompleteField
        id="machine_no"
        label="機台編號"
        value={machineNo}
        onChange={setMachineNo}
        fetcher={searchMachinesAction}
        getKey={(h) => h.id}
        renderHit={(h) =>
          `${h.machine_no ?? "—"} · ${h.serial_no} · ${h.customer_name}`
        }
        onPick={pickMachine}
      />
      {PLAIN_FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={f.name} className="text-ink text-[14px] font-medium">
            {f.label}
          </label>
          {f.roc ? (
            <MinguoDateInput name={f.name} defaultIso={values?.[f.name]} />
          ) : (
            <input
              id={f.name}
              name={f.name}
              type={f.type ?? "text"}
              defaultValue={values?.[f.name] ?? ""}
              className={INPUT_CLASS}
            />
          )}
        </div>
      ))}
    </div>
  );
}
