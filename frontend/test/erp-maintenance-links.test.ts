import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import {
  gatedHref,
  MAINTENANCE_PERMISSION_HINT,
  maintenanceMachineHref,
  serviceReportHref,
} from "@/lib/erp/admin-links";

// #283：只有 ERP 權限（沒有保養卡權限）的帳號，在 ERP 頁面看得到「→ 保養卡」「進入保養卡」等連結，
// 點了卻被導回總覽、沒有任何說明。修正：ERP 頁面連到 /admin/maintenance*、/admin/service-reports*
// 一律經 GatedLink，由 server 先算好權限（hasMaintenanceAccess() / hasModule("service_report")）。

const SRC = path.resolve(__dirname, "../src");
const ERP_DIRS = [
  "app/admin/(protected)/erp",
  "app/admin/(print)/erp",
  "components/erp",
  "lib/erp",
].map((d) => path.join(SRC, d));

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

/** 去掉註解（先整行 // 註解，再 /* *\/ 區塊）。 */
function stripComments(src: string): string {
  return src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const read = (rel: string) =>
  stripComments(readFileSync(path.join(SRC, rel), "utf8"));

const erpFiles = ERP_DIRS.flatMap(walk).filter(
  (f) => !f.endsWith(path.join("lib", "erp", "admin-links.ts")),
);
const rel = (f: string) => path.relative(SRC, f);

describe("admin-links 純函式", () => {
  it("有權限回連結，沒有權限回 null（呼叫端改顯示純文字）", () => {
    expect(gatedHref("/admin/maintenance/m1", true)).toBe(
      "/admin/maintenance/m1",
    );
    expect(gatedHref("/admin/maintenance/m1", false)).toBeNull();
  });

  it("保養卡／報告單路徑與提示文字", () => {
    expect(maintenanceMachineHref("m1")).toBe("/admin/maintenance/m1");
    expect(serviceReportHref("r1")).toBe("/admin/service-reports/r1");
    expect(MAINTENANCE_PERMISSION_HINT).toBe("需保養卡權限");
  });
});

describe("ERP 頁面的保養卡／報告單連結一律依權限顯示（靜態掃描）", () => {
  it("掃描範圍確實有檔案", () => {
    expect(erpFiles.length).toBeGreaterThan(20);
  });

  it("不直接寫死 /admin/maintenance 或 /admin/service-reports（revalidatePath 除外）", () => {
    const offenders = erpFiles.flatMap((f) => {
      const src = stripComments(readFileSync(f, "utf8"));
      return src
        .split("\n")
        .filter(
          (line) =>
            /\/admin\/(maintenance|service-reports)/.test(line) &&
            !/revalidatePath\(/.test(line) &&
            !/^\s*import\b|from\s+["']@\/lib\/admin\//.test(line),
        )
        .map((line) => `${rel(f)}: ${line.trim()}`);
    });
    expect(offenders).toEqual([]);
  });

  it("保養卡／報告單連結只出現在 <GatedLink>，且 allowed 不是寫死的 true", () => {
    const offenders: string[] = [];
    for (const f of erpFiles) {
      const src = stripComments(readFileSync(f, "utf8"));
      for (const m of src.matchAll(
        /href=\{(maintenanceMachineHref|serviceReportHref)\(/g,
      )) {
        const before = src.slice(0, m.index);
        const lastTag = before.lastIndexOf("<");
        const tag = before.slice(lastTag).match(/^<(\w+)/)?.[1];
        if (tag !== "GatedLink") offenders.push(`${rel(f)}: <${tag}>`);
      }
      if (/allowed(\s*[\n/>]|=\{true\})/.test(src)) {
        offenders.push(`${rel(f)}: allowed 寫死為 true`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("每個用到保養卡連結的頁面都以 hasMaintenanceAccess() 算權限", () => {
    const users = erpFiles.filter((f) =>
      /maintenanceMachineHref\(/.test(stripComments(readFileSync(f, "utf8"))),
    );
    expect(users.map(rel).sort()).toEqual(
      [
        "app/admin/(protected)/erp/customers/[customerId]/page.tsx",
        "app/admin/(protected)/erp/inventory/serials/page.tsx",
        "app/admin/(protected)/erp/sales/_components/SalesDocActions.tsx",
        "app/admin/(protected)/erp/sales/_components/SalesDocDetail.tsx",
      ].sort(),
    );
    for (const f of [
      "app/admin/(protected)/erp/customers/[customerId]/page.tsx",
      "app/admin/(protected)/erp/inventory/serials/page.tsx",
      "app/admin/(protected)/erp/sales/_components/SalesDocDetail.tsx",
    ]) {
      expect(read(f), f).toMatch(/hasMaintenanceAccess\(\)/);
      expect(read(f), f).toMatch(/allowed=\{canOpenMaintenance\}/);
    }
  });

  it("銷貨單動作列（client）只收布林值，由明細頁傳入", () => {
    const actions = read(
      "app/admin/(protected)/erp/sales/_components/SalesDocActions.tsx",
    );
    expect(actions).toMatch(/canOpenMaintenance\?: boolean/);
    expect(actions).toMatch(/canOpenMaintenance = false/);
    expect(actions).toMatch(/allowed=\{canOpenMaintenance\}/);
    expect(actions).not.toMatch(/hasMaintenanceAccess/);
    expect(
      read("app/admin/(protected)/erp/sales/_components/SalesDocDetail.tsx"),
    ).toMatch(/canOpenMaintenance=\{canOpenMaintenance\}/);
  });

  it("週報維護完成紀錄連到報告單需 service_report 模組", () => {
    const page = read("app/admin/(protected)/erp/meeting/maintenance/page.tsx");
    expect(page).toMatch(/hasModule\("service_report"\)/);
    expect(page).toMatch(/allowed=\{canOpenReport\}/);
  });
});
