import { describe, it, expect } from "vitest";
import {
  cardCell,
  cardPartColumn,
  cardServiceType,
  mapReportToCardRecord,
  type CardSyncReport,
} from "@/lib/service-report/card-sync";

// 報告單 → 保養卡一列的對應（#280）。TS 版只供詳情頁預覽，實際寫入在 0041 sr_card_sync_apply；
// 「R1」範例與 supabase/tests/service_report_card_sync_test.sql 相同，兩邊結果必須一致。

const R1: CardSyncReport = {
  report_no: "TEST-X41-1",
  report_date: "2026-10-30",
  machine_id: "m-1",
  service_items: ["new_trial"],
  summary: "新機試車OK",
  results: {
    compressor: {
      run_hours: " 15 ",
      set_pressure: "7.5-8",
      temperature: "81",
      current: "27",
      frequency: "95",
      fan: "normal",
    },
  },
  parts: [
    { no: 1, name: "螺旋專用油", qty: "1桶" },
    { no: 2, name: "機油濾清器", qty: "1" },
    { no: 3, name: "空氣濾清器(外)", qty: "1" },
    { no: 4, name: "空氣濾清器(內)", qty: "1" },
    { no: 5, name: "油氣分離器", qty: "" },
    { no: 6, name: "自動排水器", qty: "1" },
    { no: 7, name: "過濾器濾蕊", qty: "2" },
    { no: 8, name: "油 鏡", qty: "1" },
    { no: 9, name: "", qty: "3" },
    { no: 10, name: "維護及保養工資", qty: "1" },
  ],
  technician: "TEST-師傅甲",
};

describe("cardPartColumn（空壓機卡料件 → 欄位）", () => {
  it.each([
    ["螺旋專用油", "oil"],
    ["潤滑油", "oil"],
    ["機油濾清器", "oil_filter"],
    ["油濾", "oil_filter"],
    ["空氣濾清器(外)", "air_filter"],
    ["空 濾", "air_filter"],
    ["油氣分離器", "oil_separator"],
    ["變頻器風扇", "inverter"],
    ["過濾器濾蕊", "filter_system"],
    ["濾芯", "filter_system"],
    ["維護及保養工資", "skip"],
    ["自動排水器", null],
    ["油鏡", null],
    ["", null],
  ] as const)("%s → %s", (name, col) => {
    expect(cardPartColumn(name)).toBe(col);
  });
});

describe("cardServiceType（服務項目 → 服務類型）", () => {
  it("優先順序：保養 ＞ 維修 ＞ 例檢", () => {
    expect(cardServiceType(["new_trial", "repair", "periodic"])).toBe(
      "maintenance",
    );
    expect(cardServiceType(["routine", "repair"])).toBe("repair");
    expect(cardServiceType(["new_trial"])).toBe("inspection");
    expect(cardServiceType(["routine"])).toBe("inspection");
  });
  it("只有其他或未勾 → null（待人工判定）", () => {
    expect(cardServiceType(["other"])).toBeNull();
    expect(cardServiceType([])).toBeNull();
    expect(cardServiceType(null)).toBeNull();
  });
});

describe("cardCell", () => {
  it("一個料件填數量、多個填品名×數量", () => {
    expect(cardCell(undefined)).toBeNull();
    expect(cardCell([{ name: "a", qty: "1" }])).toBe("1");
    expect(
      cardCell([
        { name: "a", qty: "1" },
        { name: "b", qty: "2" },
      ]),
    ).toBe("a×1、b×2");
  });
});

describe("mapReportToCardRecord", () => {
  it("空壓機卡：與 SQL 測試 R1 相同的結果", () => {
    expect(mapReportToCardRecord(R1, { card_type: "compressor" })).toEqual({
      machine_id: "m-1",
      service_date: "2026-10-30",
      hours: "15",
      technician: "TEST-師傅甲",
      service_type: "inspection",
      oil: "1桶",
      oil_filter: "1",
      air_filter: "空氣濾清器(外)×1、空氣濾清器(內)×1",
      oil_separator: null,
      inverter: null,
      filter_system: "2",
      values: null,
      note: "新機試車OK\n其他料件：自動排水器×1、油 鏡×1\n維護報告單 TEST-X41-1",
    });
  });

  it("沒有機台 → null（不同步）", () => {
    expect(
      mapReportToCardRecord(
        { ...R1, machine_id: null },
        { card_type: "compressor" },
      ),
    ).toBeNull();
  });

  it("過濾卡：時數取乾燥機總時數，料件依欄名（去空白、不分大小寫）寫 values", () => {
    const rec = mapReportToCardRecord(
      {
        ...R1,
        report_no: "TEST-X41-3",
        service_items: ["routine", "repair"],
        summary: null,
        results: {
          compressor: { run_hours: "999" },
          dryer: { total_hours: "1200" },
        },
        parts: [
          { no: 1, name: "ea350-q濾蕊", qty: "1" },
          { no: 2, name: "自動排水器", qty: "1" },
          { no: 3, name: "散熱馬達", qty: "1" },
        ],
        technician: "TEST-師傅乙",
      },
      {
        card_type: "filter",
        columns: [
          { id: "c-1", label: "EA350-Q 濾蕊" },
          { id: "c-2", label: "自動排水器" },
        ],
      },
    );
    expect(rec).toMatchObject({
      hours: "1200",
      service_type: "repair",
      oil: null,
      filter_system: null,
      values: { "c-1": "1", "c-2": "1" },
      note: "其他料件：散熱馬達×1\n維護報告單 TEST-X41-3",
    });
  });

  it("空白時數、空白維護人員 → null；格式不對的料件略過", () => {
    const rec = mapReportToCardRecord(
      {
        ...R1,
        results: {},
        technician: "  ",
        parts: [null as never, { no: 1, name: "機油濾清器", qty: " " }],
        summary: "",
      },
      { card_type: "compressor" },
    );
    expect(rec?.hours).toBeNull();
    expect(rec?.technician).toBeNull();
    expect(rec?.oil_filter).toBeNull();
    expect(rec?.note).toBe("維護報告單 TEST-X41-1");
  });
});
