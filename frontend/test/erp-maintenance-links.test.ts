import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GatedLink } from "@/components/erp/GatedLink";
import {
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

const erpSources = ERP_DIRS.flatMap(walk)
  .filter((f) => !f.endsWith(path.join("lib", "erp", "admin-links.ts")))
  .map((f) => ({
    rel: path.relative(SRC, f),
    raw: readFileSync(f, "utf8"),
    src: stripComments(readFileSync(f, "utf8")),
  }));
const isClient = (raw: string) => /^\s*["']use client["']/.test(raw);

function render(props: Parameters<typeof GatedLink>[0]): string {
  return renderToStaticMarkup(createElement(GatedLink, props));
}

describe("GatedLink", () => {
  const href = maintenanceMachineHref("m1");

  it("有權限：渲染可點的連結", () => {
    const html = render({ href, allowed: true, children: "機台", hint: true });
    expect(html).toContain('href="/admin/maintenance/m1"');
    expect(html).toContain("機台");
    expect(html).not.toContain(MAINTENANCE_PERMISSION_HINT);
  });

  it("沒有權限：只顯示文字、沒有 <a> 也沒有 href", () => {
    const html = render({ href, allowed: false, children: "機台" });
    expect(html).toContain("機台");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("/admin/maintenance");
    expect(html).not.toContain(MAINTENANCE_PERMISSION_HINT);
  });

  it("沒有權限 + hint：加上「需保養卡權限」", () => {
    const html = render({
      href,
      allowed: false,
      children: "保養卡",
      hint: true,
    });
    expect(html).not.toContain("<a");
    expect(html).toContain("保養卡");
    expect(html).toContain(MAINTENANCE_PERMISSION_HINT);
  });

  it("沒有權限 + fallback：整個取代 children", () => {
    const html = render({
      href,
      allowed: false,
      children: "進入保養卡",
      fallback: createElement("span", null, MAINTENANCE_PERMISSION_HINT),
    });
    expect(html).not.toContain("<a");
    expect(html).not.toContain("進入保養卡");
    expect(html).toContain(MAINTENANCE_PERMISSION_HINT);
  });

  it("路徑產生器", () => {
    expect(serviceReportHref("r1")).toBe("/admin/service-reports/r1");
  });
});

describe("ERP 頁面的保養卡／報告單連結一律依權限顯示（靜態掃描）", () => {
  it("掃描範圍確實有檔案", () => {
    expect(erpSources.length).toBeGreaterThan(20);
  });

  it("不直接寫死 /admin/maintenance 或 /admin/service-reports（revalidatePath 除外）", () => {
    const offenders = erpSources.flatMap(({ rel, src }) =>
      src
        .split("\n")
        .filter(
          (line) =>
            /\/admin\/(maintenance|service-reports)/.test(line) &&
            !/revalidatePath\(/.test(line) &&
            !/^\s*import\b|from\s+["']@\/lib\/admin\//.test(line),
        )
        .map((line) => `${rel}: ${line.trim()}`),
    );
    expect(offenders).toEqual([]);
  });

  it("保養卡／報告單連結只出現在 <GatedLink>，且 allowed 不是寫死的 true", () => {
    const offenders: string[] = [];
    for (const { rel, src } of erpSources) {
      for (const m of src.matchAll(
        /href=\{(maintenanceMachineHref|serviceReportHref)\(/g,
      )) {
        const before = src.slice(0, m.index);
        const tag = before.slice(before.lastIndexOf("<")).match(/^<(\w+)/)?.[1];
        if (tag !== "GatedLink") offenders.push(`${rel}: <${tag}>`);
      }
      if (/\ballowed(\s*[\n/>]|=\{\s*true\s*\})/.test(src)) {
        offenders.push(`${rel}: allowed 寫死為 true`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("權限來源正確：保養卡用 hasMaintenanceAccess()、報告單用 service_report 模組；client 只收布林值", () => {
    const offenders: string[] = [];
    for (const { rel, raw, src } of erpSources) {
      const usesMaintenance = /maintenanceMachineHref\(/.test(src);
      const usesReport = /serviceReportHref\(/.test(src);
      if (!usesMaintenance && !usesReport) continue;
      if (isClient(raw)) {
        if (/@\/lib\/admin\/auth/.test(src)) {
          offenders.push(`${rel}: client component 不可 import auth`);
        }
        continue;
      }
      if (usesMaintenance && !/hasMaintenanceAccess\(\)/.test(src)) {
        offenders.push(`${rel}: 保養卡連結未以 hasMaintenanceAccess() 判斷`);
      }
      if (
        usesReport &&
        !/hasModule\(\s*["']service_report["']\s*\)/.test(src)
      ) {
        offenders.push(
          `${rel}: 報告單連結未以 hasModule("service_report") 判斷`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("銷貨單明細頁把保養卡權限傳給動作列（client 預設 false，漏傳會讓有權限的人也點不到）", () => {
    const detail = erpSources.find((f) =>
      f.rel.endsWith(path.join("sales", "_components", "SalesDocDetail.tsx")),
    );
    expect(detail?.src).toMatch(
      /<SalesDocActions\b[\s\S]*?canOpenMaintenance=\{canOpenMaintenance\}/,
    );
  });
});
