import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ updateTag: () => {} }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase-admin", () => ({ getAdminSupabase: vi.fn() }));

import { reorderRows } from "@/lib/admin/crud";
import { getAdminSupabase } from "@/lib/supabase-admin";

type Update = { table: string; id: string; sort: number };

function fakeAdmin() {
  const updates: Update[] = [];
  const admin = {
    from(table: string) {
      const b = {
        _v: 0,
        update(v: { sort_order: number }) {
          b._v = v.sort_order;
          return b;
        },
        eq(_col: string, id: string) {
          updates.push({ table, id, sort: b._v });
          return Promise.resolve({ error: null });
        },
      };
      return b;
    },
  };
  return { admin, updates };
}

beforeEach(() => vi.mocked(getAdminSupabase).mockReset());

describe("reorderRows（拖移排序重新編號）", () => {
  it("把 sort_order 依新順序設為 0,1,2…（序列、不重複、遞增）", async () => {
    const { admin, updates } = fakeAdmin();
    vi.mocked(getAdminSupabase).mockReturnValue(
      admin as unknown as ReturnType<typeof getAdminSupabase>,
    );

    const res = await reorderRows("products", ["c", "a", "b"]);

    expect(res.ok).toBe(true);
    expect(updates).toEqual([
      { table: "products", id: "c", sort: 0 },
      { table: "products", id: "a", sort: 1 },
      { table: "products", id: "b", sort: 2 },
    ]);
    const sorts = updates.map((u) => u.sort);
    expect(sorts).toEqual([...sorts].sort((x, y) => x - y)); // 遞增
    expect(new Set(sorts).size).toBe(sorts.length); // 不重複
  });

  it("任一筆更新失敗 → 回 ok:false", async () => {
    const admin = {
      from: () => ({
        update: () => ({
          eq: () => Promise.resolve({ error: { message: "boom" } }),
        }),
      }),
    };
    vi.mocked(getAdminSupabase).mockReturnValue(
      admin as unknown as ReturnType<typeof getAdminSupabase>,
    );
    const res = await reorderRows("products", ["a"]);
    expect(res.ok).toBe(false);
  });
});
