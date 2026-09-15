import { describe, expect, it } from "vitest";

// 庫存區純函式：逐列結存、低庫存判定、存量表、T / A 明細整理與驗證。
import {
  buildStockMatrix,
  computeRunningBalance,
  docHref,
  isLowStock,
  normalizeStockDocLines,
  sumQty,
  validateStockDocDraft,
  validateStockDocForPost,
  type StockDocForPost,
  type StockDocItemInfo,
  type StockMatrixItem,
} from "@/app/admin/(protected)/erp/inventory/_lib/inventory-logic";
import { newDraftLine } from "@/lib/erp/draft";

describe("computeRunningBalance", () => {
  it("從區間前的期初量開始，依日期與時間排序逐列累加", () => {
    const moves = [
      {
        id: "c",
        move_date: "2026-09-10",
        moved_at: "2026-09-10T08:00:00Z",
        qty: -3,
      },
      {
        id: "a",
        move_date: "2026-09-01",
        moved_at: "2026-09-01T02:00:00Z",
        qty: 5,
      },
      {
        id: "b",
        move_date: "2026-09-01",
        moved_at: "2026-09-01T09:00:00Z",
        qty: -1,
      },
    ];
    const rows = computeRunningBalance(10, moves);
    expect(rows.map((r) => [r.id, r.balance])).toEqual([
      ["a", 15],
      ["b", 14],
      ["c", 11],
    ]);
    // 不改動輸入
    expect(moves[0].id).toBe("c");
  });

  it("同一時間（調撥出入兩列）保留輸入順序", () => {
    const t = "2026-09-15T01:00:00Z";
    const rows = computeRunningBalance(0, [
      { id: "out", move_date: "2026-09-15", moved_at: t, qty: -2 },
      { id: "in", move_date: "2026-09-15", moved_at: t, qty: 2 },
    ]);
    expect(rows.map((r) => [r.id, r.balance])).toEqual([
      ["out", -2],
      ["in", 0],
    ]);
  });

  it("小數量不累積浮點誤差；期末 = 期初 + Σ區間異動", () => {
    const moves = [0.1, 0.2, 0.3].map((qty, i) => ({
      move_date: "2026-09-0" + (i + 1),
      moved_at: `2026-09-0${i + 1}T00:00:00Z`,
      qty,
    }));
    const rows = computeRunningBalance(1.5, moves);
    expect(rows.at(-1)!.balance).toBe(2.1);
    expect(rows.at(-1)!.balance).toBe(1.5 + sumQty(moves));
  });

  it("無異動回空陣列", () => {
    expect(computeRunningBalance(7, [])).toEqual([]);
  });
});

describe("isLowStock", () => {
  it("總量低於安全存量才算低庫存", () => {
    expect(isLowStock(2, 3)).toBe(true);
    expect(isLowStock(3, 3)).toBe(false);
    expect(isLowStock(0, 0)).toBe(false);
    expect(isLowStock(-1, 0)).toBe(true);
  });
});

describe("buildStockMatrix", () => {
  const items: StockMatrixItem[] = [
    {
      id: "i2",
      code: "P-OIL",
      name: "專用油",
      kind: "part",
      unit: "桶",
      avg_cost: 1200,
      safety_stock: 5,
      active: true,
    },
    {
      id: "i1",
      code: "ALH-15AI",
      name: "空壓機",
      kind: "machine",
      unit: "台",
      avg_cost: 150000.5,
      safety_stock: 1,
      active: true,
    },
    {
      id: "i3",
      code: "OLD",
      name: "停用品",
      kind: "part",
      unit: "個",
      avg_cost: 10,
      safety_stock: 0,
      active: false,
    },
    {
      id: "i4",
      code: "OLD2",
      name: "停用有庫存",
      kind: "part",
      unit: "個",
      avg_cost: 10,
      safety_stock: 0,
      active: false,
    },
  ];
  const levels = [
    { item_id: "i1", warehouse_id: "main", qty: 2 },
    { item_id: "i1", warehouse_id: "van", qty: 1 },
    { item_id: "i2", warehouse_id: "main", qty: 4 },
    { item_id: "i4", warehouse_id: "main", qty: 3 },
  ];

  it("彙總各倉、總量、庫存金額、低庫存；停用且無庫存的品項不列；依代碼排序", () => {
    const rows = buildStockMatrix(items, levels);
    expect(rows.map((r) => r.code)).toEqual(["ALH-15AI", "OLD2", "P-OIL"]);
    const m = rows[0];
    expect(m.qtyByWarehouse).toEqual({ main: 2, van: 1 });
    expect(m.total).toBe(3);
    expect(m.value).toBe(450002);
    expect(m.low).toBe(false);
    const oil = rows.find((r) => r.code === "P-OIL")!;
    expect(oil.low).toBe(true);
    expect(oil.value).toBe(4800);
  });

  it("篩選類別、只看低庫存、搜尋", () => {
    expect(
      buildStockMatrix(items, levels, { kind: "machine" }).map((r) => r.id),
    ).toEqual(["i1"]);
    expect(
      buildStockMatrix(items, levels, { onlyLow: true }).map((r) => r.id),
    ).toEqual(["i2"]);
    expect(
      buildStockMatrix(items, levels, { q: "空壓" }).map((r) => r.id),
    ).toEqual(["i1"]);
    expect(
      buildStockMatrix(items, levels, { q: "p-oil" }).map((r) => r.id),
    ).toEqual(["i2"]);
  });
});

describe("docHref", () => {
  it("依單別對應路由", () => {
    expect(docHref("S", "x")).toBe("/admin/erp/sales/x");
    expect(docHref("I", "x")).toBe("/admin/erp/receipts/x");
    expect(docHref("PR", "x")).toBe("/admin/erp/purchase-returns/x");
    expect(docHref("T", "x")).toBe("/admin/erp/transfers/x");
    expect(docHref("A", "x")).toBe("/admin/erp/adjustments/x");
  });
});

describe("normalizeStockDocLines", () => {
  const lines = [
    newDraftLine("item", {
      item_id: "m",
      qty: 2,
      unit_price: 99,
      serial_ids: ["s1"],
      serial_nos: ["N1", "N2"],
    }),
    newDraftLine("item", {
      item_id: "m",
      qty: -1,
      serial_ids: ["s2"],
      serial_nos: ["N3"],
    }),
    newDraftLine("item", {
      item_id: "m",
      qty: 0,
      serial_ids: ["s3"],
      serial_nos: ["N4"],
    }),
    newDraftLine("note", { description: "備註", serial_ids: ["x"] }),
  ];

  it("A：盤盈只留新機號、盤虧只留既有機號、單價歸 0", () => {
    const out = normalizeStockDocLines("A", lines);
    expect(out.map((l) => [l.serial_ids, l.serial_nos, l.unit_price])).toEqual([
      [[], ["N1", "N2"], 0],
      [["s2"], [], 0],
      [[], [], 0],
      [[], [], 0],
    ]);
  });

  it("T：只留既有機號", () => {
    const out = normalizeStockDocLines("T", lines);
    expect(out[0].serial_ids).toEqual(["s1"]);
    expect(out[0].serial_nos).toEqual([]);
  });
});

describe("validateStockDocDraft", () => {
  it("A 品項行原因必填（備註行不需要）", () => {
    expect(
      validateStockDocDraft("A", {
        doc_type: "A",
        lines: [
          newDraftLine("note"),
          newDraftLine("item", { item_id: "m", qty: -1, description: "  " }),
        ],
      }),
    ).toBe("第 2 行需填寫調整原因。");
    expect(
      validateStockDocDraft("A", {
        doc_type: "A",
        lines: [
          newDraftLine("item", { item_id: "m", qty: -1, description: "破損" }),
        ],
      }),
    ).toBeNull();
  });

  it("T 數量不可為負；單別須相符", () => {
    expect(
      validateStockDocDraft("T", {
        doc_type: "T",
        lines: [newDraftLine("item", { item_id: "m", qty: -1 })],
      }),
    ).toBe("第 1 行調撥數量不可為負數。");
    expect(validateStockDocDraft("T", { doc_type: "A", lines: [] })).toBe(
      "單別不正確。",
    );
  });
});

describe("validateStockDocForPost", () => {
  const items: StockDocItemInfo[] = [
    { id: "m", code: "ALH-15AI", track_serial: true, track_stock: true },
    { id: "p", code: "P-OIL", track_serial: false, track_stock: true },
    { id: "svc", code: "SVC", track_serial: false, track_stock: false },
  ];
  type Line = StockDocForPost["lines"][number];
  const line = (patch: Partial<Line>): Line => ({
    line_no: 1,
    line_type: "item",
    item_id: "p",
    description: "盤點差異",
    qty: 1,
    serial_nos: null,
    serials: [],
    ...patch,
  });
  const adj = (
    lines: Line[],
    patch: Partial<StockDocForPost> = {},
  ): StockDocForPost => ({
    doc_type: "A",
    status: "draft",
    warehouse_id: "main",
    to_warehouse_id: null,
    lines,
    ...patch,
  });
  const tr = (
    lines: Line[],
    patch: Partial<StockDocForPost> = {},
  ): StockDocForPost => ({
    doc_type: "T",
    status: "draft",
    warehouse_id: "main",
    to_warehouse_id: "van",
    lines,
    ...patch,
  });

  it("A 通過：非序號品項盤虧、序號品項盤盈（新機號）與盤虧（選機號）", () => {
    expect(
      validateStockDocForPost(
        "A",
        adj([
          line({ qty: -2.5 }),
          line({
            line_no: 2,
            item_id: "m",
            qty: 2,
            serial_nos: ["SN1", "SN2"],
          }),
          line({ line_no: 3, item_id: "m", qty: -1, serials: [{ id: "s9" }] }),
        ]),
        items,
      ),
    ).toBeNull();
  });

  it("A 原因必填", () => {
    expect(
      validateStockDocForPost("A", adj([line({ description: "" })]), items),
    ).toBe("第 1 行需填寫調整原因。");
  });

  it("A 盤盈新機號數需等於數量、不可空白或重複", () => {
    expect(
      validateStockDocForPost(
        "A",
        adj([line({ item_id: "m", qty: 2, serial_nos: ["SN1"] })]),
        items,
      ),
    ).toContain("盤盈需輸入 2 個新機號");
    expect(
      validateStockDocForPost(
        "A",
        adj([line({ item_id: "m", qty: 2, serial_nos: ["SN1", "sn1"] })]),
        items,
      ),
    ).toContain("機號重複");
    expect(
      validateStockDocForPost(
        "A",
        adj([line({ item_id: "m", qty: 2, serial_nos: ["SN1", " "] })]),
        items,
      ),
    ).toContain("機號不可空白");
  });

  it("A 盤虧選取機號數需等於 |數量|；序號品項數量需為整數", () => {
    expect(
      validateStockDocForPost(
        "A",
        adj([line({ item_id: "m", qty: -2, serials: [{ id: "s1" }] })]),
        items,
      ),
    ).toContain("盤虧需選取 2 台機號");
    expect(
      validateStockDocForPost(
        "A",
        adj([line({ item_id: "m", qty: 1.5 })]),
        items,
      ),
    ).toContain("需為整數");
  });

  it("A 倉庫必填、數量不可為 0、非追蹤庫存品項不可調整、至少一個品項行", () => {
    expect(
      validateStockDocForPost(
        "A",
        adj([line({})], { warehouse_id: null }),
        items,
      ),
    ).toBe("請選擇盤點調整的倉庫。");
    expect(
      validateStockDocForPost("A", adj([line({ qty: 0 })]), items),
    ).toContain("數量不可為 0");
    expect(
      validateStockDocForPost("A", adj([line({ item_id: "svc" })]), items),
    ).toContain("不追蹤庫存");
    expect(
      validateStockDocForPost(
        "A",
        adj([line({ line_type: "note", item_id: null })]),
        items,
      ),
    ).toBe("單據至少需要一個品項行。");
  });

  it("T：來源 / 目的倉必填且不同、數量為正、選取機號數 = 數量", () => {
    expect(
      validateStockDocForPost("T", tr([line({ description: null })]), items),
    ).toBeNull();
    expect(
      validateStockDocForPost(
        "T",
        tr([line({})], { to_warehouse_id: "main" }),
        items,
      ),
    ).toBe("調撥單的來源倉與目的倉不可相同。");
    expect(
      validateStockDocForPost(
        "T",
        tr([line({})], { to_warehouse_id: null }),
        items,
      ),
    ).toBe("調撥單需選擇來源倉與目的倉。");
    expect(
      validateStockDocForPost("T", tr([line({ qty: -1 })]), items),
    ).toContain("需為正數");
    expect(
      validateStockDocForPost(
        "T",
        tr([line({ item_id: "m", qty: 2, serials: [{ id: "s1" }] })]),
        items,
      ),
    ).toContain("調撥需選取 2 台機號");
  });

  it("單別或狀態不符", () => {
    expect(validateStockDocForPost("T", adj([line({})]), items)).toBe(
      "單別不正確。",
    );
    expect(
      validateStockDocForPost(
        "A",
        adj([line({})], { status: "posted" }),
        items,
      ),
    ).toBe("此單據已不是草稿，無法過帳。");
  });
});
