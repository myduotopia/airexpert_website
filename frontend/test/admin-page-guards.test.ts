import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

// 後台頁面守門的靜態掃描（#259 新增「人事」角色 hr）。
//
// 背景：(protected)／(print) 兩個 route group 的根 layout 只做 requireRole([...ADMIN_ROLES])
// （「是否為後台人員」）。hr 加入 ADMIN_ROLES 後，任何只靠根 layout 守門的頁面都會對人事帳號開放。
// 本測試逐一讀出每個 page.tsx 及其上層 layout.tsx 的守門呼叫（requireAdmin / requireRole /
// requireModule / requireAnyModule / requireMaintenanceAccess / redirectIfMustChangePassword），
// 以「全部守門皆通過才可進入」模擬各角色能進哪些頁：
//   1. 除了總覽 /admin（由 landingPathFor 再導向）外，每頁都必須有根 layout 以外的明確守門；
//   2. 人事帳號（role hr + hr 模組）只能進 /admin/employees 底下的頁面（含權限管理）；
//   3. 既有角色的可進範圍不因此改變（admin / seo_manager / office / erp 的抽樣檢查）；
//   4. 員工帳號（role staff，#261）的可進範圍完全由模組（職位權限）決定，另有帳號設定頁；
//      必須先改密碼時只能進帳號設定頁（(protected)／(print) 根 layout 的 redirectIfMustChangePassword）。
// 只看原始碼中的守門呼叫，不執行頁面；頁面內資料函式另外的 requireAdmin（例：商品）不列入。

vi.mock("@/lib/supabase-server", () => ({ getServerSupabase: vi.fn() }));

import { ADMIN_ROLES, CONTENT_ROLES, type AdminRole } from "@/lib/admin/roles";
import type { AdminModule } from "@/lib/admin/auth";
import { EMPLOYEE_MODULES } from "@/lib/employees/guard";
import { landingPathFor } from "@/lib/admin/landing";
import { ACCOUNT_SETTINGS_PATH } from "@/lib/admin/staff-accounts";

const APP_ADMIN = path.resolve(__dirname, "../src/app/admin");
const GROUPS = ["(protected)", "(print)", "(account)"];

type Guard =
  | { kind: "admin" }
  | { kind: "role"; roles: readonly string[]; root: boolean }
  | { kind: "module"; modules: readonly string[] }
  /** requireMaintenanceAccess()：角色 office 或 maintenance 模組。 */
  | { kind: "maintenance" }
  /** redirectIfMustChangePassword()：必改密碼的帳號導到帳號設定頁。 */
  | { kind: "unlocked" };

/** 守門呼叫中可引用的具名常數（requireRole(CONTENT_ROLES) 之類）。 */
const ROLE_CONSTANTS: Record<string, readonly string[]> = {
  ADMIN_ROLES,
  CONTENT_ROLES,
};
const MODULE_CONSTANTS: Record<string, readonly string[]> = {
  EMPLOYEE_MODULES,
};

/** 去掉註解（先整行 // 註解，再 /* *\/ 區塊；順序反過來會被註解裡的「/admin/*」誤判成區塊開頭）。 */
function stripComments(src: string): string {
  return src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function stringLiterals(s: string): string[] {
  return [...s.matchAll(/["']([\w-]+)["']/g)].map((m) => m[1]);
}

function resolveList(
  arg: string,
  constants: Record<string, readonly string[]>,
  file: string,
): readonly string[] {
  const a = arg.trim();
  if (a.startsWith("[")) {
    const spread = /^\[\s*\.\.\.(\w+)\s*\]$/.exec(a);
    if (spread) return resolveList(spread[1], constants, file);
    return stringLiterals(a);
  }
  if (/^["']/.test(a)) return stringLiterals(a);
  const v = constants[a];
  if (!v) throw new Error(`${file}: 無法解析守門參數 ${a}`);
  return v;
}

function guardsIn(file: string): Guard[] {
  const src = stripComments(readFileSync(file, "utf8"));
  const guards: Guard[] = [];
  if (/\brequireAdmin\(\s*\)/.test(src)) guards.push({ kind: "admin" });
  for (const m of src.matchAll(/\brequireRole\(\s*([^)]*?)\s*\)/g)) {
    guards.push({
      kind: "role",
      roles: resolveList(m[1], ROLE_CONSTANTS, file),
      root: /^\[\s*\.\.\.ADMIN_ROLES\s*\]$/.test(m[1].trim()),
    });
  }
  for (const m of src.matchAll(/\brequire(?:Any)?Module\(\s*([^)]*?)\s*\)/g)) {
    guards.push({
      kind: "module",
      modules: resolveList(m[1], MODULE_CONSTANTS, file),
    });
  }
  if (/\brequireMaintenanceAccess\(\s*\)/.test(src)) {
    guards.push({ kind: "maintenance" });
  }
  if (/\bredirectIfMustChangePassword\(\s*\)/.test(src)) {
    guards.push({ kind: "unlocked" });
  }
  return guards;
}

function findPages(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...findPages(p));
    else if (name === "page.tsx") out.push(p);
  }
  return out;
}

interface PageInfo {
  route: string;
  file: string;
  /** page 本身 + 自 group 根起每層 layout 的守門。 */
  guards: Guard[];
}

function collectPages(): PageInfo[] {
  const pages: PageInfo[] = [];
  for (const group of GROUPS) {
    const groupDir = path.join(APP_ADMIN, group);
    for (const file of findPages(groupDir)) {
      const rel = path.relative(groupDir, path.dirname(file));
      const segments = rel === "" ? [] : rel.split(path.sep);
      const guards: Guard[] = [];
      for (let i = 0; i <= segments.length; i++) {
        const layout = path.join(
          groupDir,
          ...segments.slice(0, i),
          "layout.tsx",
        );
        if (existsSync(layout)) guards.push(...guardsIn(layout));
      }
      guards.push(...guardsIn(file));
      const route = ["/admin", ...segments.filter((s) => !/^\(.*\)$/.test(s))]
        .join("/")
        .replace(/\/$/, "");
      pages.push({ route, file: path.relative(APP_ADMIN, file), guards });
    }
  }
  return pages.sort((a, b) => a.route.localeCompare(b.route));
}

interface User {
  role: AdminRole;
  modules: readonly AdminModule[];
  /** 員工帳號尚未改掉預設密碼（此時 DB 與 getCurrentModules() 的模組皆為空）。 */
  mustChangePassword?: boolean;
}

function passes(user: User, g: Guard): boolean {
  // 必改密碼時 has_module()／getCurrentModules() 一律為空（0032）。
  const modules: readonly string[] = user.mustChangePassword
    ? []
    : user.modules;
  if (g.kind === "admin") return user.role === "admin";
  if (g.kind === "role") return g.roles.includes(user.role);
  if (g.kind === "maintenance") {
    return user.role === "office" || modules.includes("maintenance");
  }
  if (g.kind === "unlocked") return !user.mustChangePassword;
  return g.modules.some((m) => modules.includes(m));
}

/** 根 layout 的守門（「是否為後台人員」與必改密碼導向）——不算頁面自己的明確守門。 */
function isRootGuard(g: Guard): boolean {
  return (g.kind === "role" && g.root) || g.kind === "unlocked";
}

function accessibleRoutes(user: User): string[] {
  return PAGES.filter((p) => p.guards.every((g) => passes(user, g))).map(
    (p) => p.route,
  );
}

const PAGES = collectPages();
const DASHBOARD = "/admin";
const HR_USER: User = { role: "hr", modules: ["hr"] };
const PERMISSIONS = "/admin/employees/permissions";

describe("後台頁面守門靜態掃描", () => {
  it("掃得到頁面（含 (protected) 與 (print)、員工、ERP、CMS）", () => {
    const routes = PAGES.map((p) => p.route);
    expect(routes.length).toBeGreaterThan(50);
    for (const r of [
      "/admin",
      "/admin/employees",
      "/admin/erp",
      "/admin/erp/print/[docId]",
      "/admin/maintenance",
      "/admin/service-reports",
      "/admin/products",
      "/admin/news/ai",
      "/admin/staff",
    ]) {
      expect(routes).toContain(r);
    }
  });

  it("除總覽外，每頁都有根 layout（ADMIN_ROLES）以外的明確守門", () => {
    const unguarded = PAGES.filter(
      (p) => p.route !== DASHBOARD && !p.guards.some((g) => !isRootGuard(g)),
    ).map((p) => p.file);
    expect(unguarded).toEqual([]);
  });

  it("(protected)／(print) 根 layout：只允許 ADMIN_ROLES，且必改密碼一律導到帳號設定頁", () => {
    for (const group of ["(protected)", "(print)"]) {
      const g = guardsIn(path.join(APP_ADMIN, group, "layout.tsx"));
      expect(g, group).toEqual([
        { kind: "role", roles: ADMIN_ROLES, root: true },
        { kind: "unlocked" },
      ]);
    }
  });

  it("(account) 根 layout 只允許 ADMIN_ROLES、不做必改密碼導向（否則無限轉址），且只放帳號設定頁", () => {
    const g = guardsIn(path.join(APP_ADMIN, "(account)", "layout.tsx"));
    expect(g).toEqual([{ kind: "role", roles: ADMIN_ROLES, root: true }]);
    expect(
      PAGES.filter((p) => p.file.startsWith("(account)")).map((p) => p.route),
    ).toEqual([ACCOUNT_SETTINGS_PATH]);
  });
});

describe("人事帳號（role hr + hr 模組）只能進員工頁", () => {
  const employeeRoutes = PAGES.map((p) => p.route).filter(
    (r) => r === "/admin/employees" || r.startsWith("/admin/employees/"),
  );

  it("可進入的頁面 = 員工頁（全部）+ 總覽（會被導向員工頁）", () => {
    expect(employeeRoutes.length).toBeGreaterThan(0);
    expect(accessibleRoutes(HR_USER)).toEqual(
      [DASHBOARD, ...employeeRoutes].sort((a, b) => a.localeCompare(b)),
    );
  });

  it("總覽 /admin 對人事帳號一律導向 /admin/employees", () => {
    expect(landingPathFor("hr", ["hr"])).toBe("/admin/employees");
  });

  it("逐區確認進不去：ERP、保養卡、維護報告單、CMS、人員管理、流量分析、列印", () => {
    const blocked = new Set(
      PAGES.map((p) => p.route).filter(
        (r) => !accessibleRoutes(HR_USER).includes(r),
      ),
    );
    for (const r of [
      "/admin/erp",
      "/admin/erp/sales",
      "/admin/erp/items",
      "/admin/erp/print/[docId]",
      "/admin/maintenance",
      "/admin/maintenance/customers",
      "/admin/service-reports",
      "/admin/service-reports/print/[id]",
      "/admin/home",
      "/admin/products",
      "/admin/products/[id]",
      "/admin/news",
      "/admin/news/ai",
      "/admin/cases",
      "/admin/services",
      "/admin/events",
      "/admin/seo",
      "/admin/analytics",
      "/admin/contact",
      "/admin/settings",
      "/admin/staff",
    ]) {
      expect(blocked.has(r), r).toBe(true);
    }
  });

  it("沒有 hr 模組的人事角色連員工頁都進不去（只剩總覽）", () => {
    expect(accessibleRoutes({ role: "hr", modules: [] })).toEqual([DASHBOARD]);
  });

  it("權限管理頁只限 hr 模組（只有其他員工模組的人進不去）", () => {
    expect(accessibleRoutes(HR_USER)).toContain(PERMISSIONS);
    for (const m of ["erp", "service_report", "employees"] as const) {
      expect(accessibleRoutes({ role: "erp", modules: [m] }), m).not.toContain(
        PERMISSIONS,
      );
    }
  });

  it("人事帳號沒有帳號設定頁", () => {
    expect(accessibleRoutes(HR_USER)).not.toContain(ACCOUNT_SETTINGS_PATH);
  });
});

describe("既有角色的可進範圍不變（抽樣）", () => {
  const cms = [
    "/admin/products",
    "/admin/news",
    "/admin/news/ai",
    "/admin/cases",
    "/admin/services",
  ];

  it("admin：CMS、設定、人員管理、SEO、流量分析皆可進", () => {
    const ok = accessibleRoutes({ role: "admin", modules: [] });
    for (const r of [
      ...cms,
      "/admin/home",
      "/admin/events",
      "/admin/settings",
      "/admin/staff",
      "/admin/contact",
      "/admin/seo",
      "/admin/analytics",
    ]) {
      expect(ok, r).toContain(r);
    }
  });

  it("seo_manager：CMS 列表、SEO、流量分析可進；設定 / 人員管理不可", () => {
    const ok = accessibleRoutes({ role: "seo_manager", modules: [] });
    for (const r of [...cms, "/admin/seo", "/admin/analytics"]) {
      expect(ok, r).toContain(r);
    }
    for (const r of ["/admin/settings", "/admin/staff", "/admin/erp"]) {
      expect(ok, r).not.toContain(r);
    }
  });

  it("office（無模組）：只有保養卡相關頁 + 總覽", () => {
    const ok = accessibleRoutes({ role: "office", modules: [] });
    expect(
      ok.filter((r) => r !== DASHBOARD && !r.startsWith("/admin/maintenance")),
    ).toEqual([]);
    expect(ok).toContain("/admin/maintenance");
  });

  it("erp 角色 + erp 模組：ERP 頁（含列印）+ 員工頁 + 總覽", () => {
    const ok = accessibleRoutes({ role: "erp", modules: ["erp"] });
    expect(
      ok.filter(
        (r) =>
          r !== DASHBOARD &&
          !r.startsWith("/admin/erp") &&
          !r.startsWith("/admin/employees"),
      ),
    ).toEqual([]);
    expect(ok).toContain("/admin/erp/print/[docId]");
  });

  it("共用／管理帳號（admin、seo_manager、office、erp、hr）都沒有帳號設定頁", () => {
    for (const role of [
      "admin",
      "seo_manager",
      "office",
      "erp",
      "hr",
    ] as const) {
      expect(
        accessibleRoutes({
          role,
          modules: ["erp", "service_report", "hr", "maintenance", "employees"],
        }),
        role,
      ).not.toContain(ACCOUNT_SETTINGS_PATH);
    }
  });
});

describe("員工帳號（role staff，#261）：可進範圍完全由模組（職位權限）決定", () => {
  const routes = PAGES.map((p) => p.route);
  const under = (prefix: string) =>
    routes.filter((r) => r === prefix || r.startsWith(`${prefix}/`));
  const sorted = (rs: string[]) =>
    [...new Set(rs)].sort((a, b) => a.localeCompare(b));
  const staff = (modules: AdminModule[], mustChangePassword = false): User => ({
    role: "staff",
    modules,
    mustChangePassword,
  });
  const employeesNoPermissions = under("/admin/employees").filter(
    (r) => r !== PERMISSIONS,
  );
  /** 不論任何模組組合，員工帳號都不可進入的頁面。 */
  const NEVER = [
    "/admin/home",
    "/admin/products",
    "/admin/products/[id]",
    "/admin/products/new",
    "/admin/news",
    "/admin/news/ai",
    "/admin/cases",
    "/admin/services",
    "/admin/events",
    "/admin/seo",
    "/admin/analytics",
    "/admin/contact",
    "/admin/settings",
    "/admin/staff",
    PERMISSIONS,
  ];

  it("無模組：只有帳號設定頁 + 總覽（總覽導向帳號設定頁）", () => {
    expect(accessibleRoutes(staff([]))).toEqual(
      sorted([DASHBOARD, ACCOUNT_SETTINGS_PATH]),
    );
    expect(landingPathFor("staff", [])).toBe(ACCOUNT_SETTINGS_PATH);
  });

  it("只有 maintenance：保養卡全部頁面 + 帳號設定 + 總覽", () => {
    expect(accessibleRoutes(staff(["maintenance"]))).toEqual(
      sorted([
        DASHBOARD,
        ACCOUNT_SETTINGS_PATH,
        ...under("/admin/maintenance"),
      ]),
    );
    expect(landingPathFor("staff", ["maintenance"])).toBe("/admin/maintenance");
  });

  it("只有 employees：員工頁（不含權限管理）+ 帳號設定 + 總覽", () => {
    expect(accessibleRoutes(staff(["employees"]))).toEqual(
      sorted([DASHBOARD, ACCOUNT_SETTINGS_PATH, ...employeesNoPermissions]),
    );
    expect(landingPathFor("staff", ["employees"])).toBe("/admin/employees");
  });

  it("只有 service_report：報告單（含列印）+ 員工頁（不含權限管理）+ 帳號設定 + 總覽", () => {
    expect(accessibleRoutes(staff(["service_report"]))).toEqual(
      sorted([
        DASHBOARD,
        ACCOUNT_SETTINGS_PATH,
        ...under("/admin/service-reports"),
        ...employeesNoPermissions,
      ]),
    );
    expect(routes).toContain("/admin/service-reports/print/[id]");
    expect(landingPathFor("staff", ["service_report"])).toBe(
      "/admin/service-reports",
    );
  });

  it("只有 erp：ERP（含列印）+ 員工頁（不含權限管理）+ 帳號設定 + 總覽", () => {
    expect(accessibleRoutes(staff(["erp"]))).toEqual(
      sorted([
        DASHBOARD,
        ACCOUNT_SETTINGS_PATH,
        ...under("/admin/erp"),
        ...employeesNoPermissions,
      ]),
    );
    expect(landingPathFor("staff", ["erp"])).toBe("/admin/erp");
  });

  it("四個職位模組全開：上述聯集；仍進不了 CMS／SEO／流量分析／設定／人員管理／權限管理", () => {
    const ok = accessibleRoutes(
      staff(["erp", "service_report", "maintenance", "employees"]),
    );
    expect(ok).toEqual(
      sorted([
        DASHBOARD,
        ACCOUNT_SETTINGS_PATH,
        ...under("/admin/erp"),
        ...under("/admin/service-reports"),
        ...under("/admin/maintenance"),
        ...employeesNoPermissions,
      ]),
    );
    for (const r of NEVER) expect(ok, r).not.toContain(r);
  });

  it("admin 另外直接授予 hr：才多出權限管理頁（hr 不可能來自職位）", () => {
    expect(accessibleRoutes(staff(["hr"]))).toContain(PERMISSIONS);
  });

  it("必改密碼：不論模組，只能進帳號設定頁（總覽、模組頁、列印頁皆被根 layout 導走）", () => {
    for (const mods of [
      [],
      ["maintenance"],
      ["erp", "service_report", "maintenance", "employees", "hr"],
    ] as AdminModule[][]) {
      expect(accessibleRoutes(staff(mods, true)), mods.join(",")).toEqual([
        ACCOUNT_SETTINGS_PATH,
      ]);
    }
  });

  it("每種模組組合都進不了 NEVER 清單", () => {
    const all: AdminModule[] = [
      "erp",
      "service_report",
      "maintenance",
      "employees",
    ];
    for (let mask = 0; mask < 1 << all.length; mask++) {
      const mods = all.filter((_, i) => mask & (1 << i));
      const ok = accessibleRoutes(staff(mods));
      for (const r of NEVER)
        expect(ok, `${mods.join(",")} ${r}`).not.toContain(r);
    }
  });
});

describe("提醒事項（#274）：只限 erp 模組", () => {
  it("頁面本身以 requireModule('erp') 守門；只有 erp 模組進得去", () => {
    const page = PAGES.find((p) => p.route === "/admin/erp/reminders");
    expect(page).toBeDefined();
    expect(
      guardsIn(path.join(APP_ADMIN, page!.file)).some(
        (g) => g.kind === "module" && g.modules.includes("erp"),
      ),
    ).toBe(true);
    expect(accessibleRoutes({ role: "erp", modules: ["erp"] })).toContain(
      "/admin/erp/reminders",
    );
    for (const u of [
      { role: "erp", modules: [] },
      { role: "office", modules: ["maintenance"] },
      { role: "hr", modules: ["hr"] },
      { role: "staff", modules: ["service_report", "employees"] },
      { role: "admin", modules: [] },
    ] as User[]) {
      expect(accessibleRoutes(u), u.role).not.toContain("/admin/erp/reminders");
    }
  });
});

describe("保養記錄卡：office 角色或 maintenance 模組", () => {
  const maintenance = PAGES.map((p) => p.route).filter((r) =>
    r.startsWith("/admin/maintenance"),
  );

  it("每個保養卡頁面都以 requireMaintenanceAccess 守門", () => {
    expect(maintenance.length).toBeGreaterThan(5);
    for (const p of PAGES.filter((x) =>
      x.route.startsWith("/admin/maintenance"),
    )) {
      expect(
        p.guards.some((g) => g.kind === "maintenance"),
        p.file,
      ).toBe(true);
    }
  });

  it("office（無模組）照舊可進；erp／hr 角色無 maintenance 模組進不去", () => {
    const office = accessibleRoutes({ role: "office", modules: [] });
    for (const r of maintenance) expect(office, r).toContain(r);
    for (const role of ["erp", "hr", "seo_manager", "admin"] as const) {
      const ok = accessibleRoutes({
        role,
        modules: ["erp", "service_report", "hr", "employees"],
      });
      for (const r of maintenance) expect(ok, `${role} ${r}`).not.toContain(r);
    }
  });
});

describe("ERP 週報（#271）：所有子頁籤與列印頁都需要 erp 模組", () => {
  const MEETING = [
    "/admin/erp/meeting",
    "/admin/erp/meeting/delivery",
    "/admin/erp/meeting/repairs",
    "/admin/erp/meeting/machine-issues",
    "/admin/erp/meeting/maintenance",
    "/admin/erp/print/meeting/maintenance",
  ];

  it("掃得到週報各頁（含佔位子頁籤與列印頁）", () => {
    const routes = PAGES.map((p) => p.route);
    for (const r of MEETING) expect(routes, r).toContain(r);
  });

  it("週報各頁（含 layout）都有明確的 erp 守門", () => {
    for (const p of PAGES.filter((x) => MEETING.includes(x.route))) {
      expect(
        p.guards.some((g) => g.kind === "module" && g.modules.includes("erp")),
        p.route,
      ).toBe(true);
    }
  });

  it("erp 使用者可進；只有 service_report／hr／無模組的人進不去", () => {
    const erp = accessibleRoutes({ role: "staff", modules: ["erp"] });
    for (const r of MEETING) expect(erp, r).toContain(r);
    for (const user of [
      { role: "staff", modules: ["service_report"] },
      { role: "office", modules: ["service_report", "maintenance"] },
      HR_USER,
      { role: "admin", modules: [] },
    ] as User[]) {
      const ok = accessibleRoutes(user);
      for (const r of MEETING) expect(ok, `${user.role} ${r}`).not.toContain(r);
    }
  });
});
