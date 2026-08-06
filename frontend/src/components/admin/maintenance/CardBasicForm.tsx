"use client";
// 保養卡「基本資訊」欄位群。可獨立提交（建卡/改卡），或被 ImportReview 內嵌。
// 客戶編號 / 客戶名稱 / 機號 / 機台編號 具 autocomplete：
//  - 客戶欄選客戶 → 帶入客戶編號 + 客戶名稱
//  - 機台欄選機台 → 帶入機號 + 機台編號 + 該機台的客戶編號 + 客戶名稱
import { useEffect, useState, type ReactNode } from "react";
import {
  searchCustomersAction,
  searchMachinesAction,
  type CustomerHit,
  type MachineHit,
} from "@/app/admin/(protected)/maintenance/actions";

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

// 非受控（沿用 defaultValue）的其餘欄位。
const PLAIN_FIELDS: {
  name: keyof CardBasicValues;
  label: string;
  type?: string;
}[] = [
  { name: "location", label: "使用地點" },
  { name: "purchased_at", label: "購買時間", type: "date" },
  { name: "model", label: "機型" },
  { name: "horsepower", label: "馬力" },
  { name: "voltage", label: "電壓" },
];

const INPUT_CLASS =
  "border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none";

/**
 * 具建議下拉的受控輸入。value/onChange 由父層控制；輸入時 debounce 查詢 fetcher，
 * 點選建議呼叫 onPick。以 onMouseDown（preventDefault）選取，避免 blur 先關閉清單。
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
    <div className="relative flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink text-[14px] font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={id}
        name={id}
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
        className={INPUT_CLASS}
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
  );
}

export function CardBasicFields({
  values,
}: {
  values?: CardBasicValues;
}): ReactNode {
  const [customerCode, setCustomerCode] = useState(values?.customer_code ?? "");
  const [customerName, setCustomerName] = useState(values?.customer_name ?? "");
  const [serialNo, setSerialNo] = useState(values?.serial_no ?? "");
  const [machineNo, setMachineNo] = useState(values?.machine_no ?? "");

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
          <input
            id={f.name}
            name={f.name}
            type={f.type ?? "text"}
            defaultValue={values?.[f.name] ?? ""}
            className={INPUT_CLASS}
          />
        </div>
      ))}
    </div>
  );
}
