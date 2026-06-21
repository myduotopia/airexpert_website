import { describe, it, expect } from "vitest";
import { ADMIN_NAV, navForRole } from "@/lib/admin/nav-config";

describe("navForRole（後台側欄角色 gating）", () => {
  it("admin 看得到所有項目（含網站設定 / 人員管理 / 聯絡來信）", () => {
    const keys = navForRole("admin").map((i) => i.key);
    expect(keys).toContain("settings");
    expect(keys).toContain("staff");
    expect(keys).toContain("contact");
    // admin 應看到全部項目
    expect(navForRole("admin")).toHaveLength(ADMIN_NAV.length);
  });

  it("seo_manager 看不到網站設定 / 人員管理 / 聯絡來信", () => {
    const keys = navForRole("seo_manager").map((i) => i.key);
    expect(keys).not.toContain("settings");
    expect(keys).not.toContain("staff");
    expect(keys).not.toContain("contact");
  });

  it("seo_manager 看得到 6 個內容區 + 總覽", () => {
    const keys = navForRole("seo_manager").map((i) => i.key);
    for (const k of [
      "dashboard",
      "home",
      "products",
      "news",
      "services",
      "cases",
      "events",
    ]) {
      expect(keys).toContain(k);
    }
  });

  it("admin-only 項目皆以 roles:['admin'] 標記", () => {
    for (const key of ["settings", "staff", "contact"]) {
      const item = ADMIN_NAV.find((i) => i.key === key);
      expect(item?.roles).toEqual(["admin"]);
    }
  });

  it("未標 roles 的項目對兩種角色皆可見", () => {
    const products = ADMIN_NAV.find((i) => i.key === "products");
    expect(products?.roles).toBeUndefined();
    expect(navForRole("admin").some((i) => i.key === "products")).toBe(true);
    expect(navForRole("seo_manager").some((i) => i.key === "products")).toBe(
      true,
    );
  });
});
