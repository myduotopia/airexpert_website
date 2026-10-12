import { describe, it, expect } from "vitest";

// lib/fetch-all-rows.ts（#229）：PostgREST 預設單次最多回 1,000 列且會靜默截斷，
// 需要完整清單的查詢以 .range 分頁讀到短頁為止；任一頁失敗回 error、不回部分資料。

import {
  FETCH_ALL_MAX_ROWS,
  FETCH_ALL_PAGE_SIZE,
  FETCH_ALL_TOO_MANY_ROWS_CODE,
  fetchAllRows,
} from "@/lib/fetch-all-rows";

type Err = { message: string };
type Page = { data: unknown; error: Err | null };

/**
 * 假的分頁來源：模擬 PostgREST 的 range（含端點），並記錄每次呼叫的 from / to。
 * failAt：第幾次呼叫（0 起算）回錯誤。
 */
function source(total: number, opts: { failAt?: number } = {}) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i }));
  const ranges: [number, number][] = [];
  const build = (from: number, to: number): PromiseLike<Page> => {
    const call = ranges.length;
    ranges.push([from, to]);
    if (call === opts.failAt) {
      return Promise.resolve({ data: null, error: { message: "boom" } });
    }
    return Promise.resolve({ data: all.slice(from, to + 1), error: null });
  };
  return { all, ranges, build };
}

describe("fetchAllRows", () => {
  it("預設每頁 1,000 列（等於 Supabase 預設 max-rows）", () => {
    expect(FETCH_ALL_PAGE_SIZE).toBe(1000);
  });

  it("0 筆 → 查一次，回空陣列", async () => {
    const s = source(0);
    const res = await fetchAllRows(s.build);
    expect(res).toEqual({ data: [], error: null });
    expect(s.ranges).toEqual([[0, 999]]);
  });

  it("未滿一頁 → 只查一次", async () => {
    const s = source(37);
    const res = await fetchAllRows<{ id: number }, Err>(s.build);
    expect(res.data).toHaveLength(37);
    expect(s.ranges).toEqual([[0, 999]]);
  });

  it("剛好 1,000 筆 → 第二頁為空才停止，不重複", async () => {
    const s = source(1000);
    const res = await fetchAllRows<{ id: number }, Err>(s.build);
    expect(res.error).toBeNull();
    expect(res.data).toEqual(s.all);
    expect(s.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("1,001 筆 → 讀兩頁，全部依序串接", async () => {
    const s = source(1001);
    const res = await fetchAllRows<{ id: number }, Err>(s.build);
    expect(res.data).toEqual(s.all);
    expect(s.ranges).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("2,500 筆 → 讀三頁，順序與筆數完整", async () => {
    const s = source(2500);
    const res = await fetchAllRows<{ id: number }, Err>(s.build);
    expect(res.data).toHaveLength(2500);
    expect(res.data!.map((r) => r.id)).toEqual(s.all.map((r) => r.id));
    expect(s.ranges).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("第二頁失敗 → 回 error、data 為 null（不回第一頁的部分資料），且不再往下讀", async () => {
    const s = source(2500, { failAt: 1 });
    const res = await fetchAllRows<{ id: number }, Err>(s.build);
    expect(res).toEqual({ data: null, error: { message: "boom" } });
    expect(s.ranges).toHaveLength(2);
  });

  it("第一頁失敗 → 回 error", async () => {
    const s = source(10, { failAt: 0 });
    const res = await fetchAllRows<{ id: number }, Err>(s.build);
    expect(res).toEqual({ data: null, error: { message: "boom" } });
  });

  it("data 為 null 且無錯誤 → 視為空頁", async () => {
    const res = await fetchAllRows(() =>
      Promise.resolve({ data: null, error: null }),
    );
    expect(res).toEqual({ data: [], error: null });
  });

  it("可指定 pageSize：range 參數依 pageSize 遞增", async () => {
    const s = source(5);
    const res = await fetchAllRows<{ id: number }, Err>(s.build, {
      pageSize: 2,
    });
    expect(res.data).toEqual(s.all);
    expect(s.ranges).toEqual([
      [0, 1],
      [2, 3],
      [4, 5],
    ]);
  });

  it("pageSize 不合法 → 丟 RangeError（避免無窮迴圈）", async () => {
    const s = source(5);
    await expect(fetchAllRows(s.build, { pageSize: 0 })).rejects.toThrow(
      RangeError,
    );
    await expect(fetchAllRows(s.build, { pageSize: 1.5 })).rejects.toThrow(
      RangeError,
    );
    await expect(fetchAllRows(s.build, { maxRows: 0 })).rejects.toThrow(
      RangeError,
    );
    expect(s.ranges).toHaveLength(0);
  });

  it("預設保護上限 500,000 列", () => {
    expect(FETCH_ALL_MAX_ROWS).toBe(500_000);
  });

  it("呼叫端忘了套 range（每頁都回滿頁）→ 讀到保護上限回 error，不會無窮迴圈", async () => {
    const full = Array.from({ length: 10 }, (_, i) => ({ id: i }));
    let n = 0;
    const res = await fetchAllRows(
      () => {
        n += 1;
        return Promise.resolve({ data: full, error: null });
      },
      { pageSize: 10, maxRows: 35 },
    );
    expect(res.data).toBeNull();
    expect(res.error).toMatchObject({ code: FETCH_ALL_TOO_MANY_ROWS_CODE });
    expect(res.error?.message).toContain("35");
    expect(n).toBe(4);
  });

  it("總筆數剛好等於保護上限且最後一頁為短頁 → 正常回傳", async () => {
    const s = source(25);
    const res = await fetchAllRows<{ id: number }, Err>(s.build, {
      pageSize: 10,
      maxRows: 25,
    });
    expect(res.data).toHaveLength(25);
  });
});
