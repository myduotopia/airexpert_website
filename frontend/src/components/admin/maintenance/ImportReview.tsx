"use client";
// 拍照辨識的審核頁：拍照/選檔 → 壓縮 → 上傳原圖（稽核）→ AI 擷取 → 人工確認/修改 → 匯入。
import { useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage } from "@/lib/admin/image-compress";
import { uploadMediaDirect } from "@/lib/admin/upload-client";
import { CardBasicFields } from "./CardBasicForm";
import { MinguoDateInput } from "./MinguoDateInput";
import {
  SERVICE_TYPE_SELECT_CLASS,
  ServiceTypeOptions,
  type RecordValues,
  type TextFieldName,
} from "./RecordForm";
import { parseServiceType } from "@/lib/admin/maintenance-service-type";
import {
  extractCardFromImageAction,
  commitImportAction,
  type ExtractResult,
} from "@/app/admin/(protected)/maintenance/actions";
import type { RecordPayload } from "@/lib/admin/maintenance-normalize";

// service_type 不在此列，改由 RecordFieldsIndexed 以下拉單獨呈現。
const RECORD_FIELDS: TextFieldName[] = [
  "service_date",
  "hours",
  "oil",
  "oil_filter",
  "air_filter",
  "oil_separator",
  "inverter",
  "filter_system",
  "technician",
  "note",
];
const RECORD_LABELS: Record<TextFieldName, string> = {
  service_date: "日期",
  hours: "時數",
  oil: "專用油",
  oil_filter: "機油濾清器",
  air_filter: "空氣濾清器",
  oil_separator: "油氣分離器",
  inverter: "變頻器",
  filter_system: "過濾系統",
  technician: "維護員",
  note: "備註",
};

/** RecordPayload（AI 擷取，欄位為 string | null）→ RecordValues（表單預設值，欄位為 string | undefined）。 */
function toRecordValues(r: RecordPayload): RecordValues {
  return {
    service_date: r.service_date ?? undefined,
    hours: r.hours ?? undefined,
    oil: r.oil ?? undefined,
    oil_filter: r.oil_filter ?? undefined,
    air_filter: r.air_filter ?? undefined,
    oil_separator: r.oil_separator ?? undefined,
    inverter: r.inverter ?? undefined,
    filter_system: r.filter_system ?? undefined,
    technician: r.technician ?? undefined,
    note: r.note ?? undefined,
    service_type: r.service_type,
  };
}

function RecordFieldsIndexed({
  index,
  values,
}: {
  index: number;
  values?: RecordValues;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="flex flex-col gap-1.5">
        <label className="text-ink text-[14px] font-medium">服務類型</label>
        <select
          name={`records[${index}][service_type]`}
          defaultValue={values?.service_type ?? ""}
          className={SERVICE_TYPE_SELECT_CLASS}
        >
          <ServiceTypeOptions />
        </select>
      </div>
      {RECORD_FIELDS.map((f) => (
        <div key={f} className="flex flex-col gap-1.5">
          <label className="text-ink text-[14px] font-medium">
            {RECORD_LABELS[f]}
          </label>
          {f === "service_date" ? (
            <MinguoDateInput
              name={`records[${index}][${f}]`}
              defaultIso={values?.[f]}
            />
          ) : (
            <input
              name={`records[${index}][${f}]`}
              type="text"
              defaultValue={values?.[f] ?? ""}
              className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
            />
          )}
        </div>
      ))}
    </div>
  );
}

function collectRecords(fd: FormData, count: number): RecordPayload[] {
  const rows: RecordPayload[] = [];
  for (let i = 0; i < count; i++) {
    const get = (f: string) => {
      const v = String(fd.get(`records[${i}][${f}]`) ?? "").trim();
      return v === "" ? null : v;
    };
    rows.push({
      service_date: get("service_date"),
      hours: get("hours"),
      oil: get("oil"),
      oil_filter: get("oil_filter"),
      air_filter: get("air_filter"),
      oil_separator: get("oil_separator"),
      inverter: get("inverter"),
      filter_system: get("filter_system"),
      technician: get("technician"),
      note: get("note"),
      service_type: parseServiceType(get("service_type")),
    });
  }
  // service_type 不算「有填內容」：只選了類型卻整列空白的仍視為空列丟棄。
  return rows.filter((r) =>
    Object.entries(r).some(([k, v]) => k !== "service_type" && v !== null),
  );
}

export function ImportReview() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [result, setResult] = useState<Extract<
    ExtractResult,
    { ok: true }
  > | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const img = await compressImage(file);
      setPreview(img.dataUrl);

      // 原圖上傳 Storage（稽核）。以壓縮後 JPEG 直傳（沿用簽名直傳 helper）。
      const blob = await (await fetch(img.dataUrl)).blob();
      const jpg = new File([blob], "card.jpg", { type: "image/jpeg" });
      const uploaded = await uploadMediaDirect(jpg, "maintenance");
      const photoPath = uploaded.ok ? uploaded.path : "";

      const res = await extractCardFromImageAction({
        imageBase64: img.base64,
        mimeType: img.mimeType,
        photoPath,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSave(fd: FormData) {
    if (!result) return;
    setBusy(true);
    setError(null);
    try {
      const basic = {
        customer_name: String(fd.get("customer_name") ?? ""),
        customer_code: String(fd.get("customer_code") ?? ""),
        serial_no: String(fd.get("serial_no") ?? ""),
        machine_no: String(fd.get("machine_no") ?? ""),
        location: String(fd.get("location") ?? ""),
        purchased_at: String(fd.get("purchased_at") ?? ""),
        model: String(fd.get("model") ?? ""),
        horsepower: String(fd.get("horsepower") ?? ""),
        voltage: String(fd.get("voltage") ?? ""),
      };
      const records = collectRecords(fd, result.draft.records.length);
      const out = await commitImportAction({
        draftId: result.draftId,
        machineId: result.match?.id ?? null,
        basic,
        records,
      });
      if (!out.ok) {
        setError(out.error);
        return;
      }
      router.push(`/admin/maintenance/${out.machineId}`);
    } finally {
      setBusy(false);
    }
  }

  if (!result) {
    return (
      <div className="flex flex-col gap-4">
        <label className="border-border hover:bg-surface-muted flex h-40 cursor-pointer items-center justify-center rounded-xl border border-dashed text-[15px]">
          {busy ? "辨識中…" : "點此拍照 / 選擇保養卡照片"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={onFile}
            disabled={busy}
          />
        </label>
        {error && <p className="text-[14px] text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <form action={onSave} className="flex flex-col gap-6">
      {preview && (
        <button
          type="button"
          onClick={() => setZoomed(true)}
          className="focus:ring-primary self-start rounded-lg focus:ring-2 focus:outline-none"
          title="點擊放大"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 預覽是 data URL，非靜態資產。 */}
          <img
            src={preview}
            alt="保養卡（點擊放大）"
            className="max-h-64 cursor-zoom-in rounded-lg border"
          />
        </button>
      )}

      {/* 放大檢視：點擊任意處或按鈕關閉。核對 AI 擷取欄位與手寫原稿時用。 */}
      {zoomed && preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="保養卡放大檢視"
          onClick={() => setZoomed(false)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 預覽是 data URL，非靜態資產。 */}
          <img
            src={preview}
            alt="保養卡放大"
            className="max-h-full max-w-full cursor-zoom-out rounded-lg object-contain"
          />
          <button
            type="button"
            onClick={() => setZoomed(false)}
            aria-label="關閉放大檢視"
            className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 text-[20px] font-bold text-black"
          >
            ✕
          </button>
        </div>
      )}
      <div className="bg-surface-muted rounded-lg p-3 text-[14px]">
        {result.match
          ? `比對到既有卡：機號 ${result.match.serial_no}／客戶 ${result.match.customer_name}。將附加 ${result.draft.records.length} 列維護紀錄。`
          : `未比對到既有卡，將建立新卡。請確認基本資訊。`}
      </div>

      {!result.match && (
        <section>
          <h2 className="text-ink mb-3 text-[16px] font-bold">基本資訊</h2>
          <CardBasicFields values={result.draft.basic} />
        </section>
      )}

      <section>
        <h2 className="text-ink mb-3 text-[16px] font-bold">
          維護紀錄（{result.draft.records.length}）
        </h2>
        <div className="flex flex-col gap-6">
          {result.draft.records.map((r, i) => (
            <fieldset key={i} className="border-border rounded-lg border p-4">
              <legend className="text-text-muted px-2 text-[13px]">
                第 {i + 1} 列
              </legend>
              <RecordFieldsIndexed index={i} values={toRecordValues(r)} />
            </fieldset>
          ))}
        </div>
      </section>

      {error && <p className="text-[14px] text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="bg-primary hover:bg-primary-deep h-11 self-start rounded-lg px-6 text-[15px] font-semibold text-white disabled:opacity-50"
      >
        {busy ? "儲存中…" : "確認並匯入保養卡"}
      </button>
    </form>
  );
}
