import { describe, it, expect } from "vitest";
import { calcLineAmount } from "@/lib/erp/calc";
import {
  applyItemToLine,
  lineMissingItem,
  newDraftLine,
} from "@/lib/erp/draft";
import type { DraftLine, ItemOption } from "@/lib/erp/types";

// #232：明細行選品項時帶入主檔的規則（DocumentLinesEditor 的 pickItem 共用）。
// 原本沒有品項（item_id 為空）的行補選品項：保留已有單價與品名規格，只補空白欄位；
// 已有品項改選別的品項：維持舊行為（帶主檔預設）。

const item: ItemOption = {
  id: "i-al",
  code: "LM-AL010N",
  name: "AL 系列 10HP 空壓機",
  kind: "machine",
  unit: "台",
  track_serial: true,
  track_stock: true,
  sale_price: 0,
  purchase_price: 0,
  avg_cost: 0,
  model: "AL-010N",
};

const priced: ItemOption = {
  ...item,
  id: "i-priced",
  code: "LM-AB037",
  name: "AB 系列",
  sale_price: 45000,
  purchase_price: 30000,
  avg_cost: 28000,
};

/** 報價轉銷貨、未對應主檔的行（品項文字已併入品名規格）。 */
function unmatchedLine(patch: Partial<DraftLine> = {}): DraftLine {
  return newDraftLine("item", {
    item_id: null,
    description: "AL-010N 10HP 含安裝",
    qty: 2,
    unit_price: 32000,
    amount: 64000,
    serial_ids: ["s-old"],
    serial_nos: ["N-OLD"],
    ...patch,
  });
}

describe("applyItemToLine（#232 補選品項保留單價與品名規格）", () => {
  it("未對應行補選品項：保留單價、品名規格、數量，補上 item_id", () => {
    const line = unmatchedLine();
    const next = applyItemToLine(line, item, "sale_price");
    expect(next.item_id).toBe("i-al");
    expect(next.unit_price).toBe(32000);
    expect(next.description).toBe("AL-010N 10HP 含安裝");
    expect(next.qty).toBe(2);
    expect(next.key).toBe(line.key);
  });

  it("未對應行補選品項：金額不變（數量×保留的單價），尚未選擇品項提示消失", () => {
    const line = unmatchedLine();
    expect(lineMissingItem(line)).toBe(true);
    const next = applyItemToLine(line, item, "sale_price");
    expect(calcLineAmount(next)).toBe(calcLineAmount(line));
    expect(next.amount).toBe(64000);
    expect(lineMissingItem(next)).toBe(false);
  });

  it("單價為 0 時改帶主檔價（銷貨用售價）", () => {
    const next = applyItemToLine(
      unmatchedLine({ unit_price: 0 }),
      priced,
      "sale_price",
    );
    expect(next.unit_price).toBe(45000);
    expect(next.description).toBe("AL-010N 10HP 含安裝");
    expect(next.amount).toBe(90000);
  });

  it("單價為 0 時改帶主檔價（採購用進價）", () => {
    const next = applyItemToLine(
      unmatchedLine({ unit_price: 0 }),
      priced,
      "purchase_price",
    );
    expect(next.unit_price).toBe(30000);
  });

  it("採購類單價已有值（例如先前帶入的進價）也保留", () => {
    const next = applyItemToLine(
      unmatchedLine({ unit_price: 31500 }),
      priced,
      "purchase_price",
    );
    expect(next.unit_price).toBe(31500);
  });

  it("品名規格空白（含只有空白字元）時帶主檔品名", () => {
    expect(
      applyItemToLine(unmatchedLine({ description: "" }), item, "sale_price")
        .description,
    ).toBe("AL 系列 10HP 空壓機");
    expect(
      applyItemToLine(
        unmatchedLine({ description: "  \n " }),
        item,
        "sale_price",
      ).description,
    ).toBe("AL 系列 10HP 空壓機");
  });

  it("全新空白行選品項：與舊行為相同（帶主檔品名與價格）", () => {
    const next = applyItemToLine(newDraftLine("item"), priced, "sale_price");
    expect(next.item_id).toBe("i-priced");
    expect(next.description).toBe("AB 系列");
    expect(next.unit_price).toBe(45000);
    expect(next.qty).toBe(1);
  });

  it("清空品項文字、清空機號（換了品項，機號需重選）", () => {
    const next = applyItemToLine(
      unmatchedLine({ item_text: "AL-010N" }),
      item,
      "sale_price",
    );
    expect(next.item_text).toBe("");
    expect(next.serial_ids).toEqual([]);
    expect(next.serial_nos).toEqual([]);
  });

  it("保留其他欄位（來源行、DB id）", () => {
    const next = applyItemToLine(
      unmatchedLine({ id: "db-1", source_line_id: null }),
      item,
      "sale_price",
    );
    expect(next.id).toBe("db-1");
    expect(next.source_line_id).toBeNull();
  });

  it("priceField 為 null（調撥／盤點）：單價不動", () => {
    expect(
      applyItemToLine(unmatchedLine({ unit_price: 0 }), priced, null)
        .unit_price,
    ).toBe(0);
    expect(applyItemToLine(unmatchedLine(), priced, null).unit_price).toBe(
      32000,
    );
    // 已有品項改選也不動單價（舊行為）
    expect(
      applyItemToLine(
        newDraftLine("item", { item_id: "i-al", unit_price: 500 }),
        priced,
        null,
      ).unit_price,
    ).toBe(500);
  });

  it("已有品項改選別的品項：維持舊行為（帶主檔品名與預設價）", () => {
    const line = newDraftLine("item", {
      item_id: "i-al",
      description: "客製說明",
      qty: 3,
      unit_price: 32000,
    });
    const sale = applyItemToLine(line, priced, "sale_price");
    expect(sale.item_id).toBe("i-priced");
    expect(sale.description).toBe("AB 系列");
    expect(sale.unit_price).toBe(45000);
    expect(sale.qty).toBe(3);
    expect(sale.amount).toBe(135000);
    expect(applyItemToLine(line, priced, "purchase_price").unit_price).toBe(
      30000,
    );
    // 主檔價為 0 時照舊帶 0
    expect(applyItemToLine(line, item, "sale_price").unit_price).toBe(0);
  });

  it("清除品項（item = null）：維持舊行為", () => {
    const line = newDraftLine("item", {
      item_id: "i-al",
      description: "客製說明",
      unit_price: 32000,
    });
    const next = applyItemToLine(line, null, "sale_price");
    expect(next.item_id).toBeNull();
    expect(next.description).toBe("");
    expect(next.unit_price).toBe(0);
  });
});
