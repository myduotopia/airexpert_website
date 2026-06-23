"use client";

// 首頁後台「友善表單」共用基礎元件：避免 7 個區段各寫一份重複的 input / textarea /
// 圖示下拉 / 可重複列邏輯。皆為純 UI primitive，由各區段表單組合使用。
import { useActionState, useId, useState, type ReactNode } from "react";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { SubmitButton } from "@/components/admin/SubmitButton";
import { saveHomeSection, type SaveResult } from "../actions";
import type { IconOption } from "@/lib/admin/home-sections";

const labelCls = "text-ink text-[13px] font-medium";
const inputCls =
  "border-border focus:border-primary h-10 w-full rounded-lg border bg-white px-3 text-[14px] outline-none";
const areaCls =
  "border-border focus:border-primary w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none";

// ---------- 有標籤的單行輸入 ----------
export function Field({
  name,
  label,
  defaultValue,
  placeholder,
  help,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  help?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <input
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        className={inputCls}
      />
      {help ? (
        <span className="text-text-muted text-[12px]">{help}</span>
      ) : null}
    </label>
  );
}

// ---------- 有標籤的多行輸入 ----------
export function TextareaField({
  name,
  label,
  defaultValue,
  placeholder,
  rows = 2,
  help,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  help?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={rows}
        className={areaCls}
      />
      {help ? (
        <span className="text-text-muted text-[12px]">{help}</span>
      ) : null}
    </label>
  );
}

// ---------- 圖示下拉（含中文說明）----------
export function IconSelect({
  name,
  label,
  options,
  defaultValue,
}: {
  name: string;
  label: string;
  options: IconOption[];
  defaultValue?: string;
}) {
  const fallback = options[0]?.value ?? "";
  const initial = options.some((o) => o.value === defaultValue)
    ? (defaultValue as string)
    : fallback;
  return (
    <label className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <select name={name} defaultValue={initial} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------- 圖片欄位（手填 URL + 上傳 + 預覽）----------
// 受控以便上傳完成可回填 URL；對應 server 端讀取的 name=`...image_url`。
export function ImageField({
  name,
  label,
  folder,
  initialUrl,
}: {
  name: string;
  label: string;
  folder: string;
  initialUrl: string;
}) {
  const [url, setUrl] = useState(initialUrl);
  return (
    <div className="flex flex-col gap-1.5">
      <span className={labelCls}>{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        {url ? (
          <span className="border-border bg-surface-muted flex items-center justify-center overflow-hidden rounded-md border">
            {/* 預覽可能是外部 / data URL，用原生 img 避免 next/image 網域設定。 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={`${label}預覽`}
              className="h-16 w-16 object-cover"
            />
          </span>
        ) : (
          <span className="text-text-muted text-[13px]">尚未設定圖片</span>
        )}
        <ImageUploader folder={folder} onUploaded={setUrl} />
      </div>
      <input
        name={name}
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://… 或上傳後自動填入"
        className={inputCls}
      />
    </div>
  );
}

// ---------- 可重複列編輯器 ----------
// 以 useState 管理列數（每列一個穩定 id 供 React key 與欄位前綴）；
// 送出時連同隱藏的 `${prefix}.count` 一起序列化，server 端據此逐列讀取。
// 注意：欄位名以「目前列的視覺索引」產生（傳給 renderRow 的 index），
// 故刪除 / 移動列後送出的索引仍連續，server 端不會讀到空洞。
let rowSeq = 0;
function nextRowId(): number {
  rowSeq += 1;
  return rowSeq;
}

export function RepeatableList({
  prefix,
  label,
  addLabel = "新增一列",
  initialCount,
  renderRow,
}: {
  /** 欄位名前綴，如 "slides" → 欄位 slides[0].xxx、隱藏 slides.count。 */
  prefix: string;
  label: string;
  addLabel?: string;
  /** 初始列數（依現有資料）。至少渲染這麼多列。 */
  initialCount: number;
  /** 給定視覺索引，回傳該列的欄位群（欄位名請以 `${prefix}[${index}].xxx`）。 */
  renderRow: (index: number) => ReactNode;
}) {
  // 以穩定 id 陣列追蹤列；id 僅供 React key，欄位名改用 map 的 visual index。
  const [ids, setIds] = useState<number[]>(() =>
    Array.from({ length: Math.max(initialCount, 0) }, () => nextRowId()),
  );

  function addRow() {
    setIds((prev) => [...prev, nextRowId()]);
  }
  function removeRow(id: number) {
    setIds((prev) => prev.filter((x) => x !== id));
  }
  function move(id: number, dir: -1 | 1) {
    setIds((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-ink text-[14px] font-semibold">{label}</span>
        <span className="text-text-muted text-[12px]">共 {ids.length} 列</span>
      </div>

      {/* server 端據此得知列數。 */}
      <input type="hidden" name={`${prefix}.count`} value={ids.length} />

      {ids.map((id, index) => (
        <div
          key={id}
          className="border-border bg-surface-muted/40 relative flex flex-col gap-3 rounded-lg border p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-text-muted text-[12px] font-medium">
              第 {index + 1} 列
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(id, -1)}
                disabled={index === 0}
                aria-label="上移"
                className="border-border text-text-muted hover:bg-surface rounded-md border px-2 py-1 text-[12px] disabled:opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => move(id, 1)}
                disabled={index === ids.length - 1}
                aria-label="下移"
                className="border-border text-text-muted hover:bg-surface rounded-md border px-2 py-1 text-[12px] disabled:opacity-40"
              >
                ↓
              </button>
              <button
                type="button"
                onClick={() => removeRow(id)}
                className="rounded-md border border-red-200 px-2 py-1 text-[12px] text-red-600 hover:bg-red-50"
              >
                刪除
              </button>
            </div>
          </div>
          {renderRow(index)}
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="border-border text-ink hover:bg-surface-muted w-fit rounded-lg border border-dashed px-4 py-2 text-[13px] font-medium"
      >
        + {addLabel}
      </button>
    </div>
  );
}

// ---------- 區段表單外框（標題 / 說明 / 送出 + 狀態）----------
// 各區段表單共用：掛 useActionState 至 saveHomeSection，帶隱藏 key，
// 顯示「已儲存 ✓」/ 錯誤訊息（與 SettingForm / BrandingForm 一致）。
export function SectionForm({
  settingKey,
  heading,
  description,
  children,
}: {
  settingKey: string;
  heading: string;
  description?: string;
  children: ReactNode;
}) {
  const uid = useId();
  const [state, formAction] = useActionState<SaveResult | null, FormData>(
    saveHomeSection,
    null,
  );

  return (
    <form
      action={formAction}
      aria-labelledby={uid}
      className="border-border flex flex-col gap-5 rounded-xl border bg-white p-5"
    >
      <input type="hidden" name="key" value={settingKey} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id={uid} className="text-ink text-[16px] font-semibold">
          {heading}
        </h3>
        <code className="text-text-muted text-[12px]">{settingKey}</code>
      </div>
      {description ? (
        <p className="text-text-muted -mt-2 text-[13px]">{description}</p>
      ) : null}

      {children}

      <div className="flex items-center gap-3">
        <SubmitButton>儲存</SubmitButton>
        {state?.ok === true && (
          <span className="text-primary-deep text-[13px]">已儲存 ✓</span>
        )}
        {state?.ok === false && (
          <span className="text-[13px] text-red-600">{state.error}</span>
        )}
      </div>
    </form>
  );
}
