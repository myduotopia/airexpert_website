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

  it("沒有授權時不導向（避免與 requireModule 互導的無限轉址）", () => {
    expect(landingPathFor("erp", [])).toBeNull();
  });
});
