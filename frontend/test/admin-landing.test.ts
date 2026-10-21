import { describe, it, expect } from "vitest";
import { dashboardSectionsFor, landingPathFor } from "@/lib/admin/landing";

describe("landingPathFor", () => {
  it("office 一律導向保養記錄卡", () => {
    expect(landingPathFor("office", [])).toBe("/admin/maintenance");
    expect(landingPathFor("office", ["erp", "service_report"])).toBe(
      "/admin/maintenance",
    );
  });

  it("有可見區段的角色留在總覽（即使有模組授權）", () => {
    expect(dashboardSectionsFor("admin").length).toBeGreaterThan(0);
    expect(dashboardSectionsFor("seo_manager").length).toBeGreaterThan(0);
    expect(landingPathFor("admin", ["erp", "service_report"])).toBeNull();
    expect(landingPathFor("seo_manager", ["service_report"])).toBeNull();
  });

  it("無可見區段的角色依授權導向：erp 優先，其次 service_report", () => {
    expect(dashboardSectionsFor("erp")).toHaveLength(0);
    expect(landingPathFor("erp", ["erp"])).toBe("/admin/erp");
    expect(landingPathFor("erp", ["service_report", "erp"])).toBe("/admin/erp");
    expect(landingPathFor("erp", ["service_report"])).toBe(
      "/admin/service-reports",
    );
  });

  it("只有 hr（人事，#257）→ 員工頁；有 erp／service_report 時仍以其為優先", () => {
    expect(landingPathFor("erp", ["hr"])).toBe("/admin/employees");
    expect(landingPathFor("erp", ["hr", "erp"])).toBe("/admin/erp");
    expect(landingPathFor("erp", ["hr", "service_report"])).toBe(
      "/admin/service-reports",
    );
  });

  it("沒有授權時不導向（避免與 requireModule 互導的無限轉址）", () => {
    expect(landingPathFor("erp", [])).toBeNull();
    expect(landingPathFor("hr", [])).toBeNull();
  });

  it("hr（人事，#259）角色：沒有總覽區段，有 hr 模組一律導向員工頁", () => {
    expect(dashboardSectionsFor("hr")).toHaveLength(0);
    expect(landingPathFor("hr", ["hr"])).toBe("/admin/employees");
    // 人事角色即使另被授予其他模組，落地仍是員工頁（人事帳號的主要工作區）。
    expect(landingPathFor("hr", ["erp", "hr"])).toBe("/admin/employees");
    expect(landingPathFor("hr", ["service_report", "hr"])).toBe(
      "/admin/employees",
    );
  });
});

describe("landingPathFor — 員工帳號（staff，#261）與新模組", () => {
  it("staff 沒有任何模組 → 帳號設定頁（一定進得去，不會互導）", () => {
    expect(landingPathFor("staff", [])).toBe("/admin/settings/account");
    expect(dashboardSectionsFor("staff")).toHaveLength(0);
  });

  it("staff 依模組導向：erp > service_report > maintenance > employees", () => {
    expect(
      landingPathFor("staff", [
        "employees",
        "maintenance",
        "service_report",
        "erp",
      ]),
    ).toBe("/admin/erp");
    expect(
      landingPathFor("staff", ["employees", "maintenance", "service_report"]),
    ).toBe("/admin/service-reports");
    expect(landingPathFor("staff", ["employees", "maintenance"])).toBe(
      "/admin/maintenance",
    );
    expect(landingPathFor("staff", ["employees"])).toBe("/admin/employees");
  });

  it("staff 另有直接授予的 hr → 員工頁", () => {
    expect(landingPathFor("staff", ["hr"])).toBe("/admin/employees");
  });

  it("帳號設定不算總覽區段（admin 等角色的總覽卡片不變）", () => {
    for (const role of [
      "admin",
      "seo_manager",
      "office",
      "erp",
      "hr",
      "staff",
    ] as const) {
      expect(dashboardSectionsFor(role).some((s) => s.key === "account")).toBe(
        false,
      );
    }
  });

  it("既有角色行為不變：office → 保養卡；erp 角色只有 employees／maintenance 也能落地", () => {
    expect(landingPathFor("office", ["maintenance"])).toBe(
      "/admin/maintenance",
    );
    expect(landingPathFor("erp", ["maintenance"])).toBe("/admin/maintenance");
    expect(landingPathFor("erp", ["employees"])).toBe("/admin/employees");
    expect(landingPathFor("admin", ["maintenance"])).toBeNull();
  });
});
