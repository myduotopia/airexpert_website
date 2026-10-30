"use server";

// 維護報告單「拍照辨識回填」server action（#280）。
// 只做辨識、不寫 DB：結果交給編輯頁預填既有回填表單，使用者確認後走原本的 saveReportAction 儲存。
// 照片只在這次請求的記憶體中送給 Gemini，不存 Storage（media bucket 為公開，且 service_report 帳號沒有上傳權限）。
import { extractServiceReportPhotos } from "@/lib/ai/gemini";
import {
  SR_NOT_FOUND_MESSAGE,
  srErrorMessage,
} from "@/lib/service-report/errors";
import { ensureServiceReport } from "@/lib/service-report/guard";
import {
  PHOTO_BACKFILL_WRONG_STATE_MESSAGE,
  canPhotoBackfill,
  isEmptyExtraction,
  normalizeReportExtraction,
  reportNoMismatch,
  validatePhotos,
  type ReportPhotoExtraction,
} from "@/lib/service-report/photo-extract";
import type { ServiceReportStatus, SrResult } from "@/lib/service-report/types";
import { isUuid } from "@/lib/service-report/validate";
import { getServerSupabase } from "@/lib/supabase-server";

export interface PhotoBackfillResult {
  extraction: ReportPhotoExtraction;
  /** 照片上的派工單號與目前報告單不同時為照片上的單號（警告用，不擋）；否則 null。 */
  report_no_mismatch: string | null;
}

/** 拍照辨識：照片 → Gemini（報告單版面 prompt）→ 正規化；比對派工單號。 */
export async function recognizeReportPhotosAction(input: {
  reportId: string;
  images: { base64: string; mimeType: string }[];
}): Promise<SrResult<PhotoBackfillResult>> {
  const denied = await ensureServiceReport();
  if (denied) return denied;
  if (!isUuid(input?.reportId)) {
    return { ok: false, error: SR_NOT_FOUND_MESSAGE };
  }
  const invalid = validatePhotos(input?.images);
  if (invalid) return { ok: false, error: invalid };

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("sr_reports")
    .select("id, report_no, status")
    .eq("id", input.reportId)
    .maybeSingle();
  if (error) return { ok: false, error: srErrorMessage(error) };
  if (!data) return { ok: false, error: SR_NOT_FOUND_MESSAGE };
  const report = data as { report_no: string; status: ServiceReportStatus };
  if (!canPhotoBackfill(report.status)) {
    return { ok: false, error: PHOTO_BACKFILL_WRONG_STATE_MESSAGE };
  }

  try {
    const { raw } = await extractServiceReportPhotos(
      input.images.map((i) => ({ base64: i.base64, mimeType: i.mimeType })),
    );
    const extraction = normalizeReportExtraction(raw);
    if (isEmptyExtraction(extraction)) {
      return {
        ok: false,
        error: "照片上沒有辨識到報告單內容，請確認照片清楚、完整後再試一次。",
      };
    }
    return {
      ok: true,
      data: {
        extraction,
        report_no_mismatch: reportNoMismatch(
          extraction.report_no,
          report.report_no,
        ),
      },
    };
  } catch (e) {
    return {
      ok: false,
      error: (e as Error)?.message || "辨識失敗，請稍後再試。",
    };
  }
}
