import { describe, it, expect, vi } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";

// 後台頁面守門的靜態掃描（#259 新增「人事」角色 hr）。
//
// 背景：(protected)／(print) 兩個 route group 的根 layout 只做 requireRole([...ADMIN_ROLES])
// （「是否為後台人員」）。hr 加入 ADMIN_ROLES 後，任何只靠根 layout 守門的頁面都會對人事帳號開放。
// 本測試逐一讀出每個 page.tsx 及其上層 layout.tsx 的守門呼叫（requireAdmin / requireRole /
// requireModule / requireAnyModule），以「全部守門皆通過才可進入」模擬各角色能進哪些頁：
//   1. 除了總覽 /admin（由 landingPathFor 再導向）外，每頁都必須有根 layout 以外的明確守門；
//   2. 人事帳號（role hr + hr 模組）只能進 /admin/employees 底下的頁面；
//   3. 既有角色的可進範圍不因此改變（admin / seo_manager / office / erp 的抽樣檢查）。
// 只看原始碼中的守門呼叫，不執行頁面；頁面內資料函式另外的 requireAdmin（例：商品）不列入。

vi.mock("@/lib/supabase-server", () => ({ getServerSupabase: vi.fn() }));

import { ADMIN_ROLES, CONTENT_ROLES, type AdminRole } from "@/lib/admin/roles";
import type { AdminModule } from "@/lib/admin/auth";
import { EMPLOYEE_MODULES } from "@/lib/employees/guard";
import { landingPathFor } from "@/lib/admin/landing";

const APP_ADMIN = path.resolve(__dirname, "../src/app/admin");
const GROUPS = ["(protected)", "(print)"];

type Guard =
  | { kind: "admin" }
  | { kind: "role"; roles: readonly string[]; root: boolean }
  | { kind: "module"; modules: readonly string[] };

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
}

function passes(user: User, g: Guard): boolean {
  if (g.kind === "admin") return user.role === "admin";
  if (g.kind === "role") return g.roles.includes(user.role);
  return g.modules.some((m) => (user.modules as readonly string[]).includes(m));
}

function accessibleRoutes(user: User): string[] {
  return PAGES.filter((p) => p.guards.every((g) => passes(user, g))).map(
    (p) => p.route,
  );
}

const PAGES = collectPages();
const DASHBOARD = "/admin";
const HR_USER: User = { role: "hr", modules: ["hr"] };

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
      (p) =>
        p.route !== DASHBOARD &&
        !p.guards.some((g) => !(g.kind === "role" && g.root)),
    ).map((p) => p.file);
    expect(unguarded).toEqual([]);
  });

  it("兩個 group 根 layout 都只允許 ADMIN_ROLES（後台人員）", () => {
    for (const group of GROUPS) {
      const g = guardsIn(path.join(APP_ADMIN, group, "layout.tsx"));
      expect(g).toEqual([{ kind: "role", roles: ADMIN_ROLES, root: true }]);
    }
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
});
