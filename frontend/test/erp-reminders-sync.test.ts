import { describe, it, expect } from "vitest";
import {
  isEmptySyncPlan,
  planVendorReminderSync,
  type ExistingReminderRule,
} from "@/lib/erp/reminders/sync";

// 提醒事項（#274）：廠商備註 → auto 規則同步計畫（純函式）。資料全為虛構。

const TODAY = "2026-11-03";

function existing(p: Partial<ExistingReminderRule>): ExistingReminderRule {
  return {
    id: "x",
    vendor_id: "v1",
    source: "auto",
    auto_key: "m:10:匯款",
    active: true,
    auto_missing: false,
    source_text: "每月10號匯款",
    title: "匯款",
    kind: "monthly",
    day_of_month: 10,
    weekday: null,
    month: null,
    ...p,
  };
}
const vendor = (note: string | null, id = "v1", payment_terms = null) => ({
  id,
  note,
  payment_terms,
});

describe("planVendorReminderSync", () => {
  it("新廠商：依備註新增 auto 規則（起算日＝今天）", () => {
    const plan = planVendorReminderSync(
      [vendor("每月10號匯款，月底對帳")],
      [],
      TODAY,
    );
    expect(plan.vendor_ids).toEqual(["v1"]);
    expect(plan.update).toEqual([]);
    expect(plan.insert).toEqual([
      {
        vendor_id: "v1",
        auto_key: "m:10:匯款",
        title: "匯款",
        kind: "monthly",
        day_of_month: 10,
        weekday: null,
        month: null,
        source_text: "每月10號匯款，月底對帳",
        start_date: TODAY,
      },
      expect.objectContaining({ auto_key: "m:-1:對帳", day_of_month: -1 }),
    ]);
  });

  it("重跑同一份備註：沒有任何變更（可重複執行）", () => {
    const plan = planVendorReminderSync(
      [vendor("每月10號匯款")],
      [existing({})],
      TODAY,
    );
    expect(isEmptySyncPlan(plan)).toBe(true);
  });

  it("備註改寫但意思相同：只更新原文，不重建、不動使用者改過的標題／啟用狀態", () => {
    const plan = planVendorReminderSync(
      [vendor("每個月 10 日要匯款")],
      [existing({ title: "匯款給甲廠商", active: false })],
      TODAY,
    );
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([
      {
        id: "x",
        source_text: "每個月 10 日要匯款",
        active: false,
        auto_missing: false,
      },
    ]);
  });

  it("備註不再出現：停用並標記 auto_missing；已標記過的不重複更新", () => {
    const plan = planVendorReminderSync(
      [vendor("請開三聯式發票")],
      [
        existing({}),
        existing({
          id: "y",
          auto_key: "w:3:送貨",
          active: false,
          auto_missing: true,
        }),
      ],
      TODAY,
    );
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([
      {
        id: "x",
        source_text: "每月10號匯款",
        active: false,
        auto_missing: true,
      },
    ]);
  });

  it("之前因備註刪除而停用的規則，備註再出現時重新啟用", () => {
    const plan = planVendorReminderSync(
      [vendor("每月10號匯款")],
      [existing({ active: false, auto_missing: true })],
      TODAY,
    );
    expect(plan.update).toEqual([
      {
        id: "x",
        source_text: "每月10號匯款",
        active: true,
        auto_missing: false,
      },
    ]);
  });

  it("不動 manual 規則：不更新、不停用；同週期同事項的手動規則已存在時不另建 auto", () => {
    const manual = existing({
      id: "m1",
      source: "manual",
      auto_key: null,
      source_text: null,
    });
    const otherManual = existing({
      id: "m2",
      source: "manual",
      auto_key: null,
      title: "盤點",
      kind: "weekly",
      day_of_month: null,
      weekday: 5,
    });
    const plan = planVendorReminderSync(
      [vendor("每月10號匯款，每週三送貨")],
      [manual, otherManual],
      TODAY,
    );
    expect(plan.update).toEqual([]);
    expect(plan.insert.map((i) => i.auto_key)).toEqual(["w:3:送貨"]);

    // 備註清空：manual 仍不出現在任何更新中
    const cleared = planVendorReminderSync(
      [vendor(null)],
      [manual, otherManual],
      TODAY,
    );
    expect(isEmptySyncPlan(cleared)).toBe(true);
  });

  it("只處理這次同步的廠商；其他廠商的 auto 規則不動", () => {
    const plan = planVendorReminderSync(
      [vendor("每月10號匯款", "v1")],
      [existing({ id: "o1", vendor_id: "v2", auto_key: "m:5:請款" })],
      TODAY,
    );
    expect(plan.update).toEqual([]);
    expect(plan.insert.map((i) => i.vendor_id)).toEqual(["v1"]);
  });

  it("付款條件也一起解析", () => {
    const plan = planVendorReminderSync(
      [{ id: "v1", note: null, payment_terms: "月結30天，每月25日請款" }],
      [],
      TODAY,
    );
    expect(plan.insert.map((i) => [i.auto_key, i.source_text])).toEqual([
      ["m:25:請款", "付款條件：月結30天，每月25日請款"],
    ]);
  });
});
