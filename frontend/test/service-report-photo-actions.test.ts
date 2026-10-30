import { describe, it, expect, vi, beforeEach } from "vitest";

// 拍照辨識回填 server action（#280）：mock 權限、supabase 與 Gemini（不呼叫真的 API）。

let moduleGranted = true;
let reportRow: { id: string; report_no: string; status: string } | null = null;
const extractSpy = vi.fn();

vi.mock("@/lib/admin/auth", () => ({
  hasModule: vi.fn(
    async (m: string) => moduleGranted && m === "service_report",
  ),
}));
vi.mock("@/lib/supabase-server", () => ({
  getServerSupabase: vi.fn(async () => ({
    from: () => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: reportRow, error: null }),
      };
      return q;
    },
  })),
}));
vi.mock("@/lib/ai/gemini", () => ({
  extractServiceReportPhotos: (...args: unknown[]) => extractSpy(...args),
}));

import { recognizeReportPhotosAction } from "@/app/admin/(protected)/service-reports/photo-actions";
import { showPhotoBackfillEntry } from "@/app/admin/(protected)/service-reports/_components/PhotoBackfillEntry";

const ID = "11111111-2222-4333-8444-555555555555";
const IMAGES = [{ base64: "AAAA", mimeType: "image/jpeg" }];

beforeEach(() => {
  moduleGranted = true;
  reportRow = { id: ID, report_no: "X11510002", status: "printed" };
  extractSpy.mockReset();
  extractSpy.mockResolvedValue({
    raw: {
      report_no: "X11510002",
      compressor: { run_hours: "15" },
      bogus: "x",
    },
    model: "test-model",
  });
});

describe("recognizeReportPhotosAction", () => {
  it("沒有 service_report 模組 → 拒絕，且不呼叫 Gemini", async () => {
    moduleGranted = false;
    const res = await recognizeReportPhotosAction({
      reportId: ID,
      images: IMAGES,
    });
    expect(res).toEqual({ ok: false, error: "沒有機台維護報告單權限" });
    expect(extractSpy).not.toHaveBeenCalled();
  });

  it("成功：回正規化結果；單號相同 → 無警告", async () => {
    const res = await recognizeReportPhotosAction({
      reportId: ID,
      images: IMAGES,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.extraction.results).toEqual({
      compressor: { run_hours: "15" },
    });
    expect(res.data.report_no_mismatch).toBeNull();
    expect(extractSpy).toHaveBeenCalledWith(IMAGES);
  });

  it("照片上的派工單號不同 → 回警告（不擋）", async () => {
    extractSpy.mockResolvedValue({
      raw: { report_no: "X11510009", summary: "x" },
      model: "m",
    });
    const res = await recognizeReportPhotosAction({
      reportId: ID,
      images: IMAGES,
    });
    expect(res.ok && res.data.report_no_mismatch).toBe("X11510009");
  });

  it.each(["draft", "completed", "voided"])(
    "狀態 %s → 拒絕，不呼叫 Gemini",
    async (status) => {
      reportRow = { id: ID, report_no: "X11510002", status };
      const res = await recognizeReportPhotosAction({
        reportId: ID,
        images: IMAGES,
      });
      expect(res.ok).toBe(false);
      expect(extractSpy).not.toHaveBeenCalled();
    },
  );

  it("id 不正確、查無報告單、照片不合格 → 拒絕", async () => {
    expect(
      (await recognizeReportPhotosAction({ reportId: "x", images: IMAGES })).ok,
    ).toBe(false);
    reportRow = null;
    expect(
      (await recognizeReportPhotosAction({ reportId: ID, images: IMAGES })).ok,
    ).toBe(false);
    reportRow = { id: ID, report_no: "X1", status: "printed" };
    expect(
      await recognizeReportPhotosAction({ reportId: ID, images: [] }),
    ).toEqual({ ok: false, error: "請至少選擇一張照片" });
    expect(extractSpy).not.toHaveBeenCalled();
  });

  it("什麼都沒辨識到 → 錯誤；Gemini 丟錯 → 錯誤訊息", async () => {
    extractSpy.mockResolvedValue({ raw: { foo: 1 }, model: "m" });
    const empty = await recognizeReportPhotosAction({
      reportId: ID,
      images: IMAGES,
    });
    expect(empty.ok).toBe(false);

    extractSpy.mockRejectedValue(new Error("Gemini API 失敗（500）"));
    expect(
      await recognizeReportPhotosAction({ reportId: ID, images: IMAGES }),
    ).toEqual({ ok: false, error: "Gemini API 失敗（500）" });
  });
});

describe("showPhotoBackfillEntry（詳情頁入口，與「回填結果」同條件）", () => {
  it("只有已列印顯示", () => {
    expect(showPhotoBackfillEntry("printed", 1)).toBe(true);
    expect(showPhotoBackfillEntry("draft", 0)).toBe(false);
    expect(showPhotoBackfillEntry("completed", 1)).toBe(false);
    expect(showPhotoBackfillEntry("voided", 1)).toBe(false);
  });
});
