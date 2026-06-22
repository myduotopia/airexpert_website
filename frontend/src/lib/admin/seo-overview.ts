// 統一 SEO 總覽（V3-4）— 跨五區的純資料 / 彙整工具（client-safe，無 server-only，以利測試）。
//
// 重點：
//   * SEO_OVERVIEW_TABLES — 五個內容表的 allowlist + 顯示設定（類型標籤、標題欄位、cache tag、
//     前台 detail 路徑前綴）。寫入 server action 一律以此 allowlist 驗證 table，絕不接受任意表名。
//   * 缺漏判斷（缺 SEO 標題 / 描述 / OG 圖）與彙整統計（X 筆缺 SEO 標題…）抽成純函式供測試。
//   * 篩選（依類型 + 文字搜尋）亦為純函式。
//
// 對應：lib/admin/seo-whitelist.ts（可寫欄位白名單）、lib/seo.ts（SeoFieldsValues）、
//       lib/data/seo-overview.ts（server-only 取資料，把各表列轉為 SeoRow）。

import type { ContentStatus } from "../types";
import type { SeoFieldsValues } from "../seo";

/** SEO 總覽支援的內容表 key（= DB 表名，唯一事實來源 / allowlist）。 */
export type SeoTable =
  | "products"
  | "articles"
  | "services"
  | "cases"
  | "photo_albums";

/** 各內容表在總覽頁的顯示與寫入設定。 */
export interface SeoTableConfig {
  /** DB 表名（= allowlist 值）。 */
  table: SeoTable;
  /** 類型顯示標籤（繁中）。 */
  typeLabel: string;
  /** 該表「標題」欄位名（products 用 name，其餘用 title）。 */
  titleColumn: "name" | "title";
  /** revalidate 用的 cache tag（對齊 lib/data/cache.ts CACHE_TAGS）。 */
  cacheTag: string;
  /** 前台 detail 頁路徑前綴（用於組 canonical 預設 / 預覽連結，結尾不含 slug）。 */
  publicPathPrefix: string;
}

/**
 * 五個內容表的設定（陣列順序 = 總覽預設排序的類型順序）。
 * 注意：cacheTag 對齊 lib/data/cache.ts，photo_albums 的 tag 為 "photo_albums"。
 */
export const SEO_OVERVIEW_TABLES: readonly SeoTableConfig[] = [
  {
    table: "products",
    typeLabel: "商品介紹",
    titleColumn: "name",
    cacheTag: "products",
    publicPathPrefix: "/products/",
  },
  {
    table: "articles",
    typeLabel: "最新消息",
    titleColumn: "title",
    cacheTag: "articles",
    publicPathPrefix: "/news/",
  },
  {
    table: "services",
    typeLabel: "服務項目",
    titleColumn: "title",
    cacheTag: "services",
    publicPathPrefix: "/services/",
  },
  {
    table: "cases",
    typeLabel: "節能實績",
    titleColumn: "title",
    cacheTag: "cases",
    publicPathPrefix: "/cases/",
  },
  {
    table: "photo_albums",
    typeLabel: "公司活動",
    titleColumn: "title",
    cacheTag: "photo_albums",
    publicPathPrefix: "/events/",
  },
] as const;

/** 以 table key 快速取得設定（O(1)）。 */
const TABLE_CONFIG_MAP: ReadonlyMap<string, SeoTableConfig> = new Map(
  SEO_OVERVIEW_TABLES.map((c) => [c.table, c]),
);

/** 是否為 allowlist 內的合法內容表（型別守衛；寫入路徑用於拒絕任意表名）。 */
export function isSeoTable(table: string): table is SeoTable {
  return TABLE_CONFIG_MAP.has(table);
}

/** 取得某表設定；非 allowlist 回 null。 */
export function getSeoTableConfig(table: string): SeoTableConfig | null {
  return TABLE_CONFIG_MAP.get(table) ?? null;
}

/**
 * 總覽列：把任一內容表的列收斂成統一形狀。
 * 含 SEO 欄位（SeoFieldsValues）以利快速編輯時帶入 <SeoFields values={...}/>。
 */
export interface SeoRow extends SeoFieldsValues {
  table: SeoTable;
  typeLabel: string;
  id: string;
  title: string;
  slug: string | null;
  status: ContentStatus;
}

function isBlank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

/** 缺 SEO 標題（seo_title 空白）。 */
export function isMissingSeoTitle(row: SeoFieldsValues): boolean {
  return isBlank(row.seo_title);
}

/** 缺 SEO 描述（seo_description 空白）。 */
export function isMissingSeoDescription(row: SeoFieldsValues): boolean {
  return isBlank(row.seo_description);
}

/** 缺 OG 分享圖（og_image_url 空白）。 */
export function isMissingOgImage(row: SeoFieldsValues): boolean {
  return isBlank(row.og_image_url);
}

/** 該列是否有任一缺漏（標題 / 描述 / OG 圖）。 */
export function hasAnyMissing(row: SeoFieldsValues): boolean {
  return (
    isMissingSeoTitle(row) ||
    isMissingSeoDescription(row) ||
    isMissingOgImage(row)
  );
}

export interface SeoSummary {
  total: number;
  missingSeoTitle: number;
  missingSeoDescription: number;
  missingOgImage: number;
  /** 有任一缺漏的列數。 */
  withAnyMissing: number;
  /** SEO 完整（無缺漏）的列數。 */
  complete: number;
}

/** 彙整缺漏統計（供頁面顯示「X 筆缺 SEO 標題…」）。 */
export function summarizeSeoRows(rows: readonly SeoFieldsValues[]): SeoSummary {
  let missingSeoTitle = 0;
  let missingSeoDescription = 0;
  let missingOgImage = 0;
  let withAnyMissing = 0;
  for (const row of rows) {
    const t = isMissingSeoTitle(row);
    const d = isMissingSeoDescription(row);
    const o = isMissingOgImage(row);
    if (t) missingSeoTitle++;
    if (d) missingSeoDescription++;
    if (o) missingOgImage++;
    if (t || d || o) withAnyMissing++;
  }
  return {
    total: rows.length,
    missingSeoTitle,
    missingSeoDescription,
    missingOgImage,
    withAnyMissing,
    complete: rows.length - withAnyMissing,
  };
}

export interface SeoRowFilter {
  /** 限定類型（table）；undefined / "all" = 不限。 */
  table?: SeoTable | "all";
  /** 文字搜尋（比對標題 / slug，不分大小寫）。 */
  query?: string;
  /** 只顯示有缺漏的列。 */
  onlyMissing?: boolean;
}

/** 依類型 + 文字 + 缺漏狀態篩選總覽列（純函式，不變動輸入）。 */
export function filterSeoRows(
  rows: readonly SeoRow[],
  filter: SeoRowFilter,
): SeoRow[] {
  const q = filter.query?.trim().toLowerCase() ?? "";
  return rows.filter((row) => {
    if (filter.table && filter.table !== "all" && row.table !== filter.table) {
      return false;
    }
    if (filter.onlyMissing && !hasAnyMissing(row)) {
      return false;
    }
    if (q !== "") {
      const haystack = `${row.title} ${row.slug ?? ""}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}
