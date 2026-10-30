import { describe, it, expect } from "vitest";
import {
  LOW_CONFIDENCE_FIELD_LABELS,
  MAX_PHOTOS,
  SERVICE_REPORT_PHOTO_PROMPT,
  SERVICE_REPORT_PHOTO_SCHEMA,
  canPhotoBackfill,
  emptyExtraction,
  isEmptyExtraction,
  normalizeReportExtraction,
  parsePhotoDate,
  reportNoMismatch,
  validatePhotos,
} from "@/lib/service-report/photo-extract";
import { buildServiceReportPhotoRequest } from "@/lib/ai/gemini";

// 維護報告單拍照辨識（#280）：模型輸出的正規化（不呼叫真的 Gemini）。

/** #279 模擬手寫報告單的預期辨識結果（測試資料皆為虛構）。 */
const SAMPLE = {
  report_no: " x11510002 ",
  report_date: "115/10/30",
  time_slot: "早上",
  machine_state: "running",
  service_items: ["new_trial", "新機試車", "bogus"],
  summary: "新機試車OK  \r\n時15 溫81\n",
  compressor: {
    run_hours: "15",
    set_pressure: "7.5-8",
    temperature: 81,
    current: "27",
    frequency: "95",
    fan: "正常",
    inverter_fan: "normal",
    inverter_params: "NORMAL",
    oil_pressure: "9", // 未知欄位
  },
  dryer: { total_hours: "", cooling_fan: "異常", refrigerant_high: "maybe" },
  filter_consumable: "建議更換",
  parts: [
    { name: "螺旋專用油", qty: "1桶" },
    { name: "機油濾清器", qty: "" },
    { name: "x", qty: { n: 1 } },
    "not-an-object",
  ],
  suggestions: ["motor", "壓縮轉子年度歲修", 3],
  technicians: ["師傅甲、師傅乙"],
  customer_signer: "客戶王",
  low_confidence: ["compressor.current", "nope", "compressor.current"],
  extra_top_level: "drop me",
};

describe("normalizeReportExtraction", () => {
  it("把 #279 範例整形成報告單欄位（中英文列舉、民國日期、數字轉字串）", () => {
    const e = normalizeReportExtraction(SAMPLE);
    expect(e).toEqual({
      report_no: "X11510002",
      report_date: "2026-10-30",
      time_slot: "morning",
      machine_state: "running",
      service_items: ["new_trial"],
      summary: "新機試車OK\n時15 溫81",
      results: {
        compressor: {
          run_hours: "15",
          set_pressure: "7.5-8",
          temperature: "81",
          current: "27",
          frequency: "95",
          fan: "normal",
          inverter_fan: "normal",
          inverter_params: "normal",
        },
        dryer: { cooling_fan: "abnormal" },
        filter_consumable: "replace",
      },
      parts: [{ name: "螺旋專用油", qty: "1桶" }],
      suggestions: ["motor", "rotor"],
      technicians: ["師傅甲", "師傅乙"],
      customer_signer: "客戶王",
      low_confidence: ["compressor.current"],
    });
  });

  it("未知 key 一律丟棄（頂層與 compressor／dryer 內）", () => {
    const e = normalizeReportExtraction(SAMPLE) as unknown as Record<
      string,
      unknown
    >;
    expect(e).not.toHaveProperty("extra_top_level");
    expect(
      (e.results as { compressor: Record<string, unknown> }).compressor,
    ).not.toHaveProperty("oil_pressure");
  });

  it("型別不對 → 空值，不丟錯", () => {
    const e = normalizeReportExtraction({
      report_no: 123456789012345678901234,
      report_date: 20261030,
      time_slot: ["morning"],
      service_items: "new_trial",
      summary: { text: "x" },
      compressor: ["15"],
      dryer: "ok",
      parts: { name: "a", qty: "1" },
      suggestions: null,
      technicians: 5,
      customer_signer: true,
      low_confidence: "compressor.current",
    });
    expect(e.report_date).toBeNull();
    expect(e.time_slot).toBeNull();
    expect(e.service_items).toEqual([]);
    expect(e.summary).toBe("");
    expect(e.results).toEqual({});
    expect(e.parts).toEqual([]);
    expect(e.suggestions).toEqual([]);
    expect(e.technicians).toEqual([]);
    expect(e.customer_signer).toBe("");
    expect(e.low_confidence).toEqual([]);
    // 數字單號收成字串後截到上限 20 字
    expect(e.report_no.length).toBeLessThanOrEqual(20);
  });

  it("非物件輸入 → 空結果", () => {
    for (const raw of [null, undefined, "x", 1, [], [{}]]) {
      expect(normalizeReportExtraction(raw)).toEqual(emptyExtraction());
    }
    expect(isEmptyExtraction(normalizeReportExtraction(null))).toBe(true);
    expect(isEmptyExtraction(normalizeReportExtraction(SAMPLE))).toBe(false);
  });

  it("文字截到欄位上限", () => {
    const e = normalizeReportExtraction({
      compressor: { run_hours: "9".repeat(80) },
      customer_signer: "名".repeat(80),
      parts: [{ name: "品".repeat(80), qty: "1".repeat(40) }],
    });
    expect(e.results.compressor?.run_hours).toHaveLength(50);
    expect(e.customer_signer).toHaveLength(50);
    expect(e.parts[0].name).toHaveLength(50);
    expect(e.parts[0].qty).toHaveLength(20);
  });
});

describe("parsePhotoDate", () => {
  it.each([
    ["2026-10-30", "2026-10-30"],
    ["115/10/30", "2026-10-30"],
    ["115.1.5", "2026-01-05"],
    ["115年10月30日", "2026-10-30"],
    ["115/02/30", null],
    ["10/30", null],
    ["", null],
  ])("%s → %s", (input, expected) => {
    expect(parsePhotoDate(input)).toBe(expected);
  });
});

describe("reportNoMismatch", () => {
  it("相同（忽略大小寫、空白）或照片沒有單號 → null；不同 → 照片上的單號", () => {
    expect(reportNoMismatch("x11510002", "X11510002")).toBeNull();
    expect(reportNoMismatch(" X1151 0002", "X11510002")).toBeNull();
    expect(reportNoMismatch("", "X11510002")).toBeNull();
    expect(reportNoMismatch("X11510003", "X11510002")).toBe("X11510003");
  });
});

describe("validatePhotos", () => {
  const ok = { base64: "AAAA", mimeType: "image/jpeg" };
  it("合格 → null", () => {
    expect(validatePhotos([ok])).toBeNull();
    expect(validatePhotos(Array(MAX_PHOTOS).fill(ok))).toBeNull();
  });
  it("數量、型別、格式不合格 → 錯誤訊息", () => {
    expect(validatePhotos([])).toBe("請至少選擇一張照片");
    expect(validatePhotos(undefined)).toBe("請至少選擇一張照片");
    expect(validatePhotos(Array(MAX_PHOTOS + 1).fill(ok))).toMatch(/最多/);
    expect(validatePhotos([{ base64: "AAAA", mimeType: "image/gif" }])).toMatch(
      /不支援/,
    );
    expect(validatePhotos([{ base64: "", mimeType: "image/jpeg" }])).toBe(
      "照片格式不正確",
    );
    expect(
      validatePhotos([
        { base64: "A".repeat(14_000_001), mimeType: "image/png" },
      ]),
    ).toBe("照片過大");
  });
});

describe("canPhotoBackfill", () => {
  it("只有已列印（待回填）可以", () => {
    expect(canPhotoBackfill("printed")).toBe(true);
    expect(canPhotoBackfill("draft")).toBe(false);
    expect(canPhotoBackfill("completed")).toBe(false);
    expect(canPhotoBackfill("voided")).toBe(false);
  });
});

describe("prompt／schema／請求主體", () => {
  it("prompt 列出的低信心代號與白名單一致", () => {
    for (const key of Object.keys(LOW_CONFIDENCE_FIELD_LABELS)) {
      expect(SERVICE_REPORT_PHOTO_PROMPT).toContain(key);
    }
  });

  it("請求主體：prompt + 每張照片一個 inlineData，帶 responseSchema；schema=null 時不帶", () => {
    const images = [
      { base64: "AAA", mimeType: "image/jpeg" },
      { base64: "BBB", mimeType: "image/png" },
    ];
    const body = buildServiceReportPhotoRequest(
      images,
      SERVICE_REPORT_PHOTO_SCHEMA,
    ) as {
      contents: { parts: Record<string, unknown>[] }[];
      generationConfig: Record<string, unknown>;
    };
    expect(body.contents[0].parts).toEqual([
      { text: SERVICE_REPORT_PHOTO_PROMPT },
      { inlineData: { mimeType: "image/jpeg", data: "AAA" } },
      { inlineData: { mimeType: "image/png", data: "BBB" } },
    ]);
    expect(body.generationConfig.responseSchema).toBe(
      SERVICE_REPORT_PHOTO_SCHEMA,
    );
    const plain = buildServiceReportPhotoRequest(images, null) as {
      generationConfig: Record<string, unknown>;
    };
    expect(plain.generationConfig).not.toHaveProperty("responseSchema");
    expect(plain.generationConfig.responseMimeType).toBe("application/json");
  });
});
