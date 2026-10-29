import { describe, it, expect } from "vitest";
import {
  ADMIN_NAV,
  activeNavHref,
  navForRole,
  navForUser,
} from "@/lib/admin/nav-config";

describe("navForRole（後台側欄角色 gating）", () => {
  it("admin 看得到所有非 office 專屬項目（含網站設定 / 人員管理 / 聯絡來信）", () => {
    const keys = navForRole("admin").map((i) => i.key);
    expect(keys).toContain("settings");
    expect(keys).toContain("staff");
    expect(keys).toContain("contact");
    // admin 看到所有項目，但看不到 office 專屬的「保養記錄卡」（資料隔離）。
    const adminVisible = ADMIN_NAV.filter(
      (i) => !i.modules && (!i.roles || i.roles.includes("admin")),
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

describe("navForUser（模組授權 gating，spec §3.2）", () => {
  const erpKeys = ADMIN_NAV.filter((i) => i.modules?.includes("erp")).map(
    (i) => i.key,
  );

  it("ERP 項目一次列齊：9 項（含週報 #271）、group ERP、總覽為 enabled", () => {
    expect(erpKeys).toEqual([
      "erp",
      "erp-sales",
      "erp-purchases",
      "erp-inventory",
      "erp-collections",
      "erp-statements",
      "erp-reports",
      "erp-meeting",
      "erp-items",
    ]);
    for (const i of ADMIN_NAV.filter((x) => x.modules?.includes("erp"))) {
      expect(i.group).toBe("ERP");
      expect(i.href.startsWith("/admin/erp")).toBe(true);
    }
    expect(ADMIN_NAV.find((i) => i.key === "erp")?.enabled).toBe(true);
    // 各 W1 區段上線時會把自己那行改 enabled，故此處不鎖定其餘項目的狀態。
  });

  it("navForRole 不回傳只以模組 gating 的項目（任何角色；含 ERP 全部項目）", () => {
    for (const role of [
      "admin",
      "seo_manager",
      "office",
      "erp",
      "hr",
      "staff",
    ] as const) {
      expect(navForRole(role).some((i) => i.modules && !i.roles)).toBe(false);
      expect(navForRole(role).some((i) => i.modules?.includes("erp"))).toBe(
        false,
      );
    }
  });

  it("erp 角色 + erp 授權：側欄剛好只有 ERP 那幾項（無 CMS / 設定 / 保養卡）", () => {
    expect(navForUser("erp", ["erp"]).map((i) => i.key)).toEqual(erpKeys);
  });

  it("erp 角色無授權：側欄為空（不會因預設角色而露出任何項目）", () => {
    expect(navForUser("erp", [])).toEqual([]);
    expect(navForRole("erp")).toEqual([]);
  });

  it("erp 不在任何項目的 roles 內，也不在預設可見角色內", () => {
    for (const item of ADMIN_NAV) {
      expect(item.roles ?? []).not.toContain("erp");
    }
  });

  it("office 無 erp 授權：看不到 ERP，結果同 navForRole", () => {
    expect(navForUser("office", [])).toEqual(navForRole("office"));
  });

  it("office 有 erp 授權：保養卡兩項 + 全部 ERP 項目", () => {
    expect(navForUser("office", ["erp"]).map((i) => i.key)).toEqual([
      "maintenance",
      "maintenance-customers",
      ...erpKeys,
    ]);
  });

  it("admin / seo_manager 無授權：看不到 ERP", () => {
    expect(navForUser("admin", [])).toEqual(navForRole("admin"));
    expect(navForUser("seo_manager", [])).toEqual(navForRole("seo_manager"));
  });

  it("有授權時忽略 roles：admin 有 erp 也看得到 ERP", () => {
    const keys = navForUser("admin", ["erp"]).map((i) => i.key);
    for (const k of erpKeys) expect(keys).toContain(k);
    expect(keys).toContain("settings");
  });
});

describe("週報（#271）", () => {
  it("側欄週報只看 erp 模組；週報子頁籤與列印頁亮「週報」", () => {
    const item = ADMIN_NAV.find((i) => i.key === "erp-meeting");
    expect(item).toMatchObject({
      href: "/admin/erp/meeting",
      enabled: true,
      modules: ["erp"],
      group: "ERP",
    });
    expect(item?.roles).toBeUndefined();
    const hrefs = ADMIN_NAV.filter((i) => i.modules?.includes("erp")).map(
      (i) => i.href,
    );
    expect(activeNavHref("/admin/erp/meeting/maintenance", hrefs)).toBe(
      "/admin/erp/meeting",
    );
    expect(
      navForUser("staff", ["service_report"]).map((i) => i.key),
    ).not.toContain("erp-meeting");
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

  it("只是字串前綴但不是路徑段前綴時不算匹配", () => {
    // /admin/maintenance-customers 這種同名開頭的兄弟路由不可讓「保養記錄卡」亮，
    // 也不可讓 /admin/maintenance/customersX 被當成客戶頁。
    expect(activeNavHref("/admin/maintenance-archive", hrefs)).toBeNull();
    expect(activeNavHref("/admin/maintenance/customersX", hrefs)).toBe(
      "/admin/maintenance",
    );
  });

  it("任一路徑最多只會有一項 active（不會出現兩個 aria-current）", () => {
    for (const p of [
      "/admin/maintenance",
      "/admin/maintenance/abc",
      "/admin/maintenance/archive",
      "/admin/maintenance/customers",
      "/admin/maintenance/customers/abc",
      "/admin/maintenance/customers/abc/edit",
    ]) {
      expect(hrefs.filter((h) => h === activeNavHref(p, hrefs))).toHaveLength(
        1,
      );
    }
  });

  it("都不匹配時回 null", () => {
    expect(activeNavHref("/admin/unknown", hrefs)).toBeNull();
  });

  it("ERP 子頁（頁內 tab）亮所屬主項，不退回亮 ERP 總覽", () => {
    const erpHrefs = ADMIN_NAV.filter((i) => i.modules?.includes("erp")).map(
      (i) => i.href,
    );
    const cases: [string, string][] = [
      ["/admin/erp", "/admin/erp"],
      ["/admin/erp/quotes/abc/edit", "/admin/erp/sales"],
      ["/admin/erp/sales-returns/new", "/admin/erp/sales"],
      ["/admin/erp/receipts/abc", "/admin/erp/purchases"],
      ["/admin/erp/purchase-returns", "/admin/erp/purchases"],
      ["/admin/erp/transfers/new", "/admin/erp/inventory"],
      ["/admin/erp/adjustments/abc", "/admin/erp/inventory"],
      ["/admin/erp/inventory/serials", "/admin/erp/inventory"],
      ["/admin/erp/disbursements/abc", "/admin/erp/collections"],
      ["/admin/erp/vendors/abc/edit", "/admin/erp/items"],
      ["/admin/erp/customers", "/admin/erp/items"],
      ["/admin/erp/statements", "/admin/erp/statements"],
    ];
    for (const [path, expected] of cases) {
      expect(activeNavHref(path, erpHrefs)).toBe(expected);
    }
  });

  it("子頁的主項不在清單中（未啟用）時，不會誤亮其他項", () => {
    expect(
      activeNavHref("/admin/erp/quotes", ["/admin/erp", "/admin/erp/items"]),
    ).toBe("/admin/erp");
    expect(
      activeNavHref("/admin/erp/salesX", ["/admin/erp", "/admin/erp/sales"]),
    ).toBe("/admin/erp");
  });
});

describe("機台維護報告單（service_report 模組 gating）", () => {
  const erpKeys = ADMIN_NAV.filter((i) => i.modules?.includes("erp")).map(
    (i) => i.key,
  );

  it("項目設定：模組 service_report、group 維護、已啟用", () => {
    const item = ADMIN_NAV.find((i) => i.key === "service-reports");
    expect(item).toEqual({
      key: "service-reports",
      label: "機台維護報告單",
      href: "/admin/service-reports",
      enabled: true,
      modules: ["service_report"],
      group: "維護",
    });
  });

  it("位於保養卡兩項之後、員工與 ERP 分組之前", () => {
    const keys = ADMIN_NAV.map((i) => i.key);
    const idx = keys.indexOf("service-reports");
    expect(keys[idx - 1]).toBe("maintenance-customers");
    expect(keys[idx + 1]).toBe("employees");
    expect(keys[idx + 2]).toBe("employees-permissions");
    expect(keys[idx + 3]).toBe("erp");
  });

  it("office 有 service_report 授權：保養卡兩項 + 報告單 + 員工", () => {
    expect(navForUser("office", ["service_report"]).map((i) => i.key)).toEqual([
      "maintenance",
      "maintenance-customers",
      "service-reports",
      "employees",
    ]);
  });

  it("office 同時有 service_report 與 erp：報告單在 ERP 之前", () => {
    expect(
      navForUser("office", ["service_report", "erp"]).map((i) => i.key),
    ).toEqual([
      "maintenance",
      "maintenance-customers",
      "service-reports",
      "employees",
      ...erpKeys,
    ]);
  });

  it("office 無授權：看不到報告單", () => {
    expect(
      navForUser("office", []).some((i) => i.key === "service-reports"),
    ).toBe(false);
  });

  it("ERP-only 使用者（erp 角色 + erp 授權）看不到報告單", () => {
    expect(
      navForUser("erp", ["erp"]).some((i) => i.key === "service-reports"),
    ).toBe(false);
  });

  it("navForRole 不回傳報告單（任何角色）", () => {
    for (const role of [
      "admin",
      "seo_manager",
      "office",
      "erp",
      "hr",
    ] as const) {
      expect(navForRole(role).some((i) => i.key === "service-reports")).toBe(
        false,
      );
    }
  });

  it("停在報告單子頁時亮報告單項", () => {
    const hrefs = navForUser("office", ["service_report"]).map((i) => i.href);
    expect(activeNavHref("/admin/service-reports/abc/edit", hrefs)).toBe(
      "/admin/service-reports",
    );
  });
});

describe("員工主檔（#223，ERP 與維護報告單共用）", () => {
  it("項目設定：/admin/employees、service_report／hr／employees 模組、group 維護", () => {
    expect(ADMIN_NAV.find((i) => i.key === "employees")).toEqual({
      key: "employees",
      label: "員工",
      href: "/admin/employees",
      enabled: true,
      modules: ["service_report", "hr", "employees"],
      group: "維護",
    });
  });

  it("ERP-only 使用者側欄沒有「維護 › 員工」，停在員工頁時亮「基本資料」", () => {
    const nav = navForUser("erp", ["erp"]);
    expect(nav.some((i) => i.key === "employees")).toBe(false);
    expect(
      activeNavHref(
        "/admin/employees/abc/edit",
        nav.map((i) => i.href),
      ),
    ).toBe("/admin/erp/items");
  });

  it("有 service_report（含兩者皆有）：停在員工頁時亮「員工」", () => {
    for (const mods of [
      ["service_report"],
      ["service_report", "erp"],
    ] as const) {
      const hrefs = navForUser("office", [...mods]).map((i) => i.href);
      expect(activeNavHref("/admin/employees", hrefs)).toBe("/admin/employees");
    }
  });

  it("只有 hr（#257）：側欄只多「員工」與「權限管理」（#261），看不到 ERP 與機台維護報告單", () => {
    const nav = navForUser("erp", ["hr"]);
    expect(nav.map((i) => i.key)).toEqual([
      "employees",
      "employees-permissions",
    ]);
  });

  it("hr（人事，#259）角色 + hr 模組：側欄只有「員工」與「權限管理」", () => {
    expect(navForUser("hr", ["hr"]).map((i) => i.key)).toEqual([
      "employees",
      "employees-permissions",
    ]);
  });

  it("hr 角色無模組：側欄為空；navForRole 也不回傳任何項目", () => {
    expect(navForUser("hr", [])).toEqual([]);
    expect(navForRole("hr")).toEqual([]);
  });

  it("hr 不在任何項目的 roles 內（不會因角色看到 CMS／設定／保養卡）", () => {
    for (const item of ADMIN_NAV) {
      expect(item.roles ?? []).not.toContain("hr");
    }
  });

  it("無模組：看不到員工", () => {
    expect(navForUser("office", []).some((i) => i.key === "employees")).toBe(
      false,
    );
    expect(navForRole("admin").some((i) => i.key === "employees")).toBe(false);
  });
});

describe("員工帳號（staff，#261）與職位權限", () => {
  const ALL_POSITION_MODULES = [
    "erp",
    "service_report",
    "maintenance",
    "employees",
  ] as const;

  it("staff 無模組：側欄只有「帳號設定」", () => {
    expect(navForUser("staff", []).map((i) => i.key)).toEqual(["account"]);
    expect(navForRole("staff").map((i) => i.key)).toEqual(["account"]);
  });

  it("「帳號設定」只給 staff：共用／管理帳號（admin、seo_manager、office、erp、hr）看不到", () => {
    const item = ADMIN_NAV.find((i) => i.key === "account");
    expect(item?.href).toBe("/admin/settings/account");
    expect(item?.roles).toEqual(["staff"]);
    expect(item?.modules).toBeUndefined();
    for (const role of [
      "admin",
      "seo_manager",
      "office",
      "erp",
      "hr",
    ] as const) {
      expect(
        navForUser(role, [...ALL_POSITION_MODULES, "hr"]).some(
          (i) => i.key === "account",
        ),
        role,
      ).toBe(false);
    }
  });

  it("staff 只有 maintenance：保養卡兩項 + 帳號設定", () => {
    expect(navForUser("staff", ["maintenance"]).map((i) => i.key)).toEqual([
      "maintenance",
      "maintenance-customers",
      "account",
    ]);
  });

  it("staff 只有 employees：員工 + 帳號設定（沒有權限管理）", () => {
    expect(navForUser("staff", ["employees"]).map((i) => i.key)).toEqual([
      "employees",
      "account",
    ]);
  });

  it("staff 只有 erp：ERP 全部項目 + 帳號設定（沒有維護分組）", () => {
    const erpKeys = ADMIN_NAV.filter((i) => i.modules?.includes("erp")).map(
      (i) => i.key,
    );
    expect(navForUser("staff", ["erp"]).map((i) => i.key)).toEqual([
      ...erpKeys,
      "account",
    ]);
  });

  it("staff 全部職位權限：維護分組 + ERP + 帳號設定；永遠沒有 CMS／設定／人員管理／權限管理", () => {
    const keys = navForUser("staff", [...ALL_POSITION_MODULES]).map(
      (i) => i.key,
    );
    expect(keys).toContain("maintenance");
    expect(keys).toContain("service-reports");
    expect(keys).toContain("employees");
    expect(keys).toContain("erp-items");
    expect(keys).toContain("account");
    for (const k of [
      "dashboard",
      "seo",
      "analytics",
      "home",
      "products",
      "news",
      "services",
      "cases",
      "events",
      "contact",
      "settings",
      "staff",
      "employees-permissions",
    ]) {
      expect(keys, k).not.toContain(k);
    }
  });

  it("必改密碼：不論角色與模組，側欄只有「帳號設定」", () => {
    expect(
      navForUser("staff", [...ALL_POSITION_MODULES, "hr"], {
        mustChangePassword: true,
      }).map((i) => i.key),
    ).toEqual(["account"]);
  });

  it("保養卡兩項：office 角色或 maintenance 模組皆可見；其他角色有 maintenance 也可見，但 office 不需模組", () => {
    for (const key of ["maintenance", "maintenance-customers"]) {
      const item = ADMIN_NAV.find((i) => i.key === key);
      expect(item?.roles).toEqual(["office"]);
      expect(item?.modules).toEqual(["maintenance"]);
    }
    expect(navForUser("office", []).map((i) => i.key)).toEqual([
      "maintenance",
      "maintenance-customers",
    ]);
    expect(navForUser("erp", []).some((i) => i.key === "maintenance")).toBe(
      false,
    );
  });

  it("停在權限管理頁時只亮「權限管理」（最長匹配），停在員工頁時亮「員工」", () => {
    const hrefs = navForUser("hr", ["hr"]).map((i) => i.href);
    expect(activeNavHref("/admin/employees/permissions", hrefs)).toBe(
      "/admin/employees/permissions",
    );
    expect(activeNavHref("/admin/employees/abc", hrefs)).toBe(
      "/admin/employees",
    );
  });

  it("停在帳號設定頁時亮「帳號設定」", () => {
    const hrefs = navForUser("staff", ["maintenance"]).map((i) => i.href);
    expect(activeNavHref("/admin/settings/account", hrefs)).toBe(
      "/admin/settings/account",
    );
  });
});
