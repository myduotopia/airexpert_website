"use client";
// 保養卡「基本資訊」欄位群。可獨立提交（建卡/改卡），或被 ImportReview 內嵌。
// 客戶編號 / 客戶名稱 / 機號 / 機台編號 具 autocomplete：
//  - 客戶欄選客戶 → 帶入客戶編號 + 客戶名稱
//  - 機台欄選機台 → 帶入機號 + 機台編號 + 該機台的客戶編號 + 客戶名稱
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  searchCustomersAction,
  searchMachinesAction,
  type CustomerHit,
  type MachineHit,
} from "@/app/admin/(protected)/maintenance/actions";
import type { MxCardType } from "@/lib/admin/maintenance-normalize";
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
  filter_spec?: string;
  drain_spec?: string;
}

type PlainField = {
  name: keyof CardBasicValues;
  label: string;
  type?: string;
  roc?: boolean;
};

// 非受控（沿用 defaultValue）的其餘欄位；roc=true 者改用民國日期輸入。
// 空壓機卡與過濾（乾燥機）卡的表頭不同：乾燥機卡沒有馬力 / 電壓 / 購買時間，
// 改為兩塊多行規格清單（過濾器、排水器 / 馬達葉片），見下方 SPEC_FIELDS。
const PLAIN_FIELDS: Record<MxCardType, PlainField[]> = {
  compressor: [
    { name: "location", label: "使用地點" },
    { name: "purchased_at", label: "購買時間", roc: true },
    { name: "model", label: "機型" },
    { name: "horsepower", label: "馬力" },
    { name: "voltage", label: "電壓" },
  ],
  filter: [
    { name: "location", label: "使用地點" },
    { name: "model", label: "機型" },
  ],
};

// 過濾卡表頭的兩塊多行規格清單（原文照存，逐行輸入）。
const SPEC_FIELDS: {
  name: "filter_spec" | "drain_spec";
  label: string;
  hint: string;
}[] = [
  {
    name: "filter_spec",
    label: "過濾器",
    hint: "一行一個型號，例：EA350-Q*1只",
  },
  {
    name: "drain_spec",
    label: "排水器 / 馬達葉片",
    hint: "上為排水器、下為馬達 + 葉片，例：外置式排水器CKD*3只+桶下AD480",
  },
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
  cardType = "compressor",
  namePrefix = "",
}: {
  values?: CardBasicValues;
  cardType?: MxCardType;
  /**
   * input 的 name / id 前綴。同一個 <form> 內同時放兩張卡的表頭時（拍照辨識分流，
   * 見 #158）必須給其中一張前綴，否則兩張卡的 serial_no 等欄位會互相覆蓋。
   * 預設空字串 → 與既有單卡表單完全相同。
   */
  namePrefix?: string;
}): ReactNode {
  // 欄位名 / id 一律經此組出，確保 label 的 htmlFor 也跟著加前綴。
  const fieldName = (n: string) => `${namePrefix}${n}`;
  const [customerCode, setCustomerCode] = useState(values?.customer_code ?? "");
  const [customerName, setCustomerName] = useState(values?.customer_name ?? "");
  const [serialNo, setSerialNo] = useState(values?.serial_no ?? "");
  const [machineNo, setMachineNo] = useState(values?.machine_no ?? "");

  // 機台建議只提示同卡別的卡；useCallback 使 fetcher 參考穩定，
  // 否則 AutocompleteField 的 debounce effect 每次 render 都會重跑。
  const searchSameType = useCallback(
    (q: string) => searchMachinesAction(q, cardType),
    [cardType],
  );

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
        id={fieldName("customer_code")}
        label="客戶編號"
        value={customerCode}
        onChange={setCustomerCode}
        fetcher={searchCustomersAction}
        getKey={(h) => h.id}
        renderHit={(h) => `${h.code ?? "—"} · ${h.name}`}
        onPick={pickCustomer}
      />
      <AutocompleteField
        id={fieldName("customer_name")}
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
        id={fieldName("serial_no")}
        label={cardType === "filter" ? "卡號 / 機號" : "機號"}
        required
        value={serialNo}
        onChange={setSerialNo}
        fetcher={searchSameType}
        getKey={(h) => h.id}
        renderHit={(h) =>
          `${h.serial_no}${h.machine_no ? ` · ${h.machine_no}` : ""} · ${h.customer_name}`
        }
        onPick={pickMachine}
      />
      <AutocompleteField
        id={fieldName("machine_no")}
        label="機台編號"
        value={machineNo}
        onChange={setMachineNo}
        fetcher={searchSameType}
        getKey={(h) => h.id}
        renderHit={(h) =>
          `${h.machine_no ?? "—"} · ${h.serial_no} · ${h.customer_name}`
        }
        onPick={pickMachine}
      />
      {PLAIN_FIELDS[cardType].map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label
            htmlFor={fieldName(f.name)}
            className="text-ink text-[14px] font-medium"
          >
            {f.label}
          </label>
          {f.roc ? (
            <MinguoDateInput
              name={fieldName(f.name)}
              defaultIso={values?.[f.name]}
            />
          ) : (
            <input
              id={fieldName(f.name)}
              name={fieldName(f.name)}
              type={f.type ?? "text"}
              defaultValue={values?.[f.name] ?? ""}
              className={INPUT_CLASS}
            />
          )}
        </div>
      ))}
      {cardType === "filter" &&
        SPEC_FIELDS.map((f) => (
          <div key={f.name} className="flex flex-col gap-1.5 sm:col-span-2">
            <label
              htmlFor={fieldName(f.name)}
              className="text-ink text-[14px] font-medium"
            >
              {f.label}
              <span className="text-text-muted ml-2 text-[13px] font-normal">
                {f.hint}
              </span>
            </label>
            <textarea
              id={fieldName(f.name)}
              name={fieldName(f.name)}
              rows={3}
              defaultValue={values?.[f.name] ?? ""}
              className="border-border focus:border-primary rounded-lg border px-3 py-2 text-[15px] outline-none"
            />
          </div>
        ))}
      {/* 建卡時由此決定卡別；更新時 server action 一律以 DB 的卡別為準。 */}
      <input type="hidden" name={fieldName("card_type")} value={cardType} />
    </div>
  );
}
