# 後台流量分析頁（GA4 + Search Console）設計

日期：2026-07-22
狀態：設計確認，待實作

## 背景

官網已埋好 GA4 追蹤碼與 Search Console 驗證碼（見 `lib/analytics/config.ts`、
`components/Analytics.tsx`，設定值存於 `site_settings.analytics`），資料正常收集中。
但管理者要看數據必須另外登入 Google 的兩個後台，且兩邊資料無法互相對照。

本案在後台新增 `/admin/analytics`，把兩邊的關鍵數據讀回自家後台，並與既有的
SEO 總覽（`/admin/seo`）串成「發現問題 → 直接修改 meta」的閉環。

## 目標與非目標

**目標**

1. 給經營層看的流量趨勢：期間比較、熱門頁面、流量來源、裝置分布。
2. 給 SEO 維運者用的搜尋成效：關鍵字、著陸頁、CTR 與排名。
3. 自動指出「曝光高但點擊率低」的頁面，並提供一鍵跳轉到該頁的 SEO 編輯。

**非目標（本案不做）**

- 不自建數據倉儲。不同步、不落地、不寫任何 analytics 資料表。
  GA4 保留 14 個月、GSC 保留 16 個月，對官網的分析需求已足夠。
  未來若需要更長歷史再另案處理，屆時 Google 端資料仍在，可回補。
- 不做自訂日期區間，只提供 7 / 30 / 90 天三個預設。
- 不做即時（realtime）數據。
- 不動 `backend/`。本案全在 Next.js 完成。

## 架構決策

### 決策一：不落地存 DB，即時查詢 + 快取

開頁時直接呼叫 Google API，結果快取 1 小時。

理由：官網流量規模下，Google 自己的資料保留期已涵蓋所有分析需求；省下一張資料表、
一支 cron 與補資料邏輯。以 1 小時快取計算，每日 API 呼叫數為個位數，遠低於免費額度。

### 決策二：呼叫端放 Next.js，不走 FastAPI backend

理由：所有後台邏輯（`supabase-admin`、`requireRole`、設定加密）都已在 Next.js；
`backend/` 目前僅有 `health.py`，為一個唯讀報表啟用它並處理服務間驗證不成比例。

代價是需自行保管 service account 金鑰（Cloud Run 可用附掛身分免金鑰）。風險可控：
該 service account 僅具 GA4 檢視者與 GSC 受限使用者權限，外洩也只能讀取自家流量數據，
無法寫入任何資料。若日後搬到 backend，僅是更換呼叫位置。

### 決策三：不引入圖表套件

用手寫 SVG 畫折線與橫條。前端目前僅 9 個 runtime 依賴，圖表需求單純（一條折線、
數根橫條），不值得多背一個套件的體積。需求變複雜再換。

## Google 端前置設定

需人工在 Google Cloud Console 與各服務完成，實作前必須就緒：

1. 在 GCP 專案啟用 `analyticsdata.googleapis.com` 與 `searchconsole.googleapis.com`。
2. 建立 service account，產生 JSON 金鑰。
3. 將該 service account 的 email 加入 **GA4 資源**的使用者管理，權限「檢視者」。
4. 將同一個 email 加入 **Search Console** 的「使用者與權限」，權限「受限」。
5. 取得兩個識別值填入後台（見下節）。

## 設定值

### 新增後台欄位

`AnalyticsSettingsForm` 增加兩個欄位，一併存入既有的 `site_settings.analytics`：

| 欄位 | 儲存 key | 範例 | 用途 |
| --- | --- | --- | --- |
| GA4 資源 ID | `ga4_property_id` | `123456789` | GA4 Data API 的 property |
| Search Console 資源 | `gsc_site_url` | `sc-domain:airexpert.com.tw` | GSC API 的 siteUrl |

注意：`ga4_property_id`（純數字）與既有的 `ga4_id`（`G-XXXXXXXX` measurement ID）
是不同的值，兩者都需要，用途相反（一個讀、一個寫）。設定頁 UI 需明確區分，
避免管理者填錯。

兩個新值本身非機密（無金鑰即無法使用），故沿用 `analytics` 這筆設定，
不新增加密欄位。`parseAnalyticsConfig()` 相應擴充回傳 `ga4PropertyId`、`gscSiteUrl`。

需留意：`analytics` 這筆設定為 `is_public=true`（前台 layout 要讀它注入 gtag），
故新增的兩個值同樣會被匿名讀取。這是可接受的——它們只是資源識別碼，
沒有金鑰無法據以取得任何資料。真正的機密僅有 service account 金鑰，走環境變數。

### 環境變數

| 變數 | 內容 |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | service account JSON 金鑰，base64 編碼 |

僅存於環境變數（本機 `.env.local` / Vercel 環境變數），不進 DB、不進 git。
`.env.local.example` 需補上此鍵名。

## 頁面設計

### 位置與權限

- 路由：`/admin/analytics`
- 側欄：`nav-config.ts` 於「SEO 總覽」之後插入 `{ key: 'analytics', label: '流量分析' }`
- 權限：admin 與 seo_manager 皆可見（不設 `roles`，即預設全後台角色可見），
  對應本案的兩種使用者

### 區間切換

近 7 天 / 近 30 天 / 近 90 天三顆按鈕。狀態走 URL searchParams（`?range=30`），
不用 client state——可分享連結、重新整理不失狀態、Server Component 直接讀取。

所有數字附「較前一個等長期間」的變化百分比。

### 區塊 A — 網站流量（GA4）

- KPI 卡 ×4：使用者數、工作階段、頁面瀏覽、平均參與時間（各附期間比較）
- 每日使用者折線圖：本期與上期兩條線疊圖
- 熱門頁面 Top 10：頁名、瀏覽數、平均停留時間。查詢時同時取 `pagePath` 與
  `pageTitle` 兩個 dimension，主要顯示 `pageTitle`，其下以小字顯示路徑；
  `pageTitle` 缺漏時退回顯示路徑
- 流量來源 Top 8：來源/媒介、使用者數
- 裝置佔比：桌機 / 手機 / 平板 橫條

### 區塊 B — 搜尋成效（GSC）

- KPI 卡 ×4：總點擊、總曝光、平均 CTR、平均排名（各附期間比較）
- 熱門關鍵字 Top 20：query、點擊、曝光、CTR、平均排名
- 著陸頁 Top 20：同五欄
- 優化機會清單（見下）

### 優化機會

自動篩選 **曝光 > 100 且 CTR < 1%** 的著陸頁，代表「Google 有給曝光但使用者不想點」，
通常是 title / description 不吸引人。

每列顯示：頁面路徑、曝光、點擊、CTR、平均排名，以及一顆連往
`/admin/seo` 對應該頁編輯列的按鈕。

兩個門檻定義為 `insights.ts` 中的具名常數，方便日後調整。

## 資料流

```
page.tsx (Server Component)
  ├─ requireRole(['admin','seo_manager'])
  ├─ 讀 site_settings.analytics → ga4PropertyId / gscSiteUrl
  ├─ 未設定 → 渲染引導卡片，結束
  ├─ ranges.ts 依 range 算出本期 / 上期日期
  ├─ <Suspense> 區塊 A ── ga4.ts ─→ GA4 Data API
  └─ <Suspense> 區塊 B ── gsc.ts ─→ Search Console API
                            └─ insights.ts 篩優化機會
```

兩個區塊各自 Suspense、獨立串流、獨立失敗。

### 認證

`google-auth-library` 的 `GoogleAuth`，credentials 由 `GOOGLE_SERVICE_ACCOUNT_JSON`
解碼取得。Scopes：

- `https://www.googleapis.com/auth/analytics.readonly`
- `https://www.googleapis.com/auth/webmasters.readonly`

模組層級單例，token 由函式庫自動快取與更新。

### API 呼叫

| 來源 | 端點 |
| --- | --- |
| GA4 | `POST analyticsdata.googleapis.com/v1beta/properties/{id}:runReport` |
| GSC | `POST searchconsole.googleapis.com/webmasters/v3/sites/{siteUrl}/searchAnalytics/query` |

用 `fetch` 直接呼叫 REST，不裝各服務的 client 套件。
確切的 metric / dimension 名稱於實作時對照官方文件確認。

### 快取

每組（來源 × 區間）查詢快取 1 小時，並提供「重新整理」按鈕手動失效。

實作前先讀 `node_modules/next/dist/docs/` 確認本版 Next.js 的 cache API 語意，
不依記憶選用。

## GSC 資料延遲

Search Console 資料有 2–3 天延遲。若直接查「近 7 天」，最後數天會是 0，
看起來像故障。

處理方式：GSC 查詢區間的結束日往前推 3 天（起始日同步位移，維持區間長度一致），
並在區塊 B 標題註明「搜尋數據截至 YYYY/MM/DD」。

因此區塊 A 與區塊 B 的實際日期範圍不同，UI 必須明確標示，避免管理者誤以為
兩區數字應該對得起來。

## 錯誤處理

| 情況 | 行為 |
| --- | --- |
| 未設定 `ga4_property_id` | 區塊 A 顯示引導卡片，附連結至網站設定 |
| 未設定 `gsc_site_url` | 區塊 B 顯示引導卡片，附連結至網站設定 |
| 未設定 `GOOGLE_SERVICE_ACCOUNT_JSON` | 兩區皆顯示「尚未設定服務帳戶金鑰」提示 |
| Google API 回 403 | 該區顯示「服務帳戶尚無此資源的存取權」與補救指引 |
| Google API 其他錯誤 | 該區顯示錯誤訊息與狀態碼，另一區不受影響 |

任何設定狀態下本頁都必須能開啟，不得白屏或拋出未捕捉錯誤。

## 測試

沿用既有 vitest。只測純函式與資料轉換，不打真實 API：

- `ranges.ts`：7/30/90 天區間計算、上期對齊、GSC 延遲位移
- `insights.ts`：優化機會門檻（曝光 100、CTR 1% 的邊界值）
- `config.ts`：新增兩欄位的解析與空值收斂
- `ga4.ts` / `gsc.ts`：以固定 fixture 驗證 API 回應 → 畫面資料的轉換，
  含空結果與缺漏欄位

## 實作範圍

**新增**

- `lib/analytics/google-auth.ts`、`ga4.ts`、`gsc.ts`、`ranges.ts`、`insights.ts`
- `app/admin/(protected)/analytics/` 頁面與元件
- 對應測試

**修改**

- `lib/analytics/config.ts`：擴充兩個欄位
- `app/admin/(protected)/settings/AnalyticsSettingsForm.tsx` 與 `actions.ts`：兩個新欄位
- `lib/admin/nav-config.ts`：新增側欄項目
- `.env.local.example`：新增金鑰鍵名
- `package.json`：新增 `google-auth-library`

**不動**

- `backend/`
- 任何資料庫 schema（新設定值存在既有 `site_settings.analytics` 的 JSON value 內）
