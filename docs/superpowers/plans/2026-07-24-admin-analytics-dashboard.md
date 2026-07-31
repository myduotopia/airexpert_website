# 後台流量分析頁（GA4 + Search Console）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在後台新增 `/admin/analytics`，即時讀回 GA4 與 Search Console 數據並呈現，另自動挑出「曝光高但點擊率低」的頁面串接既有 SEO 總覽。

**Architecture:** 全在 Next.js 完成，不動 `backend/`。Server Component 取得後台設定（GA4 property id / GSC site url）與 service account 金鑰，用 `google-auth-library` 換 access token，以 `fetch` 直接呼叫兩個 Google REST API；查詢結果以 `unstable_cache`（tag `analytics`、1 小時）快取。純邏輯（日期區間、優化機會篩選、API→畫面資料轉換）抽成無 I/O 的函式，以 vitest 覆蓋。GA4 與 GSC 兩區各自 `Suspense`、獨立失敗。圖表以手寫 SVG 呈現，不引圖表套件。

**Tech Stack:** Next.js 16 (App Router, RSC, `unstable_cache`/`updateTag`)、TypeScript、Tailwind v4、`google-auth-library`、vitest。

---

## 背景與前置狀態（實作者必讀）

- **Google 端設定已完成**（見 [docs/analytics-google-api-setup.md](../../analytics-google-api-setup.md)）：GCP 專案 `gen-lang-client-0233327764`、`analyticsdata`＋`searchconsole` 已啟用、service account `airexpert-analytics@gen-lang-client-0233327764.iam.gserviceaccount.com` 已授權，兩個 API 已用 curl 實測回真實資料。
- **本機環境變數已就緒**：`frontend/.env.local` 已有 `GOOGLE_SERVICE_ACCOUNT_JSON`（base64 的 service account JSON）。
- **待填的兩個值**（實作到設定頁後由使用者填入 後台 ▸ 網站設定）：
  - GA4 資源 ID：`544523300`
  - GSC 資源網址：`sc-domain:airexpert.com.tw`
- 設計文件：[docs/superpowers/specs/2026-07-22-admin-analytics-dashboard-design.md](../specs/2026-07-22-admin-analytics-dashboard-design.md)

### 既有慣例（務必沿用）

- 測試放 `frontend/test/*.test.ts`（**非** co-located），vitest node 環境，`@` alias 指 `src`，`server-only` 被 stub。跑單檔：`npm run test -- <file>`。
- 資料層快取：`unstable_cache(fn, keyParts, { revalidate, tags })` 外再包 `cache()`，tag 取自 `CACHE_TAGS`（見 `src/lib/data/cache.ts`）。
- Server Action：`"use server"` + `await requireAdmin()`（或 `requireRole`）+ 寫入走 `getAdminSupabase()` + `updateTag(tag)`（Next 16 的 API 名稱，非 `revalidateTag`）。
- 純函式採「注入相依」以便測試（見 `src/lib/ai/gemini.ts` 的 `fetchGeminiWithRetry(url, body, { sleep })`）；錯誤訊息**不得**含 url / 金鑰。
- 寫任何 Next API 前，若不確定語意，先讀 `frontend/node_modules/next/dist/docs/`。
- **push 前必跑 `npm run format`**（CI 第一關是 Prettier `format:check`）。

---

## File Structure

**新增（`src/lib/analytics/`）**

| 檔案 | 職責 |
| --- | --- |
| `types.ts` | 跨模組共用的結果型別（KPI、折線點、表列、優化機會…） |
| `ranges.ts` | 純函式：由「今天」＋天數＋延遲算出本期／上期日期字串 |
| `insights.ts` | 純函式：從 GSC 著陸頁列篩出「優化機會」 |
| `google-auth.ts` | service account（base64 env）→ access token |
| `google-fetch.ts` | 帶重試的 Google REST POST（注入 sleep），錯誤不洩漏機密 |
| `ga4.ts` | GA4 runReport 呼叫 ＋ 回應→畫面資料轉換 ＋ 快取包裝 |
| `gsc.ts` | GSC searchAnalytics 呼叫 ＋ 轉換 ＋ 快取包裝 |
| `format.ts` | 純顯示工具：百分比、期間變化、路徑→可讀頁名 |

**新增（`src/app/admin/(protected)/analytics/`）**

| 檔案 | 職責 |
| --- | --- |
| `page.tsx` | Server Component：守門、讀設定、算區間、組兩區 Suspense、區間切換 |
| `RangeTabs.tsx` | client：7/30/90 切換（改寫 `?range=` searchParam） |
| `RefreshButton.tsx` | client：呼叫 `refreshAnalytics` action 失效快取 |
| `actions.ts` | server action：`refreshAnalytics()` → `updateTag('analytics')` |
| `Ga4Section.tsx` | async server：取 GA4 資料、try/catch 後渲染 KPI/圖/表 |
| `GscSection.tsx` | async server：取 GSC 資料、try/catch 後渲染 KPI/表/優化機會 |
| `KpiCard.tsx` | 單張 KPI（值＋期間變化） |
| `LineChart.tsx` | 手寫 SVG 雙線折線（本期 vs 上期） |
| `BarList.tsx` | 手寫 SVG／DIV 橫條列（流量來源、裝置） |
| `DataTable.tsx` | 通用小表（熱門頁面／關鍵字／著陸頁） |
| `OpportunityList.tsx` | 優化機會列＋連往 `/admin/seo?q=<slug>` 按鈕 |
| `SetupNotice.tsx` | 未設定／錯誤時的引導卡片 |

**修改**

| 檔案 | 變更 |
| --- | --- |
| `src/lib/analytics/config.ts` | `AnalyticsValue`／`AnalyticsConfig` 加 `ga4_property_id`／`gsc_site_url`，`parseAnalyticsConfig` 對應解析 |
| `src/lib/data/cache.ts` | `CACHE_TAGS` 增 `analytics` |
| `src/app/admin/(protected)/settings/AnalyticsSettingsForm.tsx` | 增兩個輸入欄位 |
| `src/app/admin/(protected)/settings/actions.ts` | `saveAnalyticsConfig` 存兩個新值 |
| `src/app/admin/(protected)/settings/page.tsx` | 傳新 props 給表單 |
| `src/lib/admin/nav-config.ts` | 側欄新增「流量分析」項 |
| `src/app/admin/(protected)/seo/page.tsx` | 讀 `?q=` searchParam 傳 `initialQuery` |
| `src/app/admin/(protected)/seo/SeoOverviewClient.tsx` | `query` state 以 `initialQuery` 初始化 |
| `.env.local.example` | 補 `GOOGLE_SERVICE_ACCOUNT_JSON` 鍵名 |
| `package.json` | 加 `google-auth-library` |

**新增測試（`test/`）**：`analytics-ranges.test.ts`、`analytics-insights.test.ts`、`analytics-format.test.ts`、`analytics-ga4-transform.test.ts`、`analytics-gsc-transform.test.ts`、`google-fetch.test.ts`；擴充 `analytics-config.test.ts`。

---

## Task 1: 擴充 analytics 設定型別（property id / site url）

**Files:**
- Modify: `frontend/src/lib/analytics/config.ts`
- Test: `frontend/test/analytics-config.test.ts`（既有，擴充）

- [ ] **Step 1: 加測試（先失敗）**

在 `frontend/test/analytics-config.test.ts` 的 `describe("analytics config — parseAnalyticsConfig", …)` 內加入：

```ts
  it("解析 ga4_property_id 與 gsc_site_url（trim）", () => {
    expect(
      parseAnalyticsConfig({
        ga4_property_id: "  544523300 ",
        gsc_site_url: " sc-domain:airexpert.com.tw ",
      }),
    ).toMatchObject({
      ga4PropertyId: "544523300",
      gscSiteUrl: "sc-domain:airexpert.com.tw",
    });
  });

  it("新欄位缺漏 / 空白 → null", () => {
    expect(parseAnalyticsConfig({ ga4_property_id: "  " })).toMatchObject({
      ga4PropertyId: null,
      gscSiteUrl: null,
    });
    expect(parseAnalyticsConfig(null)).toMatchObject({
      ga4PropertyId: null,
      gscSiteUrl: null,
    });
  });
```

- [ ] **Step 2: 執行測試確認失敗**

Run: `npm run test -- analytics-config`
Expected: FAIL（`ga4PropertyId` undefined，不等於 `"544523300"`）

- [ ] **Step 3: 擴充 config.ts**

在 `frontend/src/lib/analytics/config.ts` 的兩個 interface 各加一欄，並在 `parseAnalyticsConfig` 回傳補上：

```ts
export interface AnalyticsValue {
  ga4_id?: string;
  gsc_verification?: string;
  ga4_property_id?: string;
  gsc_site_url?: string;
}

export interface AnalyticsConfig {
  ga4Id: string | null;
  gscVerification: string | null;
  /** GA4 資源 ID（純數字字串），供 Data API `properties/{id}`。null → 無法查 GA4。 */
  ga4PropertyId: string | null;
  /** GSC 資源網址（如 `sc-domain:example.com`）。null → 無法查 GSC。 */
  gscSiteUrl: string | null;
}
```

`parseAnalyticsConfig` 回傳物件補兩行（沿用既有 `strOrNull`）：

```ts
  return {
    ga4Id: strOrNull(value?.ga4_id),
    gscVerification: strOrNull(value?.gsc_verification),
    ga4PropertyId: strOrNull(value?.ga4_property_id),
    gscSiteUrl: strOrNull(value?.gsc_site_url),
  };
```

- [ ] **Step 4: 執行測試確認通過**

Run: `npm run test -- analytics-config`
Expected: PASS（全部）

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/analytics/config.ts frontend/test/analytics-config.test.ts
git commit -m "feat(analytics): config 加 ga4PropertyId / gscSiteUrl"
```

---

## Task 2: 日期區間純函式（ranges.ts）

負責：把「今天（Asia/Taipei）」＋區間天數（7/30/90）＋資料延遲天數，換算出本期與上期的 `YYYY-MM-DD` 起訖。GA4 延遲設 1 天（排除當日不完整），GSC 設 3 天。純字串運算（以 `Date.UTC` 做日曆加減，避開時區陷阱）。

**Files:**
- Create: `frontend/src/lib/analytics/ranges.ts`
- Test: `frontend/test/analytics-ranges.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// frontend/test/analytics-ranges.test.ts
import { describe, it, expect } from "vitest";
import { computeRange, taipeiTodayYmd, RANGE_DAYS } from "@/lib/analytics/ranges";

describe("computeRange（本期／上期日期字串）", () => {
  it("7 天、延遲 1（GA4）：本期結束為昨天，兩期等長且相鄰", () => {
    const r = computeRange("2026-07-24", 7, 1);
    expect(r.current).toEqual({ startDate: "2026-07-17", endDate: "2026-07-23" });
    expect(r.previous).toEqual({ startDate: "2026-07-10", endDate: "2026-07-16" });
  });

  it("30 天、延遲 3（GSC）：結束日往前推 3 天", () => {
    const r = computeRange("2026-07-24", 30, 3);
    expect(r.current.endDate).toBe("2026-07-21");
    expect(r.current.startDate).toBe("2026-06-22");
    expect(r.previous.endDate).toBe("2026-06-21");
    expect(r.previous.startDate).toBe("2026-05-23");
  });

  it("跨月／跨年邊界正確（以 Date.UTC 進位）", () => {
    const r = computeRange("2026-01-02", 7, 1);
    expect(r.current).toEqual({ startDate: "2025-12-26", endDate: "2026-01-01" });
  });
});

describe("taipeiTodayYmd（注入 now，時區 Asia/Taipei）", () => {
  it("UTC 深夜換算為台北隔日", () => {
    // 2026-07-24T16:30Z = 台北 2026-07-25 00:30
    expect(taipeiTodayYmd(new Date("2026-07-24T16:30:00Z"))).toBe("2026-07-25");
  });
});

describe("RANGE_DAYS", () => {
  it("僅允許 7 / 30 / 90", () => {
    expect(RANGE_DAYS).toEqual([7, 30, 90]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test -- analytics-ranges`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 ranges.ts**

```ts
// frontend/src/lib/analytics/ranges.ts
// 純函式：計算 GA4/GSC 查詢的本期與上期日期。無 I/O、無 server-only，便於單元測試。

/** 允許的區間天數（對應 UI 的近 7 / 30 / 90 天）。 */
export const RANGE_DAYS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];

/** GA4 無回報延遲，但排除當日（不完整）→ 延遲 1 天結算至昨天。 */
export const GA4_LAG_DAYS = 1;
/** Search Console 資料約 2–3 天延遲，保守取 3。 */
export const GSC_LAG_DAYS = 3;

export interface DateWindow {
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD（含）
}
export interface RangeResult {
  current: DateWindow;
  previous: DateWindow;
}

/** 由 `YYYY-MM-DD` 取 UTC 午夜的 epoch 毫秒。 */
function ymdToUtc(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
const DAY = 86_400_000;
function utcToYmd(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 由「今天（YYYY-MM-DD）」算出本期與上期。
 * 本期結束 = 今天 - lagDays；本期長度 = days；上期為緊鄰的等長區間。
 */
export function computeRange(
  todayYmd: string,
  days: number,
  lagDays: number,
): RangeResult {
  const todayMs = ymdToUtc(todayYmd);
  const curEnd = todayMs - lagDays * DAY;
  const curStart = curEnd - (days - 1) * DAY;
  const prevEnd = curStart - DAY;
  const prevStart = prevEnd - (days - 1) * DAY;
  return {
    current: { startDate: utcToYmd(curStart), endDate: utcToYmd(curEnd) },
    previous: { startDate: utcToYmd(prevStart), endDate: utcToYmd(prevEnd) },
  };
}

/** 以 Asia/Taipei 時區取「今天」的 YYYY-MM-DD；注入 now 便於測試。 */
export function taipeiTodayYmd(now: Date = new Date()): string {
  // en-CA locale 輸出即 YYYY-MM-DD。
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test -- analytics-ranges`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/analytics/ranges.ts frontend/test/analytics-ranges.test.ts
git commit -m "feat(analytics): 日期區間純函式 ranges.ts"
```

---

## Task 3: 顯示工具純函式（format.ts）

負責：百分比字串、期間變化（含「上期為 0」的處理）、GA4 頁面路徑→可讀頁名。

**Files:**
- Create: `frontend/src/lib/analytics/format.ts`
- Test: `frontend/test/analytics-format.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// frontend/test/analytics-format.test.ts
import { describe, it, expect } from "vitest";
import { pctChange, formatPct, prettyPagePath } from "@/lib/analytics/format";

describe("pctChange（期間變化比例）", () => {
  it("由 100 → 120 = +0.2", () => {
    expect(pctChange(120, 100)).toBeCloseTo(0.2);
  });
  it("上期為 0、本期 > 0 → null（無法計算，UI 顯示『新增』）", () => {
    expect(pctChange(5, 0)).toBeNull();
  });
  it("兩期皆 0 → 0", () => {
    expect(pctChange(0, 0)).toBe(0);
  });
});

describe("formatPct", () => {
  it("正值加正號、一位小數", () => {
    expect(formatPct(0.123)).toBe("+12.3%");
    expect(formatPct(-0.05)).toBe("-5.0%");
    expect(formatPct(null)).toBe("—");
  });
});

describe("prettyPagePath（路徑→中文頁名）", () => {
  it("首頁", () => {
    expect(prettyPagePath("/")).toBe("首頁");
  });
  it("已知區段轉中文並帶 slug", () => {
    expect(prettyPagePath("/products/oil-free")).toBe("商品：oil-free");
    expect(prettyPagePath("/news/2026-summer")).toBe("最新消息：2026-summer");
  });
  it("未知路徑原樣回傳（去除 query）", () => {
    expect(prettyPagePath("/whatever?utm=x")).toBe("/whatever");
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test -- analytics-format`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 format.ts**

```ts
// frontend/src/lib/analytics/format.ts
// 純顯示工具：無 I/O，供 server 元件與測試共用。

/** 期間變化比例。上期為 0 且本期非 0 → null（無基準）；兩期皆 0 → 0。 */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

/** 比例 → 帶正負號的百分比字串；null → "—"。 */
export function formatPct(ratio: number | null): string {
  if (ratio === null) return "—";
  const sign = ratio > 0 ? "+" : ratio < 0 ? "-" : "";
  return `${sign}${(Math.abs(ratio) * 100).toFixed(1)}%`;
}

const SECTION_LABELS: Record<string, string> = {
  products: "商品",
  news: "最新消息",
  services: "服務",
  cases: "節能實績",
  events: "公司活動",
};

/** GA4 pagePath → 可讀頁名。去除 query；首頁與已知區段特別處理。 */
export function prettyPagePath(path: string): string {
  const clean = path.split("?")[0].split("#")[0];
  if (clean === "/" || clean === "") return "首頁";
  const seg = clean.replace(/^\/+/, "").split("/");
  const label = SECTION_LABELS[seg[0]];
  if (label && seg[1]) return `${label}：${seg.slice(1).join("/")}`;
  if (label && !seg[1]) return label;
  return clean;
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test -- analytics-format`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/analytics/format.ts frontend/test/analytics-format.test.ts
git commit -m "feat(analytics): 顯示工具純函式 format.ts"
```

---

## Task 4: 優化機會篩選純函式（insights.ts）

負責：由 GSC 著陸頁列（含 clicks/impressions/ctr/position）篩出「曝光 > 100 且 CTR < 1%」者，依曝光遞減排序，並由 landing page URL 推出 slug（給 `/admin/seo?q=` 用）。

**Files:**
- Create: `frontend/src/lib/analytics/insights.ts`
- Test: `frontend/test/analytics-insights.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// frontend/test/analytics-insights.test.ts
import { describe, it, expect } from "vitest";
import {
  findOpportunities,
  slugFromLandingUrl,
  MIN_IMPRESSIONS,
  MAX_CTR,
} from "@/lib/analytics/insights";
import type { GscPageRow } from "@/lib/analytics/types";

const row = (over: Partial<GscPageRow>): GscPageRow => ({
  page: "https://airexpert.com.tw/products/x",
  clicks: 1,
  impressions: 200,
  ctr: 0.005,
  position: 22,
  ...over,
});

describe("門檻常數", () => {
  it("曝光 > 100、CTR < 1%", () => {
    expect(MIN_IMPRESSIONS).toBe(100);
    expect(MAX_CTR).toBe(0.01);
  });
});

describe("findOpportunities", () => {
  it("挑出曝光>100 且 CTR<1%，依曝光遞減", () => {
    const out = findOpportunities([
      row({ page: "https://a/products/low", impressions: 300, ctr: 0.004 }),
      row({ page: "https://a/products/hi-ctr", impressions: 300, ctr: 0.05 }), // CTR 太高，排除
      row({ page: "https://a/products/low-imp", impressions: 80, ctr: 0.001 }), // 曝光不足，排除
      row({ page: "https://a/products/mid", impressions: 150, ctr: 0.009 }),
    ]);
    expect(out.map((o) => o.impressions)).toEqual([300, 150]);
  });

  it("邊界值不納入（曝光=100 或 CTR=0.01 皆排除）", () => {
    const out = findOpportunities([
      row({ impressions: 100, ctr: 0.004 }),
      row({ impressions: 500, ctr: 0.01 }),
    ]);
    expect(out).toHaveLength(0);
  });
});

describe("slugFromLandingUrl", () => {
  it("取最後一段路徑為 slug", () => {
    expect(slugFromLandingUrl("https://airexpert.com.tw/products/oil-free")).toBe("oil-free");
  });
  it("首頁 / 無 slug → 空字串", () => {
    expect(slugFromLandingUrl("https://airexpert.com.tw/")).toBe("");
  });
  it("壞字串不丟錯 → 空字串", () => {
    expect(slugFromLandingUrl("not a url")).toBe("");
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test -- analytics-insights`
Expected: FAIL（模組不存在；`GscPageRow` 型別在 Task 5 定義，先在 types.ts 建好——見下方 Step 3 註）

> 註：本 Task 依賴 `@/lib/analytics/types` 的 `GscPageRow`。請先在本步驟一併建立 `types.ts`（Task 5 會再擴充其餘型別）。

- [ ] **Step 3: 建 types.ts（最小）＋實作 insights.ts**

先建 `frontend/src/lib/analytics/types.ts`：

```ts
// frontend/src/lib/analytics/types.ts
// analytics 模組共用結果型別（皆為 JSON-serializable，供 unstable_cache 與 RSC 傳遞）。

export interface GscPageRow {
  page: string; // 著陸頁完整 URL
  clicks: number;
  impressions: number;
  ctr: number; // 0..1
  position: number; // 平均排名
}

export interface Opportunity extends GscPageRow {
  slug: string; // 由 page 推出，供 /admin/seo?q= 用
}
```

再建 `frontend/src/lib/analytics/insights.ts`：

```ts
// frontend/src/lib/analytics/insights.ts
// 純函式：從 GSC 著陸頁挑「曝光高但 CTR 低」的優化機會。門檻為具名常數，便於日後調整。
import type { GscPageRow, Opportunity } from "./types";

/** 曝光需「大於」此值。 */
export const MIN_IMPRESSIONS = 100;
/** CTR 需「小於」此值（0.01 = 1%）。 */
export const MAX_CTR = 0.01;

/** 由著陸頁 URL 取最後一段作為 slug；壞字串或無 path → 空字串。 */
export function slugFromLandingUrl(url: string): string {
  try {
    const { pathname } = new URL(url);
    const segs = pathname.split("/").filter(Boolean);
    return segs.length ? segs[segs.length - 1] : "";
  } catch {
    return "";
  }
}

/** 篩出優化機會並依曝光遞減排序。 */
export function findOpportunities(rows: GscPageRow[]): Opportunity[] {
  return rows
    .filter((r) => r.impressions > MIN_IMPRESSIONS && r.ctr < MAX_CTR)
    .sort((a, b) => b.impressions - a.impressions)
    .map((r) => ({ ...r, slug: slugFromLandingUrl(r.page) }));
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test -- analytics-insights`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/analytics/insights.ts frontend/src/lib/analytics/types.ts frontend/test/analytics-insights.test.ts
git commit -m "feat(analytics): 優化機會篩選 insights.ts + 共用 types"
```

---

## Task 5: 補齊共用型別（types.ts）

負責：補上 KPI、折線點、名次列、裝置列、以及兩區彙整結果的型別，供 ga4/gsc 轉換與元件共用。

**Files:**
- Modify: `frontend/src/lib/analytics/types.ts`

- [ ] **Step 1: 追加型別**

在 `frontend/src/lib/analytics/types.ts` 末尾追加：

```ts
export interface Metric {
  value: number;
  previous: number;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  current: number;
  previous: number | null; // 對齊到上期同一相對日；無對應 → null
}

export interface NamedRow {
  label: string;
  value: number;
  extra?: string; // 次要顯示（如平均停留時間）
}

export interface Ga4Dashboard {
  users: Metric;
  sessions: Metric;
  pageViews: Metric;
  avgEngagementSec: Metric;
  daily: DailyPoint[]; // 每日使用者，本期與上期
  topPages: { path: string; title: string; views: number; avgTimeSec: number }[];
  sources: NamedRow[]; // 來源/媒介 → 使用者
  devices: NamedRow[]; // 桌機/手機/平板 → 使用者
  asOf: string; // 本期結束日 YYYY-MM-DD
}

export interface GscKpis {
  clicks: Metric;
  impressions: Metric;
  ctr: Metric; // 0..1
  position: Metric;
}

export interface GscDashboard {
  kpis: GscKpis;
  queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
  pages: GscPageRow[];
  opportunities: Opportunity[];
  asOf: string; // GSC 本期結束日（已含 3 天延遲）YYYY-MM-DD
}
```

- [ ] **Step 2: 型別檢查**

Run: `npm run typecheck`
Expected: PASS（無未使用型別錯誤；若報 `Opportunity` 未匯出等，補匯出）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/analytics/types.ts
git commit -m "feat(analytics): 補齊儀表板共用型別"
```

---

## Task 6: service account → access token（google-auth.ts）

負責：讀環境變數 `GOOGLE_SERVICE_ACCOUNT_JSON`（base64 的 service account JSON），用 `google-auth-library` 換 access token（唯讀 scope）。模組層級單例，token 由函式庫自動快取。

**Files:**
- Create: `frontend/src/lib/analytics/google-auth.ts`
- Modify: `frontend/package.json`（新增依賴）

- [ ] **Step 1: 安裝依賴**

Run:
```bash
cd frontend && npm install google-auth-library
```
Expected: `package.json` dependencies 出現 `google-auth-library`，`package-lock.json` 更新。

- [ ] **Step 2: 實作 google-auth.ts**

```ts
// frontend/src/lib/analytics/google-auth.ts
// service account（base64 env）→ access token。SERVER ONLY。
import "server-only";
import { GoogleAuth } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
];

let cachedAuth: GoogleAuth | null = null;

/** 是否已設定金鑰（供頁面判斷「未設定」狀態）。 */
export function hasServiceAccount(): boolean {
  return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
}

function getAuth(): GoogleAuth {
  if (cachedAuth) return cachedAuth;
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON?.trim();
  if (!b64) throw new Error("尚未設定 GOOGLE_SERVICE_ACCOUNT_JSON");
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON 解碼失敗（應為 base64 的 JSON）");
  }
  cachedAuth = new GoogleAuth({ credentials, scopes: SCOPES });
  return cachedAuth;
}

/** 取得一個有效的 access token（google-auth-library 內部快取／自動更新）。 */
export async function getGoogleAccessToken(): Promise<string> {
  const client = await getAuth().getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("取得 Google access token 失敗");
  return token.token;
}
```

- [ ] **Step 3: 型別檢查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/lib/analytics/google-auth.ts
git commit -m "feat(analytics): service account access token (google-auth.ts)"
```

---

## Task 7: 帶重試的 Google REST POST（google-fetch.ts）

負責：POST JSON 到 Google API，帶 Bearer token；對 429/500/503 指數退避重試（注入 sleep）；錯誤訊息含狀態碼但**不含** url／token。仿 `src/lib/ai/gemini.ts` 的 `fetchGeminiWithRetry`。

**Files:**
- Create: `frontend/src/lib/analytics/google-fetch.ts`
- Test: `frontend/test/google-fetch.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// frontend/test/google-fetch.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { googleApiPost } from "@/lib/analytics/google-fetch";

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;
const err = (status: number) =>
  ({ ok: false, status, text: async () => "boom" }) as unknown as Response;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("googleApiPost", () => {
  it("200 → 回傳解析後 JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(ok({ rows: [1] })));
    const data = await googleApiPost("https://x", "tok", { q: 1 }, { sleep: vi.fn() });
    expect(data).toEqual({ rows: [1] });
  });

  it("503 後 200 → 重試一次成功", async () => {
    const f = vi.fn().mockResolvedValueOnce(err(503)).mockResolvedValueOnce(ok({ a: 1 }));
    vi.stubGlobal("fetch", f);
    const sleep = vi.fn().mockResolvedValue(undefined);
    const data = await googleApiPost("https://x", "tok", {}, { sleep });
    expect(data).toEqual({ a: 1 });
    expect(f).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("403 → 不重試、立即丟錯（訊息含 403、不含 token）", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(err(403)));
    await expect(
      googleApiPost("https://x?k=1", "SECRET_TOKEN", {}, { sleep: vi.fn() }),
    ).rejects.toThrow(/403/);
    await expect(
      googleApiPost("https://x?k=1", "SECRET_TOKEN", {}, { sleep: vi.fn() }),
    ).rejects.toThrow(/^(?!.*SECRET_TOKEN).*$/);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test -- google-fetch`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 google-fetch.ts**

```ts
// frontend/src/lib/analytics/google-fetch.ts
// 帶重試的 Google REST POST。SERVER ONLY。錯誤訊息不洩漏 url / token。
import "server-only";

const MAX_ATTEMPTS = 3;
const RETRYABLE = new Set([429, 500, 503]);

export function backoffMs(attempt: number): number {
  return 500 * 2 ** (attempt - 1);
}

interface Options {
  sleep?: (ms: number) => Promise<void>;
}

/** POST JSON body，帶 Bearer token，回傳解析後 JSON。可重試狀態碼指數退避。 */
export async function googleApiPost<T = unknown>(
  url: string,
  accessToken: string,
  body: unknown,
  opts: Options = {},
): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let lastStatus = 0;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return (await res.json()) as T;
    lastStatus = res.status;
    if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(`Google API 失敗（${res.status}）`);
    }
    await sleep(backoffMs(attempt));
  }
  throw new Error(`Google API 失敗（${lastStatus}）`);
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test -- google-fetch`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/analytics/google-fetch.ts frontend/test/google-fetch.test.ts
git commit -m "feat(analytics): 帶重試的 Google REST POST"
```

---

## Task 8: GA4 回應轉換（純函式，先 TDD 轉換層）

負責：把 GA4 `runReport` 的原始回應轉成 `Ga4Dashboard` 的各片段。GA4 呼叫本身（下一 Task）會回傳多份 report，此處只測「原始 rows → 型別化資料」的純轉換，用固定 fixture。

**Files:**
- Create: `frontend/src/lib/analytics/ga4.ts`（本 Task 先只放純轉換函式與型別，呼叫層下一 Task 補）
- Test: `frontend/test/analytics-ga4-transform.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// frontend/test/analytics-ga4-transform.test.ts
import { describe, it, expect } from "vitest";
import { parseScalarMetric, parseTopPages, parseNamedRows } from "@/lib/analytics/ga4";

describe("parseScalarMetric（單列多指標的第 i 個）", () => {
  it("讀 rows[0].metricValues[i]，缺 → 0", () => {
    const resp = { rows: [{ metricValues: [{ value: "178" }, { value: "236" }] }] };
    expect(parseScalarMetric(resp, 0)).toBe(178);
    expect(parseScalarMetric(resp, 1)).toBe(236);
    expect(parseScalarMetric({ rows: [] }, 0)).toBe(0);
    expect(parseScalarMetric({}, 0)).toBe(0);
  });
});

describe("parseTopPages（pagePath + pageTitle + views + avgTime）", () => {
  it("轉出並帶頁名，缺 title 退回 path", () => {
    const resp = {
      rows: [
        {
          dimensionValues: [{ value: "/products/x" }, { value: "商品 X" }],
          metricValues: [{ value: "50" }, { value: "42.5" }],
        },
        {
          dimensionValues: [{ value: "/p" }, { value: "" }],
          metricValues: [{ value: "9" }, { value: "1" }],
        },
      ],
    };
    const out = parseTopPages(resp);
    expect(out[0]).toEqual({ path: "/products/x", title: "商品 X", views: 50, avgTimeSec: 42.5 });
    expect(out[1].title).toBe("/p"); // title 空 → 退回 path
  });
});

describe("parseNamedRows（單維度 + 單指標 → label/value）", () => {
  it("組 sessionSourceMedium/deviceCategory 皆適用", () => {
    const resp = {
      rows: [
        { dimensionValues: [{ value: "google / organic" }], metricValues: [{ value: "120" }] },
        { dimensionValues: [{ value: "(direct) / (none)" }], metricValues: [{ value: "60" }] },
      ],
    };
    expect(parseNamedRows(resp)).toEqual([
      { label: "google / organic", value: 120 },
      { label: "(direct) / (none)", value: 60 },
    ]);
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test -- analytics-ga4-transform`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 ga4.ts 的純轉換段**

建立 `frontend/src/lib/analytics/ga4.ts`，本步驟先寫「型別 + 純轉換」；`server-only` import 也先加上（呼叫層下一 Task 補）：

```ts
// frontend/src/lib/analytics/ga4.ts
// GA4 Data API 封裝：純轉換（可測）+ 呼叫與快取（Task 9）。SERVER ONLY。
import "server-only";

// ---- 原始回應最小型別（只取用到的欄位）----
interface RawRow {
  dimensionValues?: { value?: string }[];
  metricValues?: { value?: string }[];
}
interface RawReport {
  rows?: RawRow[];
}

function num(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 單列報表取第 i 個 metric 為純量（KPI 用）。缺 → 0。 */
export function parseScalarMetric(resp: RawReport, i: number): number {
  return num(resp.rows?.[0]?.metricValues?.[i]?.value);
}

/** 熱門頁面：dim=[pagePath, pageTitle], metric=[screenPageViews, avgSessionDuration]。 */
export function parseTopPages(
  resp: RawReport,
): { path: string; title: string; views: number; avgTimeSec: number }[] {
  return (resp.rows ?? []).map((r) => {
    const path = r.dimensionValues?.[0]?.value ?? "";
    const rawTitle = r.dimensionValues?.[1]?.value ?? "";
    return {
      path,
      title: rawTitle.trim() || path,
      views: num(r.metricValues?.[0]?.value),
      avgTimeSec: num(r.metricValues?.[1]?.value),
    };
  });
}

/** 單維度 + 單指標 → { label, value }（來源／裝置共用）。 */
export function parseNamedRows(resp: RawReport): { label: string; value: number }[] {
  return (resp.rows ?? []).map((r) => ({
    label: r.dimensionValues?.[0]?.value ?? "",
    value: num(r.metricValues?.[0]?.value),
  }));
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test -- analytics-ga4-transform`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/analytics/ga4.ts frontend/test/analytics-ga4-transform.test.ts
git commit -m "feat(analytics): GA4 回應純轉換"
```

---

## Task 9: GA4 呼叫與快取（getGa4Dashboard）

負責：組多份 `runReport`（KPI 本期/上期、每日、熱門頁、來源、裝置），呼叫 API，用純轉換組出 `Ga4Dashboard`，並以 `unstable_cache`（tag `analytics`）快取。此層有 I/O，不寫單元測試（轉換已測），靠型別檢查與頁面實測。

**Files:**
- Modify: `frontend/src/lib/analytics/ga4.ts`
- Modify: `frontend/src/lib/data/cache.ts`（加 `analytics` tag）

- [ ] **Step 1: 加快取 tag**

在 `frontend/src/lib/data/cache.ts` 的 `CACHE_TAGS` 內加一行：

```ts
  siteSettings: "site_settings",
  analytics: "analytics",
```

- [ ] **Step 2: 於 ga4.ts 追加呼叫與快取**

在 `ga4.ts` 末尾追加（import 補 `unstable_cache`、`getGoogleAccessToken`、`googleApiPost`、`computeRange`/`taipeiTodayYmd`/`GA4_LAG_DAYS`、`pctChange` 免了—比較在元件做；型別 `Ga4Dashboard`/`Metric` 等）：

```ts
import { unstable_cache } from "next/cache";
import { CACHE_TAGS, REVALIDATE_SECONDS } from "../data/cache";
import { getGoogleAccessToken } from "./google-auth";
import { googleApiPost } from "./google-fetch";
import { computeRange, taipeiTodayYmd, GA4_LAG_DAYS } from "./ranges";
import type { Ga4Dashboard, DailyPoint } from "./types";

const GA4_URL = (propertyId: string) =>
  `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;

interface Window { startDate: string; endDate: string }

async function runReport(
  propertyId: string,
  token: string,
  body: Record<string, unknown>,
): Promise<RawReport> {
  return googleApiPost<RawReport>(GA4_URL(propertyId), token, body);
}

/** 對齊每日兩期：以相對日 index 對應（上期同 index）。長度不足 → previous=null。 */
function buildDaily(cur: RawReport, prev: RawReport): DailyPoint[] {
  const curRows = cur.rows ?? [];
  const prevRows = prev.rows ?? [];
  return curRows.map((r, i) => ({
    date: r.dimensionValues?.[0]?.value ?? "",
    current: num(r.metricValues?.[0]?.value),
    previous:
      i < prevRows.length ? num(prevRows[i].metricValues?.[0]?.value) : null,
  }));
}

async function fetchGa4(propertyId: string, days: number): Promise<Ga4Dashboard> {
  const token = await getGoogleAccessToken();
  const { current, previous } = computeRange(taipeiTodayYmd(), days, GA4_LAG_DAYS);

  const kpiMetrics = [
    { name: "activeUsers" },
    { name: "sessions" },
    { name: "screenPageViews" },
    { name: "averageSessionDuration" },
  ];
  const dr = (w: Window) => [{ startDate: w.startDate, endDate: w.endDate }];

  const [curKpi, prevKpi, curDaily, prevDaily, pages, sources, devices] =
    await Promise.all([
      runReport(propertyId, token, { dateRanges: dr(current), metrics: kpiMetrics }),
      runReport(propertyId, token, { dateRanges: dr(previous), metrics: kpiMetrics }),
      runReport(propertyId, token, {
        dateRanges: dr(current),
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      runReport(propertyId, token, {
        dateRanges: dr(previous),
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
      runReport(propertyId, token, {
        dateRanges: dr(current),
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }, { name: "averageSessionDuration" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 10,
      }),
      runReport(propertyId, token, {
        dateRanges: dr(current),
        dimensions: [{ name: "sessionSourceMedium" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
        limit: 8,
      }),
      runReport(propertyId, token, {
        dateRanges: dr(current),
        dimensions: [{ name: "deviceCategory" }],
        metrics: [{ name: "activeUsers" }],
        orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
      }),
    ]);

  const metric = (i: number) => ({
    value: parseScalarMetric(curKpi, i),
    previous: parseScalarMetric(prevKpi, i),
  });

  return {
    users: metric(0),
    sessions: metric(1),
    pageViews: metric(2),
    avgEngagementSec: metric(3),
    daily: buildDaily(curDaily, prevDaily),
    topPages: parseTopPages(pages),
    sources: parseNamedRows(sources),
    devices: parseNamedRows(devices),
    asOf: current.endDate,
  };
}

/** 快取包裝：key 含 propertyId 與 days；tag `analytics`；1 小時。 */
export function getGa4Dashboard(propertyId: string, days: number): Promise<Ga4Dashboard> {
  return unstable_cache(
    () => fetchGa4(propertyId, days),
    ["ga4-dashboard", propertyId, String(days)],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.analytics] },
  )();
}
```

- [ ] **Step 3: 型別檢查**

Run: `npm run typecheck`
Expected: PASS（若報 `parseScalarMetric` 等未匯出，確認 Task 8 已 `export`）

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/analytics/ga4.ts frontend/src/lib/data/cache.ts
git commit -m "feat(analytics): GA4 查詢與快取 getGa4Dashboard"
```

---

## Task 10: GSC 回應轉換（純函式）

負責：把 GSC `searchAnalytics.query` 回應（`rows[].keys/clicks/impressions/ctr/position`）轉成型別化列。

**Files:**
- Create: `frontend/src/lib/analytics/gsc.ts`（先放純轉換）
- Test: `frontend/test/analytics-gsc-transform.test.ts`

- [ ] **Step 1: 寫失敗測試**

```ts
// frontend/test/analytics-gsc-transform.test.ts
import { describe, it, expect } from "vitest";
import { parseGscRows, sumGscTotals } from "@/lib/analytics/gsc";

const resp = {
  rows: [
    { keys: ["空壓機"], clicks: 2, impressions: 67, ctr: 0.0298, position: 20.9 },
    { keys: ["勁賀"], clicks: 7, impressions: 39, ctr: 0.179, position: 4.1 },
  ],
};

describe("parseGscRows（單維度）", () => {
  it("keys[0] → label，帶四指標", () => {
    const out = parseGscRows(resp, "query");
    expect(out[0]).toEqual({
      query: "空壓機", clicks: 2, impressions: 67, ctr: 0.0298, position: 20.9,
    });
  });
  it("dimension=page → 以 page 命名", () => {
    const out = parseGscRows({ rows: [{ keys: ["https://a/p"], clicks: 1, impressions: 10, ctr: 0.1, position: 3 }] }, "page");
    expect(out[0].page).toBe("https://a/p");
  });
  it("空回應 → []", () => {
    expect(parseGscRows({}, "query")).toEqual([]);
  });
});

describe("sumGscTotals（彙總 clicks/impressions，加權 ctr/position）", () => {
  it("clicks/impressions 相加，ctr=clicks/impr，position 以曝光加權平均", () => {
    const t = sumGscTotals(resp.rows);
    expect(t.clicks).toBe(9);
    expect(t.impressions).toBe(106);
    expect(t.ctr).toBeCloseTo(9 / 106);
    // 加權平均排名 = (20.9*67 + 4.1*39) / 106
    expect(t.position).toBeCloseTo((20.9 * 67 + 4.1 * 39) / 106);
  });
  it("空 → 全 0", () => {
    expect(sumGscTotals([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });
});
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test -- analytics-gsc-transform`
Expected: FAIL（模組不存在）

- [ ] **Step 3: 實作 gsc.ts 純轉換段**

```ts
// frontend/src/lib/analytics/gsc.ts
// Search Console API 封裝：純轉換（可測）+ 呼叫與快取（Task 11）。SERVER ONLY。
import "server-only";
import type { GscPageRow } from "./types";

interface RawGscRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
}
interface RawGsc {
  rows?: RawGscRow[];
}

const n = (v: number | undefined): number => (Number.isFinite(v) ? (v as number) : 0);

/** 單維度回應 → 型別化列。dimension 決定 label 欄位名（query 或 page）。 */
export function parseGscRows(
  resp: RawGsc,
  dimension: "query" | "page",
): (GscPageRow & { query: string })[] {
  return (resp.rows ?? []).map((r) => {
    const key = r.keys?.[0] ?? "";
    return {
      query: dimension === "query" ? key : "",
      page: dimension === "page" ? key : "",
      clicks: n(r.clicks),
      impressions: n(r.impressions),
      ctr: n(r.ctr),
      position: n(r.position),
    };
  });
}

/** 彙總為總點擊/曝光、整體 CTR、以曝光加權的平均排名。 */
export function sumGscTotals(
  rows: RawGscRow[],
): { clicks: number; impressions: number; ctr: number; position: number } {
  let clicks = 0, impressions = 0, weightedPos = 0;
  for (const r of rows) {
    clicks += n(r.clicks);
    impressions += n(r.impressions);
    weightedPos += n(r.position) * n(r.impressions);
  }
  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weightedPos / impressions : 0,
  };
}
```

- [ ] **Step 4: 執行確認通過**

Run: `npm run test -- analytics-gsc-transform`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/analytics/gsc.ts frontend/test/analytics-gsc-transform.test.ts
git commit -m "feat(analytics): GSC 回應純轉換"
```

---

## Task 11: GSC 呼叫與快取（getGscDashboard）

負責：查兩期彙總 KPI、關鍵字 Top 20、著陸頁 Top 20，組 `GscDashboard`，套 `unstable_cache`。GSC 端點的 siteUrl 需 URL-encode。

**Files:**
- Modify: `frontend/src/lib/analytics/gsc.ts`

- [ ] **Step 1: 追加呼叫與快取**

```ts
import { unstable_cache } from "next/cache";
import { CACHE_TAGS, REVALIDATE_SECONDS } from "../data/cache";
import { getGoogleAccessToken } from "./google-auth";
import { googleApiPost } from "./google-fetch";
import { computeRange, taipeiTodayYmd, GSC_LAG_DAYS } from "./ranges";
import { findOpportunities } from "./insights";
import type { GscDashboard } from "./types";

const GSC_URL = (siteUrl: string) =>
  `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(
    siteUrl,
  )}/searchAnalytics/query`;

async function query(
  siteUrl: string,
  token: string,
  body: Record<string, unknown>,
): Promise<RawGsc> {
  return googleApiPost<RawGsc>(GSC_URL(siteUrl), token, body);
}

async function fetchGsc(siteUrl: string, days: number): Promise<GscDashboard> {
  const token = await getGoogleAccessToken();
  const { current, previous } = computeRange(taipeiTodayYmd(), days, GSC_LAG_DAYS);
  const win = (w: { startDate: string; endDate: string }) => ({
    startDate: w.startDate,
    endDate: w.endDate,
  });

  const [curTotals, prevTotals, queries, pages] = await Promise.all([
    query(siteUrl, token, win(current)), // 無 dimensions → 單列總計
    query(siteUrl, token, win(previous)),
    query(siteUrl, token, { ...win(current), dimensions: ["query"], rowLimit: 20 }),
    query(siteUrl, token, { ...win(current), dimensions: ["page"], rowLimit: 20 }),
  ]);

  const cur = sumGscTotals(curTotals.rows ?? []);
  const prev = sumGscTotals(prevTotals.rows ?? []);
  const pageRows = parseGscRows(pages, "page").map(({ query: _q, ...rest }) => rest);

  return {
    kpis: {
      clicks: { value: cur.clicks, previous: prev.clicks },
      impressions: { value: cur.impressions, previous: prev.impressions },
      ctr: { value: cur.ctr, previous: prev.ctr },
      position: { value: cur.position, previous: prev.position },
    },
    queries: parseGscRows(queries, "query").map(({ page: _p, ...rest }) => rest),
    pages: pageRows,
    opportunities: findOpportunities(pageRows),
    asOf: current.endDate,
  };
}

/** 快取包裝：key 含 siteUrl 與 days；tag `analytics`；1 小時。 */
export function getGscDashboard(siteUrl: string, days: number): Promise<GscDashboard> {
  return unstable_cache(
    () => fetchGsc(siteUrl, days),
    ["gsc-dashboard", siteUrl, String(days)],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.analytics] },
  )();
}
```

- [ ] **Step 2: 型別檢查**

Run: `npm run typecheck`
Expected: PASS（`queries` 型別需與 `GscDashboard.queries` 一致；`GscPageRow` 不含 `query`，故 `pages` map 去掉 `query`。若 TS 報 unused `_q`/`_p`，改用 `eslint-disable` 或改寫為 `const { query: _q } = ...` 省略——實作時以 typecheck/lint 為準）

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/analytics/gsc.ts
git commit -m "feat(analytics): GSC 查詢與快取 getGscDashboard"
```

---

## Task 12: 設定頁新增兩個欄位（property id / site url）

負責：讓管理員在 網站設定 ▸ 分析與索引 填入 GA4 資源 ID 與 GSC 資源網址，存進 `site_settings.analytics`。

**Files:**
- Modify: `frontend/src/app/admin/(protected)/settings/AnalyticsSettingsForm.tsx`
- Modify: `frontend/src/app/admin/(protected)/settings/actions.ts`
- Modify: `frontend/src/app/admin/(protected)/settings/page.tsx`

- [ ] **Step 1: 表單加兩欄**

在 `AnalyticsSettingsForm.tsx`：props 介面加 `ga4PropertyId: string; gscSiteUrl: string;`，並在 GSC 驗證碼欄位之後、`{state.error …}` 之前插入兩個欄位（沿用既有 class）：

```tsx
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ga4_property_id" className="text-ink text-[14px] font-medium">
          GA4 資源 ID（Property ID，純數字）
        </label>
        <input
          id="ga4_property_id"
          name="ga4_property_id"
          defaultValue={ga4PropertyId}
          autoComplete="off"
          placeholder="例：544523300"
          className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
        />
        <p className="text-text-muted text-[12px]">
          用於後台「流量分析」讀取 GA4 數據。與上方「評估 ID（G- 開頭）」不同，這是純數字的資源 ID。
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="gsc_site_url" className="text-ink text-[14px] font-medium">
          Search Console 資源網址
        </label>
        <input
          id="gsc_site_url"
          name="gsc_site_url"
          defaultValue={gscSiteUrl}
          autoComplete="off"
          placeholder="例：sc-domain:airexpert.com.tw"
          className="border-border focus:border-primary h-11 rounded-lg border px-3 text-[15px] outline-none"
        />
        <p className="text-text-muted text-[12px]">
          網域資源填 <code>sc-domain:網域</code>；網址前置字元資源填完整網址（含結尾斜線）。
        </p>
      </div>
```

並把函式簽章改為：

```tsx
export function AnalyticsSettingsForm({
  ga4Id,
  gscVerification,
  ga4PropertyId,
  gscSiteUrl,
}: {
  ga4Id: string;
  gscVerification: string;
  ga4PropertyId: string;
  gscSiteUrl: string;
}) {
```

- [ ] **Step 2: action 存兩個新值**

在 `actions.ts` 的 `saveAnalyticsConfig`：擴充 `parseAnalyticsConfig` 的輸入與寫回。GA4 property id 僅允許純數字（防呆），GSC site url trim 後原樣存。

```ts
  const parsed = parseAnalyticsConfig({
    ga4_id: String(fd.get("ga4_id") ?? ""),
    gsc_verification: String(fd.get("gsc_verification") ?? ""),
    ga4_property_id: String(fd.get("ga4_property_id") ?? ""),
    gsc_site_url: String(fd.get("gsc_site_url") ?? ""),
  });

  if (parsed.ga4Id && !isLikelyGa4Id(parsed.ga4Id)) {
    return { error: "GA4 測量 ID 格式不正確（應為 G- 開頭的英數字）。" };
  }
  if (parsed.ga4PropertyId && !/^\d+$/.test(parsed.ga4PropertyId)) {
    return { error: "GA4 資源 ID 應為純數字。" };
  }

  const value: AnalyticsValue = {};
  if (parsed.ga4Id) value.ga4_id = parsed.ga4Id;
  if (parsed.gscVerification) value.gsc_verification = parsed.gscVerification;
  if (parsed.ga4PropertyId) value.ga4_property_id = parsed.ga4PropertyId;
  if (parsed.gscSiteUrl) value.gsc_site_url = parsed.gscSiteUrl;
```

- [ ] **Step 3: 設定頁傳新 props**

在 `settings/page.tsx` 的 `<AnalyticsSettingsForm … />` 補兩個 prop：

```tsx
        <AnalyticsSettingsForm
          ga4Id={analytics.ga4Id ?? ""}
          gscVerification={analytics.gscVerification ?? ""}
          ga4PropertyId={analytics.ga4PropertyId ?? ""}
          gscSiteUrl={analytics.gscSiteUrl ?? ""}
        />
```

- [ ] **Step 4: 型別檢查 + 現有測試**

Run: `npm run typecheck && npm run test -- analytics-config`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "frontend/src/app/admin/(protected)/settings/"
git commit -m "feat(analytics): 設定頁新增 GA4 property id / GSC site url"
```

---

## Task 13: 展示元件（KPI / 折線 / 橫條 / 表 / 優化機會 / 引導）

負責：純展示元件，無資料抓取。手寫 SVG 圖表。以 `npm run build`／`typecheck` 為驗證（無單元測試——皆為無邏輯 render）。

**Files:**
- Create: `frontend/src/app/admin/(protected)/analytics/KpiCard.tsx`
- Create: `frontend/src/app/admin/(protected)/analytics/LineChart.tsx`
- Create: `frontend/src/app/admin/(protected)/analytics/BarList.tsx`
- Create: `frontend/src/app/admin/(protected)/analytics/DataTable.tsx`
- Create: `frontend/src/app/admin/(protected)/analytics/OpportunityList.tsx`
- Create: `frontend/src/app/admin/(protected)/analytics/SetupNotice.tsx`

- [ ] **Step 1: KpiCard.tsx**

```tsx
import { pctChange, formatPct } from "@/lib/analytics/format";
import type { Metric } from "@/lib/analytics/types";

/** 單張 KPI 卡：標題、主值、與上期比較。value 可為整數或已格式化字串。 */
export function KpiCard({
  label,
  metric,
  format = (n: number) => n.toLocaleString("zh-TW"),
}: {
  label: string;
  metric: Metric;
  format?: (n: number) => string;
}) {
  const ratio = pctChange(metric.value, metric.previous);
  const up = ratio !== null && ratio > 0;
  const down = ratio !== null && ratio < 0;
  return (
    <div className="border-border rounded-xl border bg-white p-4">
      <p className="text-text-muted text-[13px]">{label}</p>
      <p className="text-ink mt-1 text-[24px] font-bold">{format(metric.value)}</p>
      <p
        className={`mt-0.5 text-[12px] ${
          up ? "text-primary-deep" : down ? "text-red-600" : "text-text-muted"
        }`}
      >
        {formatPct(ratio)} <span className="text-text-muted">vs 上期</span>
      </p>
    </div>
  );
}
```

- [ ] **Step 2: LineChart.tsx（SVG 雙線）**

```tsx
import type { DailyPoint } from "@/lib/analytics/types";

/** 手寫 SVG 折線：本期（實線）vs 上期（灰虛線）。無外部套件。 */
export function LineChart({ points }: { points: DailyPoint[] }) {
  const W = 640, H = 180, P = 8;
  if (points.length === 0) {
    return <p className="text-text-muted text-[13px]">此區間無資料。</p>;
  }
  const cur = points.map((p) => p.current);
  const prev = points.map((p) => p.previous ?? 0);
  const max = Math.max(1, ...cur, ...prev);
  const x = (i: number) =>
    P + (i * (W - 2 * P)) / Math.max(1, points.length - 1);
  const y = (v: number) => H - P - (v * (H - 2 * P)) / max;
  const path = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[180px] w-full" role="img" aria-label="每日使用者趨勢">
      <path d={path(prev)} fill="none" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 3" />
      <path d={path(cur)} fill="none" stroke="var(--color-primary, #2f855a)" strokeWidth={2} />
    </svg>
  );
}
```

- [ ] **Step 3: BarList.tsx（橫條）**

```tsx
import type { NamedRow } from "@/lib/analytics/types";

/** 橫條列：依最大值等比。用於流量來源、裝置分布。 */
export function BarList({ rows }: { rows: NamedRow[] }) {
  if (rows.length === 0) {
    return <p className="text-text-muted text-[13px]">此區間無資料。</p>;
  }
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-3">
          <span className="text-ink w-40 shrink-0 truncate text-[13px]" title={r.label}>
            {r.label}
          </span>
          <span className="bg-surface-muted relative h-5 flex-1 overflow-hidden rounded">
            <span
              className="bg-primary/70 absolute inset-y-0 left-0 rounded"
              style={{ width: `${(r.value / max) * 100}%` }}
            />
          </span>
          <span className="text-text-muted w-14 shrink-0 text-right text-[13px]">
            {r.value.toLocaleString("zh-TW")}
          </span>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 4: DataTable.tsx（通用小表）**

```tsx
import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
}

/** 通用唯讀小表（熱門頁面／關鍵字／著陸頁共用）。 */
export function DataTable<T>({
  columns,
  rows,
  getKey,
  empty = "此區間無資料。",
}: {
  columns: Column<T>[];
  rows: T[];
  getKey: (row: T, i: number) => string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-text-muted text-[13px]">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-text-muted border-border border-b text-left">
            {columns.map((c) => (
              <th key={c.header} className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={getKey(row, i)} className="border-border/60 border-b">
              {columns.map((c) => (
                <td key={c.header} className={`text-ink px-3 py-2 ${c.align === "right" ? "text-right" : ""}`}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: OpportunityList.tsx**

```tsx
import Link from "next/link";
import type { Opportunity } from "@/lib/analytics/types";

/** 優化機會：曝光高但 CTR 低的著陸頁，按鈕連往 SEO 總覽並預填搜尋。 */
export function OpportunityList({ items }: { items: Opportunity[] }) {
  if (items.length === 0) {
    return (
      <p className="text-text-muted text-[13px]">
        目前沒有「曝光高但點擊率低」的頁面 — 很好，代表標題與描述吸引到點擊。
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((o) => (
        <li
          key={o.page}
          className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
        >
          <div className="min-w-0">
            <p className="text-ink truncate text-[14px]" title={o.page}>{o.page}</p>
            <p className="text-text-muted text-[12px]">
              曝光 {o.impressions.toLocaleString("zh-TW")}、點擊 {o.clicks}、
              CTR {(o.ctr * 100).toFixed(1)}%、平均排名 {o.position.toFixed(1)}
            </p>
          </div>
          {o.slug ? (
            <Link
              href={`/admin/seo?q=${encodeURIComponent(o.slug)}`}
              className="border-primary text-primary-deep hover:bg-primary/5 shrink-0 rounded-lg border px-3 py-1.5 text-[13px]"
            >
              改 SEO →
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 6: SetupNotice.tsx**

```tsx
import Link from "next/link";

/** 未設定 / 錯誤時的引導卡片。 */
export function SetupNotice({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-border bg-surface-muted rounded-xl border border-dashed p-6">
      <p className="text-ink text-[15px] font-semibold">{title}</p>
      <div className="text-text-muted mt-1 text-[13px]">{children}</div>
      <Link href="/admin/settings" className="text-primary-deep mt-3 inline-block text-[13px] underline">
        前往網站設定 →
      </Link>
    </div>
  );
}
```

- [ ] **Step 7: 型別檢查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add "frontend/src/app/admin/(protected)/analytics/"
git commit -m "feat(analytics): 展示元件（KPI/折線/橫條/表/優化機會/引導）"
```

---

## Task 14: 兩區 Section（GA4 / GSC，含錯誤處理）

負責：async server 元件，各自抓資料、try/catch，組出區塊。未設定或 API 失敗時渲染 `SetupNotice`。

**Files:**
- Create: `frontend/src/app/admin/(protected)/analytics/Ga4Section.tsx`
- Create: `frontend/src/app/admin/(protected)/analytics/GscSection.tsx`

- [ ] **Step 1: Ga4Section.tsx**

```tsx
import { getGa4Dashboard } from "@/lib/analytics/ga4";
import { hasServiceAccount } from "@/lib/analytics/google-auth";
import { prettyPagePath } from "@/lib/analytics/format";
import { KpiCard } from "./KpiCard";
import { LineChart } from "./LineChart";
import { BarList } from "./BarList";
import { DataTable } from "./DataTable";
import { SetupNotice } from "./SetupNotice";

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return m > 0 ? `${m}分${s}秒` : `${s}秒`;
}

export async function Ga4Section({ propertyId, days }: { propertyId: string | null; days: number }) {
  if (!propertyId) {
    return <SetupNotice title="尚未設定 GA4 資源 ID">請至網站設定填入 GA4 資源 ID（純數字）。</SetupNotice>;
  }
  if (!hasServiceAccount()) {
    return <SetupNotice title="尚未設定服務帳戶金鑰">請設定環境變數 GOOGLE_SERVICE_ACCOUNT_JSON。</SetupNotice>;
  }
  let d;
  try {
    d = await getGa4Dashboard(propertyId, days);
  } catch (e) {
    return <SetupNotice title="讀取 GA4 失敗">{(e as Error).message}。請確認服務帳戶已被加入該 GA4 資源。</SetupNotice>;
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="text-text-muted text-[12px]">數據截至 {d.asOf}（不含當日）</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="使用者" metric={d.users} />
        <KpiCard label="工作階段" metric={d.sessions} />
        <KpiCard label="頁面瀏覽" metric={d.pageViews} />
        <KpiCard label="平均參與時間" metric={d.avgEngagementSec} format={fmtDuration} />
      </div>
      <div className="border-border rounded-xl border bg-white p-4">
        <p className="text-ink mb-2 text-[14px] font-semibold">每日使用者（本期 vs 上期）</p>
        <LineChart points={d.daily} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border-border rounded-xl border bg-white p-4">
          <p className="text-ink mb-3 text-[14px] font-semibold">熱門頁面 Top 10</p>
          <DataTable
            rows={d.topPages}
            getKey={(r) => r.path}
            columns={[
              { header: "頁面", cell: (r) => (
                <span title={r.path}>{prettyPagePath(r.title || r.path)}</span>
              ) },
              { header: "瀏覽", align: "right", cell: (r) => r.views.toLocaleString("zh-TW") },
              { header: "平均停留", align: "right", cell: (r) => fmtDuration(r.avgTimeSec) },
            ]}
          />
        </div>
        <div className="border-border rounded-xl border bg-white p-4">
          <p className="text-ink mb-3 text-[14px] font-semibold">流量來源 Top 8</p>
          <BarList rows={d.sources} />
          <p className="text-ink mt-4 mb-3 text-[14px] font-semibold">裝置分布</p>
          <BarList rows={d.devices} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: GscSection.tsx**

```tsx
import { getGscDashboard } from "@/lib/analytics/gsc";
import { hasServiceAccount } from "@/lib/analytics/google-auth";
import { KpiCard } from "./KpiCard";
import { DataTable } from "./DataTable";
import { OpportunityList } from "./OpportunityList";
import { SetupNotice } from "./SetupNotice";

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
const pos = (n: number) => n.toFixed(1);

export async function GscSection({ siteUrl, days }: { siteUrl: string | null; days: number }) {
  if (!siteUrl) {
    return <SetupNotice title="尚未設定 Search Console 資源">請至網站設定填入 GSC 資源網址。</SetupNotice>;
  }
  if (!hasServiceAccount()) {
    return <SetupNotice title="尚未設定服務帳戶金鑰">請設定環境變數 GOOGLE_SERVICE_ACCOUNT_JSON。</SetupNotice>;
  }
  let d;
  try {
    d = await getGscDashboard(siteUrl, days);
  } catch (e) {
    return <SetupNotice title="讀取 Search Console 失敗">{(e as Error).message}。請確認服務帳戶已被加入該資源，且資源網址格式正確。</SetupNotice>;
  }
  return (
    <div className="flex flex-col gap-6">
      <p className="text-text-muted text-[12px]">搜尋數據截至 {d.asOf}（Search Console 約有 2–3 天延遲）</p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="總點擊" metric={d.kpis.clicks} />
        <KpiCard label="總曝光" metric={d.kpis.impressions} />
        <KpiCard label="平均 CTR" metric={d.kpis.ctr} format={pct} />
        <KpiCard label="平均排名" metric={d.kpis.position} format={pos} />
      </div>
      <div className="border-border rounded-xl border bg-white p-4">
        <p className="text-ink mb-3 text-[14px] font-semibold">優化機會（曝光高、點擊率低）</p>
        <OpportunityList items={d.opportunities} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="border-border rounded-xl border bg-white p-4">
          <p className="text-ink mb-3 text-[14px] font-semibold">熱門關鍵字 Top 20</p>
          <DataTable
            rows={d.queries}
            getKey={(r) => r.query}
            columns={[
              { header: "關鍵字", cell: (r) => r.query },
              { header: "點擊", align: "right", cell: (r) => r.clicks },
              { header: "曝光", align: "right", cell: (r) => r.impressions },
              { header: "CTR", align: "right", cell: (r) => pct(r.ctr) },
              { header: "排名", align: "right", cell: (r) => pos(r.position) },
            ]}
          />
        </div>
        <div className="border-border rounded-xl border bg-white p-4">
          <p className="text-ink mb-3 text-[14px] font-semibold">著陸頁 Top 20</p>
          <DataTable
            rows={d.pages}
            getKey={(r) => r.page}
            columns={[
              { header: "頁面", cell: (r) => <span title={r.page}>{r.page}</span> },
              { header: "點擊", align: "right", cell: (r) => r.clicks },
              { header: "曝光", align: "right", cell: (r) => r.impressions },
              { header: "CTR", align: "right", cell: (r) => pct(r.ctr) },
              { header: "排名", align: "right", cell: (r) => pos(r.position) },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 型別檢查**

Run: `npm run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add "frontend/src/app/admin/(protected)/analytics/Ga4Section.tsx" "frontend/src/app/admin/(protected)/analytics/GscSection.tsx"
git commit -m "feat(analytics): GA4 / GSC 兩區 Section（含錯誤處理）"
```

---

## Task 15: 區間切換、重新整理、頁面組裝

負責：`page.tsx` 守門、讀設定、讀 `?range=`、以 `Suspense` 串流兩區；`RangeTabs` 切換區間；`RefreshButton` 失效快取。

**Files:**
- Create: `frontend/src/app/admin/(protected)/analytics/RangeTabs.tsx`
- Create: `frontend/src/app/admin/(protected)/analytics/RefreshButton.tsx`
- Create: `frontend/src/app/admin/(protected)/analytics/actions.ts`
- Create: `frontend/src/app/admin/(protected)/analytics/page.tsx`

- [ ] **Step 1: actions.ts（失效快取）**

```ts
"use server";
import { updateTag } from "next/cache";
import { requireRole } from "@/lib/admin/auth";

/** 手動失效 analytics 快取；admin 與 seo_manager 皆可。 */
export async function refreshAnalytics(): Promise<void> {
  await requireRole(["admin", "seo_manager"]);
  updateTag("analytics");
}
```

- [ ] **Step 2: RangeTabs.tsx**

```tsx
"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { RANGE_DAYS } from "@/lib/analytics/ranges";

/** 7 / 30 / 90 天切換：改寫 ?range= 並導航（保留其他 param）。 */
export function RangeTabs({ current }: { current: number }) {
  const router = useRouter();
  const params = useSearchParams();
  const go = (days: number) => {
    const next = new URLSearchParams(params);
    next.set("range", String(days));
    router.push(`/admin/analytics?${next.toString()}`);
  };
  return (
    <div className="inline-flex rounded-lg border border-border bg-white p-0.5">
      {RANGE_DAYS.map((d) => (
        <button
          key={d}
          onClick={() => go(d)}
          className={`rounded-md px-3 py-1.5 text-[13px] ${
            current === d ? "bg-primary text-white" : "text-text-muted hover:text-ink"
          }`}
        >
          近 {d} 天
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: RefreshButton.tsx**

```tsx
"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { refreshAnalytics } from "./actions";

/** 失效快取後重新整理當前頁。 */
export function RefreshButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      onClick={() => start(async () => { await refreshAnalytics(); router.refresh(); })}
      disabled={pending}
      className="border-border text-text-muted hover:text-ink rounded-lg border bg-white px-3 py-1.5 text-[13px] disabled:opacity-50"
    >
      {pending ? "更新中…" : "重新整理"}
    </button>
  );
}
```

- [ ] **Step 4: page.tsx（組裝）**

```tsx
import { Suspense } from "react";
import { requireRole } from "@/lib/admin/auth";
import { getAnalytics } from "@/lib/data/site";
import { RANGE_DAYS } from "@/lib/analytics/ranges";
import { RangeTabs } from "./RangeTabs";
import { RefreshButton } from "./RefreshButton";
import { Ga4Section } from "./Ga4Section";
import { GscSection } from "./GscSection";

export const metadata = { title: "流量分析" };

function SectionSkeleton() {
  return <div className="border-border h-40 animate-pulse rounded-xl border bg-white" />;
}

/** 將 ?range= 收斂到允許值，預設 30。 */
function resolveRange(raw: string | undefined): number {
  const n = Number(raw);
  return (RANGE_DAYS as readonly number[]).includes(n) ? n : 30;
}

export default async function AdminAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  await requireRole(["admin", "seo_manager"]);
  const analytics = await getAnalytics();
  const { range } = await searchParams;
  const days = resolveRange(range);

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-ink text-[24px] font-bold">流量分析</h1>
          <p className="text-text-muted mt-1 text-[14px]">網站流量（GA4）與搜尋成效（Search Console）。數據每小時更新一次。</p>
        </div>
        <div className="flex items-center gap-2">
          <RangeTabs current={days} />
          <RefreshButton />
        </div>
      </div>

      <section className="mb-10">
        <h2 className="text-ink mb-4 text-[18px] font-semibold">網站流量</h2>
        <Suspense fallback={<SectionSkeleton />}>
          <Ga4Section propertyId={analytics.ga4PropertyId} days={days} />
        </Suspense>
      </section>

      <section>
        <h2 className="text-ink mb-4 text-[18px] font-semibold">搜尋成效</h2>
        <Suspense fallback={<SectionSkeleton />}>
          <GscSection siteUrl={analytics.gscSiteUrl} days={days} />
        </Suspense>
      </section>
    </div>
  );
}
```

> 注意：`searchParams` 在本版 Next 為 Promise（需 await）。若 typecheck 顯示型別不符，依 `node_modules/next/dist/docs/` 的 App Router page props 定義調整。

- [ ] **Step 5: 型別檢查 + build**

Run: `npm run typecheck && npm run build`
Expected: PASS（build 完成，`/admin/analytics` 出現在路由清單）

- [ ] **Step 6: Commit**

```bash
git add "frontend/src/app/admin/(protected)/analytics/"
git commit -m "feat(analytics): 區間切換、重新整理與頁面組裝"
```

---

## Task 16: 側欄項目 + SEO 深連結（initialQuery）

負責：把「流量分析」加進後台側欄；讓 SEO 總覽能吃 `?q=` 預填搜尋，完成優化機會→SEO 編輯的閉環。

**Files:**
- Modify: `frontend/src/lib/admin/nav-config.ts`
- Modify: `frontend/src/app/admin/(protected)/seo/page.tsx`
- Modify: `frontend/src/app/admin/(protected)/seo/SeoOverviewClient.tsx`
- Test: `frontend/test/nav-config.test.ts`（既有，補一則）

- [ ] **Step 1: 側欄測試（先失敗）**

在 `frontend/test/nav-config.test.ts` 補（沿用檔內既有 import 與風格；若已 import `ADMIN_NAV`/`navForRole` 則直接加 it）：

```ts
  it("包含『流量分析』且 admin 與 seo_manager 皆可見", () => {
    const item = ADMIN_NAV.find((i) => i.key === "analytics");
    expect(item).toBeTruthy();
    expect(item?.enabled).toBe(true);
    expect(navForRole("seo_manager").some((i) => i.key === "analytics")).toBe(true);
    expect(navForRole("admin").some((i) => i.key === "analytics")).toBe(true);
  });
```

- [ ] **Step 2: 執行確認失敗**

Run: `npm run test -- nav-config`
Expected: FAIL（找不到 analytics 項）

- [ ] **Step 3: nav-config 加項**

在 `ADMIN_NAV` 陣列的 `seo` 項之後插入（不設 `roles` → 全後台角色可見）：

```ts
  { key: "analytics", label: "流量分析", href: "/admin/analytics", enabled: true },
```

- [ ] **Step 4: SEO 頁吃 ?q=**

`seo/page.tsx` 改為讀 searchParams 並傳入：

```tsx
export default async function AdminSeoOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireRole(["admin", "seo_manager"]);
  const rows = await getAllForSeo();
  const { q } = await searchParams;

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-ink text-[24px] font-bold">SEO 總覽</h1>
        <p className="text-text-muted mt-1 text-[14px]">
          跨五區檢視 SEO 缺漏並快速編輯 meta。僅顯示「已發佈 /
          草稿」內容；此處只編 SEO，不改內文。
        </p>
      </div>
      <SeoOverviewClient rows={rows} initialQuery={q ?? ""} />
    </div>
  );
}
```

- [ ] **Step 5: SeoOverviewClient 吃 initialQuery**

改簽章與 state 初始化：

```tsx
export function SeoOverviewClient({
  rows,
  initialQuery = "",
}: {
  rows: SeoRow[];
  initialQuery?: string;
}) {
  const [table, setTable] = useState<SeoTable | "all">("all");
  const [query, setQuery] = useState(initialQuery);
```

- [ ] **Step 6: 執行測試 + 型別 + build**

Run: `npm run test -- nav-config && npm run typecheck && npm run build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/admin/nav-config.ts "frontend/src/app/admin/(protected)/seo/" frontend/test/nav-config.test.ts
git commit -m "feat(analytics): 側欄項目 + SEO 深連結 initialQuery"
```

---

## Task 17: env 範本 + 全量驗證 + 手動實測

負責：補 env 範本；跑全套檢查；用真實憑證在本機實際開頁確認。

**Files:**
- Modify: `frontend/.env.local.example`

- [ ] **Step 1: 補 env 範本**

在 `frontend/.env.local.example` 的「僅 server 端」段末補：

```
# Google 服務帳戶金鑰（base64 的 service account JSON），供 後台 ▸ 流量分析 讀 GA4/GSC。切勿外流。
GOOGLE_SERVICE_ACCOUNT_JSON=
```

- [ ] **Step 2: 全量檢查**

Run:
```bash
cd frontend && npm run format && npm run lint && npm run typecheck && npm run test && npm run build
```
Expected: 全 PASS（format 會改動排版；lint/tsc/test/build 皆綠）

- [ ] **Step 3: 手動實測（真實憑證）**

Run: `cd frontend && npm run dev`，以 admin 登入後開 `http://localhost:3000/admin/analytics`。

先在 網站設定 ▸ 分析與索引 填入 `GA4 資源 ID = 544523300`、`GSC 資源網址 = sc-domain:airexpert.com.tw` 並儲存，再回流量分析頁確認：
- [ ] GA4 四張 KPI 有數字、每日折線顯示、熱門頁面／來源／裝置有資料
- [ ] GSC 四張 KPI 有數字、關鍵字／著陸頁 Top 20 顯示
- [ ] 「優化機會」列出曝光高 CTR 低的頁面；點「改 SEO →」跳到 `/admin/seo?q=<slug>` 且搜尋框已預填
- [ ] 切換 近 7 / 30 / 90 天數字隨之變化
- [ ] 「重新整理」可重載
- [ ] 兩區標題的「數據截至」日期正確（GA4 昨天、GSC 約 3 天前）

> 若某區顯示 403 引導卡片：確認 service account 已加入該資源、GSC 資源網址格式正確（見 setup 手冊步驟 4/5）。

- [ ] **Step 4: Commit**

```bash
git add frontend/.env.local.example
git commit -m "feat(analytics): env 範本補 GOOGLE_SERVICE_ACCOUNT_JSON"
```

- [ ] **Step 5:（部署前，使用者手動）Vercel 環境變數**

在 Vercel ▸ Project ▸ Settings ▸ Environment Variables 加 `GOOGLE_SERVICE_ACCOUNT_JSON`（值為本機同一串 base64），Production/Preview/Development 全勾。此步不在程式碼內，屬部署設定。

---

## 收尾

全部完成後，建議走 `superpowers:finishing-a-development-branch` 決定合併方式（PR / 直接併入），並用 `fix-review` 做一次本地 code review。
