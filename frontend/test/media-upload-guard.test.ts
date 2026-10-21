import { describe, it, expect, vi, beforeEach } from "vitest";

// createMediaUploadUrl 的權限（#261 review）：
//   1. admin：CMS 媒體，任何資料夾、允許的型別（照舊）。
//   2. 保養卡使用者（office 角色或 maintenance 模組；#261 起可經職位授予多個員工帳號）：
//      只能上傳到 maintenance 資料夾的 JPEG／PNG／WebP 圖片（不可往 CMS 資料夾放檔、不可傳 PDF／SVG）。
//   3. 其他（seo_manager、erp、hr、無 maintenance 的 staff）：不可上傳，也不會簽發網址。

let role: string | null = "admin";
let maintenance = false;
vi.mock("@/lib/admin/auth", () => ({
  getCurrentUserRole: vi.fn(async () => role),
  hasMaintenanceAccess: vi.fn(async () => maintenance),
  requireAdmin: vi.fn(async () => undefined),
}));

const createSignedUploadUrl = vi.fn(async (path: string) => ({
  data: { path, token: "tok" },
  error: null,
}));
vi.mock("@/lib/supabase-admin", () => ({
  getAdminSupabase: () => ({
    storage: {
      from: () => ({
        createSignedUploadUrl,
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://example.invalid/${path}` },
        }),
      }),
    },
  }),
}));

import { createMediaUploadUrl } from "@/lib/admin/storage";

const jpg = {
  folder: "maintenance",
  filename: "card.jpg",
  contentType: "image/jpeg",
  size: 1000,
};

beforeEach(() => {
  role = "admin";
  maintenance = false;
  createSignedUploadUrl.mockClear();
});

describe("createMediaUploadUrl", () => {
  it("admin：CMS 資料夾與 PDF 照舊可上傳", async () => {
    const res = await createMediaUploadUrl({
      folder: "products",
      filename: "manual.pdf",
      contentType: "application/pdf",
    });
    expect(res.ok).toBe(true);
    expect(createSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it("保養卡使用者（office 或 maintenance 模組）：maintenance 資料夾的圖片可上傳", async () => {
    for (const r of ["office", "staff"]) {
      role = r;
      maintenance = true;
      const res = await createMediaUploadUrl(jpg);
      expect(res.ok, r).toBe(true);
      if (res.ok) expect(res.path.startsWith("maintenance/")).toBe(true);
    }
  });

  it("保養卡使用者：其他資料夾、非圖片、未宣告型別或副檔名不符 → 拒絕且不簽發", async () => {
    role = "staff";
    maintenance = true;
    for (const input of [
      { ...jpg, folder: "products" },
      { ...jpg, folder: "maintenance/../products" },
      { ...jpg, filename: "x.pdf", contentType: "application/pdf" },
      { ...jpg, filename: "x.svg", contentType: "image/svg+xml" },
      { ...jpg, contentType: undefined },
      { ...jpg, filename: "x.html" },
    ]) {
      const res = await createMediaUploadUrl(input);
      expect(res.ok, JSON.stringify(input)).toBe(false);
    }
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });

  it("沒有保養卡權限的非 admin 角色 → 沒有上傳權限", async () => {
    for (const r of ["seo_manager", "erp", "hr", "staff", null]) {
      role = r;
      maintenance = false;
      const res = await createMediaUploadUrl(jpg);
      expect(res, String(r)).toEqual({ ok: false, error: "沒有上傳權限" });
    }
    expect(createSignedUploadUrl).not.toHaveBeenCalled();
  });
});
