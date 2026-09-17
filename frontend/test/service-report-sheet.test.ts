import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReportSheet } from "@/components/service-report/ReportSheet";
import {
  COLUMNS_MM,
  CONTENT_HEIGHT_MM,
  CONTENT_WIDTH_MM,
  SAFE_MARGIN_MM,
  SECTION_HEIGHTS_MM,
  SHEET_HEIGHT_MM,
  checkGlyph,
  gridTracks,
  rocShortDate,
  sheetTransform,
  splitParts,
  totalContentHeightMm,
} from "@/components/service-report/sheet-layout";
import {
  defaultParts,
  emptySheetData,
  type ServiceReportSheetData,
} from "@/lib/service-report/types";

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

describe("sheet-layout 幾何預算", () => {
  it("安全範圍：內容區 194 × 279mm", () => {
    expect(CONTENT_WIDTH_MM).toBe(194);
    expect(CONTENT_HEIGHT_MM).toBe(279);
    expect(SAFE_MARGIN_MM.top + CONTENT_HEIGHT_MM + SAFE_MARGIN_MM.bottom).toBe(
      SHEET_HEIGHT_MM,
    );
  });

  it("各區高度總和 ≤ 279mm", () => {
    expect(totalContentHeightMm()).toBe(277.5);
    expect(totalContentHeightMm()).toBeLessThanOrEqual(CONTENT_HEIGHT_MM);
  });

  it("各列欄寬總和 = 內容寬（服務項目右側子列 = 右欄寬）", () => {
    const { equip1, equip2, equip3, serviceOuter, ...full } = COLUMNS_MM;
    for (const [name, cols] of Object.entries(full)) {
      expect(sum(cols), name).toBe(CONTENT_WIDTH_MM);
    }
    expect(sum(serviceOuter)).toBe(CONTENT_WIDTH_MM);
    for (const cols of [equip1, equip2, equip3]) {
      expect(sum(cols)).toBe(serviceOuter[2]);
    }
    expect(SECTION_HEIGHTS_MM.service).toBe(SECTION_HEIGHTS_MM.date * 3);
  });

  it("gridTracks 以 --u 表示", () => {
    expect(gridTracks([20, 7.5])).toBe(
      "calc(var(--u) * 20) calc(var(--u) * 7.5)",
    );
  });
});

describe("rocShortDate", () => {
  it("西元 → 紙本民國格式（無前綴、補零）", () => {
    expect(rocShortDate("2026-09-02")).toBe("115/09/02");
    expect(rocShortDate("2026-12-31T00:00:00Z")).toBe("115/12/31");
  });
  it("空 / 無效 → 空字串（留白供手寫）", () => {
    expect(rocShortDate("")).toBe("");
    expect(rocShortDate(null)).toBe("");
    expect(rocShortDate("abc")).toBe("");
  });
});

describe("checkGlyph / sheetTransform / splitParts", () => {
  it("勾選框字元", () => {
    expect(checkGlyph(true)).toBe("■");
    expect(checkGlyph(false)).toBe("□");
  });

  it("校正 transform：預設值不輸出，無效值回預設", () => {
    expect(sheetTransform(undefined)).toBeUndefined();
    expect(
      sheetTransform({ offsetXmm: 0, offsetYmm: 0, scale: 1 }),
    ).toBeUndefined();
    expect(sheetTransform({ offsetXmm: 2, offsetYmm: -1.5, scale: 0.98 })).toBe(
      "translate(calc(var(--u) * 2), calc(var(--u) * -1.5)) scale(0.98)",
    );
    // 無效值回預設、超出範圍依 layout.ts 的 clampCalibration 限制（±15mm、0.9–1.1）。
    expect(sheetTransform({ offsetXmm: NaN, offsetYmm: 3, scale: 1 })).toBe(
      "translate(calc(var(--u) * 0), calc(var(--u) * 3)) scale(1)",
    );
    expect(sheetTransform({ offsetXmm: 40, offsetYmm: -40, scale: 2 })).toBe(
      "translate(calc(var(--u) * 15), calc(var(--u) * -15)) scale(1.1)",
    );
  });

  it("料件左 1–5、右 6–10，缺列補空白", () => {
    const rows = splitParts(defaultParts());
    expect(rows.map((r) => [r.left.no, r.right.no])).toEqual([
      [1, 6],
      [2, 7],
      [3, 8],
      [4, 9],
      [5, 10],
    ]);
    expect(rows[4].right.name).toBe("維護及保養工資");
    const sparse = splitParts([{ no: 7, name: "X", qty: "1" }]);
    expect(sparse[0].left).toEqual({ no: 1, name: "", qty: "" });
    expect(sparse[1].right.name).toBe("X");
  });
});

function sample(): ServiceReportSheetData {
  const parts = defaultParts();
  parts[0].qty = "1桶";
  parts[1].qty = "2";
  parts[2].qty = "2";
  return {
    ...emptySheetData(),
    report_no: "X11509009",
    report_date: "2026-09-02",
    time_slot: "morning",
    header_code: "KK855-2",
    customer_name: "鼎佑電子工業(股)公司",
    phone: "02-2222-3333",
    tax_id: "12345678",
    contact: "王先生 0912-345-678",
    address: "新北市樹林區某路 1 號",
    equipment: "AM3-37A-E30可變轉速迴轉式空氣壓縮機220V",
    model: "AM3-37A-E30",
    voltage: "220V",
    serial_no: "SN-001",
    machine_state: "running",
    service_items: ["periodic"],
    summary: "更換機油、油濾、空濾。\n建議下次更換油氣分離器。",
    results: {
      compressor: {
        run_hours: "22278",
        consumable_hours: "0/1500",
        frequency: "101",
        set_pressure: "7.5-8",
        temperature: "81",
        current: "102",
        fan: "normal",
        inverter_fan: "normal",
        inverter_params: "abnormal",
      },
      dryer: { refrigerant_high: "normal", tank_drain: "normal" },
      filter_consumable: "replace",
    },
    parts,
    suggestions: ["rotor"],
    technician: "陳師傅",
  };
}

describe("ReportSheet render", () => {
  it("帶資料：關鍵欄位與勾選框", () => {
    const html = renderToStaticMarkup(
      createElement(ReportSheet, {
        data: sample(),
        mode: "print",
        calibration: { offsetXmm: 1, offsetYmm: 0, scale: 1 },
      }),
    );
    for (const s of [
      "機台維護報告單",
      "勁賀空壓科技有限公司",
      "Jin He Air Compressor Technology Co., Ltd.",
      "JIN HE",
      "KK855-2",
      "115/09/02",
      "■早上",
      "□中午",
      "□下午",
      "X11509009",
      "鼎佑電子工業(股)公司",
      "AM3-37A-E30可變轉速迴轉式空氣壓縮機220V",
      "■運轉",
      "□待機",
      "■定期大/小保養",
      "□新機試車",
      "22278",
      "7.5-8",
      "0/1500",
      "■建議更換",
      "□可續用",
      "1桶",
      "螺旋專用油",
      "維護及保養工資",
      "■壓縮轉子年度歲修",
      "□傳動系統年度維護",
      "陳師傅",
      "第四聯:客戶收執聯(黃)",
      "服務電話02-2675-9977",
      "translate(calc(var(--u) * 1), calc(var(--u) * 0)) scale(1)",
    ]) {
      expect(html, s).toContain(s);
    }
    // 變頻器參數 異常
    expect(html).toContain("■異常");
  });

  it("空白表單：無選中、無資料、有 logo 時用圖片", () => {
    const html = renderToStaticMarkup(
      createElement(ReportSheet, {
        data: emptySheetData(),
        mode: "preview",
        logoUrl: "https://example.com/logo.png",
      }),
    );
    expect(html).not.toContain("■");
    expect(html).toContain("□早上");
    expect(html).toContain("□正常");
    expect(html).toContain('src="https://example.com/logo.png"');
    expect(html).not.toContain("transform:");
    expect(html).toContain("過濾器濾蕊");
  });
});
