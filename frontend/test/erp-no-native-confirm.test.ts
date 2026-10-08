import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// #220：ERP 不得再用瀏覽器原生確認框（開著時 AI／e2e 自動化會整個卡住、手機體驗差），
// 一律改用 components/erp/ConfirmDialog 的 useConfirm。此測試靜態掃描原始碼防止退步。

const ROOT = join(__dirname, "..");
const SCAN_DIRS = ["src/app/admin/(protected)/erp", "src/components/erp"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(tsx?|jsx?)$/.test(name) ? [path] : [];
  });
}

// - 任何形式呼叫名為 confirm 的函式：confirm(…)、window.confirm(…)、globalThis.confirm(…)。
//   前面若是識別字字元（例如 useConfirm(、askConfirm(）則不算。
// - 不經呼叫取用原生函式：window.confirm / globalThis.confirm / self.confirm。
const PATTERNS: RegExp[] = [
  /(?<![\w$])confirm\s*\(/,
  /\b(?:window|globalThis|self)\s*\.\s*confirm\b/,
  /\b(?:window|globalThis|self)\s*\[\s*["'`]confirm["'`]\s*\]/,
];

function findNativeConfirm(source: string): number[] {
  return source
    .split("\n")
    .flatMap((line, i) => (PATTERNS.some((p) => p.test(line)) ? [i + 1] : []));
}

describe("ERP 不使用原生確認框", () => {
  it("偵測規則本身：抓得到原生呼叫、不誤判 hook 名稱", () => {
    expect(findNativeConfirm('if (!window.confirm("x")) return;')).toEqual([1]);
    expect(findNativeConfirm('confirm("x")')).toEqual([1]);
    expect(findNativeConfirm("const f = window.confirm;")).toEqual([1]);
    expect(findNativeConfirm('globalThis["confirm"]("x")')).toEqual([1]);
    expect(findNativeConfirm("const [askConfirm, d] = useConfirm();")).toEqual(
      [],
    );
    expect(findNativeConfirm("await askConfirm({ title })")).toEqual([]);
    expect(findNativeConfirm("const confirmText = 1;")).toEqual([]);
  });

  const files = SCAN_DIRS.flatMap((d) => sourceFiles(join(ROOT, d)));

  it("掃描範圍內有原始碼（避免路徑寫錯而空跑）", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("src/app/admin/(protected)/erp 與 src/components/erp 沒有原生確認框", () => {
    const hits = files.flatMap((f) =>
      findNativeConfirm(readFileSync(f, "utf8")).map(
        (line) => `${relative(ROOT, f)}:${line}`,
      ),
    );
    expect(hits).toEqual([]);
  });
});
