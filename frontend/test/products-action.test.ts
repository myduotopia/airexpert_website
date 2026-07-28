import { describe, it, expect, vi, beforeEach } from "vitest";

// 商品 server action（create / update）寫入列的測試，聚焦 #84：manual_url 解析。
//   * 有值 → trim 後寫入
//   * 空字串 / 純空白 → null
// 以 mock @/lib/admin/crud 捕捉送進 DB 的 values；parseSeoFields 為純函式，照常執行。
// 型別化簽章讓 mock.calls[i] 推得為具長度的參數陣列（否則無參數實作會被推成空 tuple，索引報錯）。
const { createRow, updateRow } = vi.hoisted(() => ({
  createRow: vi.fn<(...args: unknown[]) => Promise<{ ok: true }>>(async () => ({
    ok: true,
  })),
  updateRow: vi.fn<(...args: unknown[]) => Promise<{ ok: true }>>(async () => ({
    ok: true,
  })),
}));
vi.mock("@/lib/admin/crud", () => ({
  createRow,
  updateRow,
  deleteRow: vi.fn(),
  reorderRows: vi.fn(),
}));
vi.mock("next/cache", () => ({ updateTag: vi.fn() }));
vi.mock("@/lib/admin/auth", () => ({ requireAdmin: vi.fn(async () => {}) }));
vi.mock("@/lib/supabase-admin", () => ({ getAdminSupabase: vi.fn() }));

import {
  createProductAction,
  updateProductAction,
} from "@/app/admin/(protected)/products/actions";

function baseForm(manual: string | undefined): FormData {
  const fd = new FormData();
  fd.set("name", "AX-S9");
  fd.set("slug", "ax-s9");
  fd.set("category", "無油式");
  fd.set("status", "published");
  if (manual !== undefined) fd.set("manual_url", manual);
  return fd;
}

beforeEach(() => {
  createRow.mockClear();
  updateRow.mockClear();
});

describe("商品 action 寫入 manual_url（#84）", () => {
  it("create：有值 → trim 後寫入", async () => {
    const res = await createProductAction({}, baseForm("  https://x/m.pdf  "));
    expect(res.ok).toBe(true);
    const values = createRow.mock.calls[0][1] as Record<string, unknown>;
    expect(values.manual_url).toBe("https://x/m.pdf");
  });

  it("create：空字串 → null", async () => {
    await createProductAction({}, baseForm("   "));
    const values = createRow.mock.calls[0][1] as Record<string, unknown>;
    expect(values.manual_url).toBeNull();
  });

  it("create：未提供欄位 → null", async () => {
    await createProductAction({}, baseForm(undefined));
    const values = createRow.mock.calls[0][1] as Record<string, unknown>;
    expect(values.manual_url).toBeNull();
  });

  it("update：有值 → trim 後寫入", async () => {
    const update = updateProductAction.bind(null, "prod-1");
    const res = await update({}, baseForm("https://x/manual.pdf"));
    expect(res.ok).toBe(true);
    const values = updateRow.mock.calls[0][2] as Record<string, unknown>;
    expect(values.manual_url).toBe("https://x/manual.pdf");
  });
});
