// 變頻空壓機「馬力數 ↔ 造氣量」對照（products.hp_output jsonb）的純函式。
// 抽成獨立模組供 server action、後台表單、前台元件、測試共用（不含任何 server-only 依賴）。
import type { HpOutputRow } from "@/lib/types";

/**
 * 後台以「每行 馬力數=造氣量」文字輸入，解析為 [{ hp, output }]。
 * 兩側皆 trim；空行 / 無等號 / 缺任一側者略過（對壞輸入寬容、不丟例外）。
 */
export function parseHpOutput(raw: string): HpOutputRow[] {
  const rows: HpOutputRow[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const hp = trimmed.slice(0, eq).trim();
    const output = trimmed.slice(eq + 1).trim();
    if (hp && output) rows.push({ hp, output });
  }
  return rows;
}

/** 反向：把 hp_output 陣列還原成後台 textarea 的多行文字。 */
export function hpOutputToText(rows: HpOutputRow[] | undefined | null): string {
  if (!rows?.length) return "";
  return rows.map((r) => `${r.hp}=${r.output}`).join("\n");
}

/**
 * 依 hp 數值升冪排序（回傳新陣列，不改原輸入）。
 * 無法解析為數字的 hp 排在最後，仍保留可顯示。
 */
export function sortHpOutput(rows: HpOutputRow[]): HpOutputRow[] {
  return [...rows].sort((a, b) => {
    const na = Number(a.hp);
    const nb = Number(b.hp);
    if (Number.isNaN(na) && Number.isNaN(nb)) return 0;
    if (Number.isNaN(na)) return 1;
    if (Number.isNaN(nb)) return -1;
    return na - nb;
  });
}

/**
 * 由一組數字字串產生範圍標籤：["10","215"] → "10–215"；單值不重複；
 * 全部無法解析則回空字串。用於 Hero 規格亮點的「馬力數 / 造氣量」範圍。
 */
export function rangeLabel(values: string[]): string {
  const nums = values.map((v) => Number(v)).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return "";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? `${min}` : `${min}–${max}`;
}
