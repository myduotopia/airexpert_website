import { describe, it, expect } from "vitest";
import { ADMIN_NAV, activeNavHref, navForRole } from "@/lib/admin/nav-config";

describe("navForRole（後台側欄角色 gating）", () => {
  it("admin 看得到所有非 office 專屬項目（含網站設定 / 人員管理 / 聯絡來信）", () => {
    const keys = navForRole("admin").map((i) => i.key);
    expect(keys).toContain("settings");
    expect(keys).toContain("staff");
    expect(keys).toContain("contact");
    // admin 看到所有項目，但看不到 office 專屬的「保養記錄卡」（資料隔離）。
    const adminVisible = ADMIN_NAV.filter(
      (i) => !i.roles || i.roles.includes("admin"),
    );
    expect(navForRole("admin")).toHaveLength(adminVisible.length);
    expect(keys).not.toContain("maintenance");
    expect(keys).not.toContain("maintenance-customers");
  });

  it("office 只看得到「保養記錄卡」與「客戶」兩項", () => {
    const items = navForRole("office");
    expect(items.map((i) => i.key)).toEqual([
      "maintenance",
      "maintenance-customers",
    ]);
  });

  it("「客戶」為 office 專屬且指向保養卡客戶列表", () => {
    const item = ADMIN_NAV.find((i) => i.key === "maintenance-customers");
    expect(item?.href).toBe("/admin/maintenance/customers");
    expect(item?.enabled).toBe(true);
    expect(item?.roles).toEqual(["office"]);
    expect(
      navForRole("seo_manager").some((i) => i.key === "maintenance-customers"),
    ).toBe(false);
  });

  it("seo_manager 看不到網站設定 / 人員管理 / 聯絡來信", () => {
    const keys = navForRole("seo_manager").map((i) => i.key);
    expect(keys).not.toContain("settings");
    expect(keys).not.toContain("staff");
    expect(keys).not.toContain("contact");
  });

  it("seo_manager 看得到 6 個內容區 + 總覽 + SEO 總覽", () => {
    const keys = navForRole("seo_manager").map((i) => i.key);
    for (const k of [
      "dashboard",
      "seo",
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

  it("SEO 總覽（seo）對 admin 與 seo_manager 皆可見，且無 roles 限制", () => {
    const seo = ADMIN_NAV.find((i) => i.key === "seo");
    expect(seo).toBeDefined();
    expect(seo?.href).toBe("/admin/seo");
    expect(seo?.roles).toBeUndefined();
    expect(navForRole("admin").some((i) => i.key === "seo")).toBe(true);
    expect(navForRole("seo_manager").some((i) => i.key === "seo")).toBe(true);
  });

  it("包含『流量分析』且 admin 與 seo_manager 皆可見", () => {
    const item = ADMIN_NAV.find((i) => i.key === "analytics");
    expect(item).toBeTruthy();
    expect(item?.enabled).toBe(true);
    expect(navForRole("seo_manager").some((i) => i.key === "analytics")).toBe(
      true,
    );
    expect(navForRole("admin").some((i) => i.key === "analytics")).toBe(true);
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

describe("activeNavHref（側欄 active 取最長匹配）", () => {
  const hrefs = navForRole("office").map((i) => i.href);

  it("停在客戶頁時只有「客戶」為 active，不會連「保養記錄卡」也亮", () => {
    expect(activeNavHref("/admin/maintenance/customers", hrefs)).toBe(
      "/admin/maintenance/customers",
    );
    expect(activeNavHref("/admin/maintenance/customers/abc/edit", hrefs)).toBe(
      "/admin/maintenance/customers",
    );
  });

  it("停在保養卡列表 / 卡詳情時為「保養記錄卡」", () => {
    expect(activeNavHref("/admin/maintenance", hrefs)).toBe(
      "/admin/maintenance",
    );
    expect(activeNavHref("/admin/maintenance/abc", hrefs)).toBe(
      "/admin/maintenance",
    );
  });

  it("「總覽」需完全相符，不會對所有後台頁成立", () => {
    const adminHrefs = navForRole("admin").map((i) => i.href);
    expect(activeNavHref("/admin", adminHrefs)).toBe("/admin");
    expect(activeNavHref("/admin/products", adminHrefs)).toBe(
      "/admin/products",
    );
  });

  it("都不匹配時回 null", () => {
    expect(activeNavHref("/admin/unknown", hrefs)).toBeNull();
  });
});
