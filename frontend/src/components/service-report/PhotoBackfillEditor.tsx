"use client";

// 拍照辨識回填（#280）：編輯頁 ?photo=1 時包在既有 ReportForm 外面。
//   1. 選 1 張以上報告單照片 → 瀏覽器壓縮 → recognizeReportPhotosAction（Gemini，報告單版面 prompt）；
//   2. 辨識結果以 applyPhotoExtraction 預填「既有」回填表單（ReportForm 以新的 initial 重新掛載），
//      上方列出已帶入欄位、低信心欄位、需人工處理的提示；派工單號與照片不同時顯示警告（不擋）；
//   3. 使用者在原表單上檢查、修改後按儲存（原本的 saveReportAction），回詳情頁照常結案。
// 照片只留在這個頁面的記憶體中（供對照），不上傳 Storage。
import { useState, useTransition } from "react";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { useConfirm } from "@/components/erp/ConfirmDialog";
import { compressImage } from "@/lib/admin/image-compress";
import { MAX_PHOTOS } from "@/lib/service-report/photo-extract";
import type { SrResult } from "@/lib/service-report/types";
import type { PhotoBackfillResult } from "@/app/admin/(protected)/service-reports/photo-actions";
import { ReportForm, type ReportFormProps } from "./ReportForm";
import { applyPhotoExtraction, type PhotoApplyResult } from "./photo-apply";

const PRIMARY =
  "bg-primary hover:bg-primary-deep inline-flex h-10 items-center rounded-lg px-4 text-[14px] font-semibold text-white disabled:opacity-60";

interface Photo {
  name: string;
  base64: string;
  mimeType: string;
  dataUrl: string;
}

export interface PhotoBackfillEditorProps extends ReportFormProps {
  reportId: string;
  /** 目前報告單的派工單號（與照片比對）。 */
  reportNo: string;
  /** 辨識（server action，由 page 傳入）。 */
  onRecognize: (input: {
    reportId: string;
    images: { base64: string; mimeType: string }[];
  }) => Promise<SrResult<PhotoBackfillResult>>;
  /** 「略過」回到一般編輯頁的網址。 */
  plainEditHref: string;
}

export function PhotoBackfillEditor({
  reportNo,
  onRecognize,
  plainEditHref,
  ...formProps
}: PhotoBackfillEditorProps) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [applied, setApplied] = useState<
    (PhotoApplyResult & { mismatch: string | null }) | null
  >(null);
  // 每次套用辨識結果就換 key，讓 ReportForm 以新的 initial 重新掛載。
  const [formKey, setFormKey] = useState(0);
  const [askConfirm, confirmDialog] = useConfirm();

  const busy = preparing || pending;

  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) {
      setError(`一次最多 ${MAX_PHOTOS} 張照片`);
    }
    setPreparing(true);
    try {
      const added: Photo[] = [];
      for (const file of files.slice(0, Math.max(0, room))) {
        const img = await compressImage(file);
        added.push({
          name: file.name,
          base64: img.base64,
          mimeType: img.mimeType,
          dataUrl: img.dataUrl,
        });
      }
      setPhotos((p) => [...p, ...added]);
    } catch {
      setError("照片讀取失敗，請改用 JPEG／PNG 照片再試一次。");
    } finally {
      setPreparing(false);
    }
  }

  async function recognize() {
    setError(null);
    if (photos.length === 0) {
      setError("請至少選擇一張照片");
      return;
    }
    if (
      applied &&
      !(await askConfirm({
        title: "重新辨識？",
        message:
          "辨識結果會重新帶入下方表單，尚未儲存的修改會被取代（已儲存的內容不受影響）。",
        confirmLabel: "重新辨識",
      }))
    ) {
      return;
    }
    startTransition(async () => {
      try {
        const res = await onRecognize({
          reportId: formProps.reportId as string,
          images: photos.map((p) => ({
            base64: p.base64,
            mimeType: p.mimeType,
          })),
        });
        if (!res.ok) {
          setError(res.error);
          return;
        }
        const result = applyPhotoExtraction(
          formProps.initial,
          res.data.extraction,
          formProps.employees ?? [],
        );
        setApplied({ ...result, mismatch: res.data.report_no_mismatch });
        setFormKey((k) => k + 1);
      } catch (e) {
        unstable_rethrow(e);
        setError("辨識失敗，請檢查網路連線後再試一次。");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <section
        aria-label="拍照辨識回填"
        className="border-border flex flex-col gap-3 rounded-xl border bg-white p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-ink text-[16px] font-semibold">拍照辨識回填</h2>
          <Link
            href={plainEditHref}
            className="text-text-muted hover:text-ink text-[13px]"
          >
            略過，改為手動回填
          </Link>
        </div>
        <p className="text-text-muted text-[13px]">
          拍下師傅交回的手寫報告單（可多張，最多 {MAX_PHOTOS} 張），AI
          辨識後會帶入下方的回填表單，請逐欄核對後再儲存。照片不會上傳保存。
        </p>

        <div className="flex flex-wrap items-center gap-3">
          {photos.map((p, i) => (
            <figure key={`${p.name}-${i}`} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- 本機 data URL 預覽 */}
              <img
                src={p.dataUrl}
                alt={`報告單照片 ${i + 1}`}
                className="border-border h-28 w-auto rounded-lg border object-contain"
              />
              <button
                type="button"
                disabled={busy}
                aria-label={`移除照片 ${i + 1}`}
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white text-[13px] shadow ring-1 ring-black/10"
                onClick={() =>
                  setPhotos((list) => list.filter((_, j) => j !== i))
                }
              >
                ×
              </button>
            </figure>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label
              className={`border-border hover:bg-surface-muted flex h-28 w-40 cursor-pointer items-center justify-center rounded-lg border border-dashed px-3 text-center text-[14px] ${busy ? "pointer-events-none opacity-60" : ""}`}
            >
              {preparing ? "處理照片中…" : "拍照／選擇照片"}
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={onFiles}
                disabled={busy}
              />
            </label>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={PRIMARY}
            disabled={busy || photos.length === 0}
            onClick={recognize}
          >
            {pending
              ? "辨識中…（約 30 秒）"
              : applied
                ? "重新辨識"
                : "開始辨識"}
          </button>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg bg-red-50 px-3 py-2 text-[14px] text-red-700"
          >
            {error}
          </p>
        )}

        {applied && (
          <div className="flex flex-col gap-2 text-[14px]">
            {applied.mismatch && (
              <p
                role="alert"
                className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-semibold text-amber-900"
              >
                ⚠ 照片上的派工單號是 {applied.mismatch}，與這張報告單（
                {reportNo}）不同。請確認拍的是不是這張單，確認無誤再儲存。
              </p>
            )}
            <p className="text-ink">
              已帶入：
              {applied.filled.length > 0
                ? applied.filled.join("、")
                : "沒有需要變更的欄位"}
            </p>
            {applied.lowConfidence.length > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900">
                辨識信心較低，請特別核對：{applied.lowConfidence.join("、")}
              </p>
            )}
            {applied.notices.length > 0 && (
              <ul className="list-disc pl-5 text-amber-900">
                {applied.notices.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
            <p className="text-text-muted text-[13px]">
              核對後按下方「儲存」；回到報告單後即可結案，結案時會同步一列到該機台的保養卡。
            </p>
          </div>
        )}
      </section>

      {applied ? (
        <ReportForm key={formKey} {...formProps} initial={applied.state} />
      ) : (
        <p className="text-text-muted text-[14px]">
          辨識完成後，回填表單會顯示在這裡。
        </p>
      )}
      {confirmDialog}
    </div>
  );
}
