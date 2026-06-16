# AirExpert 官網 V2 — 全站 DB 化 + 後台 CMS + AI SEO（Backlog Spec）

> 日期：2026-06-16 ・ 狀態：已核可（brainstorming）
> 範圍：把官網從「MVP 公開站」推進到 V2 —— 全站頁面改 DB 驅動、完整前後台串接、Admin CMS（Auth + CRUD）、AI 輔助 SEO。
> 取代：`docs/superpowers/specs/2026-06-09-airexpert-mvp-roadmap-design.md`（MVP 路線圖，已完成）。

## 1. 目標與成功標準

把已上線的 MVP 公開站，升級為「內容可由非工程人員在後台維護」的網站。

**V2 成功標準：**
- 全站 8 個 nav 大項目的頁面內容都改為**從 Supabase 取得**（含原本靜態的品牌介紹 / 服務項目 / 首頁 / 聯絡資訊）。
- 前端**改用新設計圖**（`airexpert.pen`）重做。
- 一個 `/admin` 後台，具 **admin 權限登入**，可對所有頁面項目（文章內容、圖片）做 **CRUD**。
- 文章型內容（最新消息：新聞快訊 / 新機發表 / ESG 實績）提供 **SEO 功能**：後台可手動設定 Meta，並可串 **AI** 即時生成文章與 SEO 資料。
- 內容由 migration / script **seed 進 Supabase**，前後台完整串接。

## 2. 範圍決策（brainstorming 結論）

| 主題 | 決策 |
|------|------|
| Issue 切分 | **垂直切片**：每個 nav 大項目 = 1 個 issue（新設計前端＋內容入庫＋串接＋後台 CRUD），另加「後台地基」與「SEO/AI」 |
| 現有 open issue | **關閉重建**：#12 #13 #14 #15 #17 關閉，內容併入新結構 |
| 後台架構 | **Next.js `/admin` route group + Supabase Auth**，server actions / route handlers 以 `service_role` 寫入；**不動既有 FastAPI** |
| AI 供應商 | **Gemini API key（Google AI Studio，方案 A）**：一個 server 端 key 即可；`AIProvider` 薄介面預留替換 |
| AI key 來源 | **後台設定優先 ▸ 否則 env**：admin 可在後台貼自己的 Gemini key（加密 at rest，UI 遮罩顯示）；route handler 僅 server 端使用，絕不送瀏覽器 |
| 全站 DB 化 | 品牌 / 服務 / 首頁 / 聯絡資訊一律建表或存 `site_settings`，後台可改 |

**Non-goals（本階段不做）：** 多語系、Email 通知、FastAPI / Cloud Run 部署、前台會員系統、Vertex AI（改用 AI Studio key）。

## 3. 既有狀態

- MVP 已上線（closed #3–#11, #22）：design system、data 層、首頁、商品、品牌、服務、聯絡、內容匯入、基礎 SEO。
- Supabase schema `0001_init_schema.sql` 已套用：`products` `articles` `cases` `events` `photo_albums` `photos` `contact_submissions` `ai_content_drafts`；RLS = anon 只能讀 `published` + 任何人可送聯絡表單。
- 前端：Next.js 16（App Router, TS, Tailwind），`/products` `/brands` `/services` `/contact` `/events` 等路由已存在（簡單版）。
- 舊站內容在 `網站存檔/`（21 區，gitignored，本機），對照 `網站存檔/目錄索引.md`。

## 4. Schema 擴充（新 migration `0002_v2_cms.sql`）

沿用現有 8 張表。**新增：**

| 項目 | 說明 |
|------|------|
| `brands` 表 | 品牌介紹 KAISHAN / DELTECH（slug, name, logo, body_html, images jsonb, seo_*, status） |
| `services` 表 | 服務項目 ×4（slug, title, body_html, images jsonb, sort_order, status） |
| `site_settings`（key → jsonb value） | 首頁 hero / 精選區塊、聯絡資訊（地址/電話/地圖）、全域內容、加密的 AI key |
| `cases` 加欄位 | `seo_title` / `seo_description`（products / articles 已有） |
| `admin_profiles` | 關聯 `auth.users(id)`，`role`（admin），供 RLS 判斷 |
| 新 RLS policy | `authenticated` 且為 admin 者可對所有內容表寫入；可讀 `contact_submissions`；Supabase Storage bucket 規則 |

> 寫入仍可走 `service_role`（server action 端，繞過 RLS）；admin RLS policy 作為縱深防禦。

## 5. 工作切分（垂直切片，共 12 個 issue）

每個 issue 設計成可在獨立 worktree 完成。tab 類 issue 統一含四段：**① 新設計前端（讀 `airexpert.pen`）② 內容入庫（migration/script seed）③ 前後台串接（published 公開讀）④ 後台 CRUD（文章/圖片增刪改）**。

### Phase V2-0 — 地基（先做，擋住所有 admin 部分）
- **後台地基（Admin foundation）** — Supabase Auth（admin 登入）、`/admin` route group + layout shell、`admin_profiles` + admin-role RLS、共用 CRUD 元件（資料表 / 表單）、Supabase Storage 圖片上傳元件與圖片選擇器、`0002_v2_cms.sql` migration。**相依：—**

### Phase V2-1 — 內容 tabs（8 個，地基後可並行）
| Tab | 路由 | 資料表 | seed 來源 |
|-----|------|--------|-----------|
| 首頁 Home | `/` | `site_settings` | `網站存檔/01` |
| 品牌介紹 | `/brands`, `/brands/[slug]` | `brands`（新） | `02`–`03` |
| 商品介紹（6 類） | `/products`, `/products/[slug]` | `products` | `04`–`09` |
| 最新消息（3 類） | `/news`, `/news/[slug]` | `articles` | `10`–`12`（約 55 篇） |
| 服務項目（×4） | `/services/*` | `services`（新） | `13`–`16` |
| 節能實績（空壓/乾燥） | `/cases`, `/cases/[slug]` | `cases` | `17`–`18`（約 50 案） |
| 公司活動（影片+相簿） | `/events` | `events` / `photo_albums` / `photos` | `19`–`20` |
| 聯絡我們 | `/contact` | `site_settings` + `contact_submissions` | `21` |

### Phase V2-2 — SEO + AI（橫跨商品 / 最新消息 / 節能實績）
- **SEO + AI 生成** — 後台每篇文章可手動編輯 Meta（title / description / OG）；串 **Gemini（AI Studio key）**：一鍵生成文章草稿 + 自動填 SEO 欄位，寫入 `ai_content_drafts` 供採用 / 退回；前端動態渲染 metadata。`AIProvider` 薄介面，key 來源＝後台設定 ▸ env。**相依：後台地基、最新消息**

### Phase V2-3 — infra（重建舊 #12 / #17）
- **測試** — vitest + data 層 / admin 單元測試（重建 #17，擴充 admin 寫入路徑）。
- **部署 / 環境 V2** — Vercel 補 env（`SUPABASE_SERVICE_ROLE`、`GEMINI_API_KEY`、Auth redirect URL）、admin 路由保護、重新 cutover 檢查。

## 6. 相依圖

```
後台地基(V2-0) ── 擋住所有 tab 的 admin CRUD
   ├─ 首頁 / 品牌 / 商品 / 最新消息 / 服務 / 節能實績 / 公司活動 / 聯絡（V2-1，可並行）
   │        └─ 最新消息 ─┐
   └────────────────────┴─ SEO + AI 生成(V2-2)
測試 / 部署(V2-3) ── 相依大部分 issue
```

> 每個 tab 的「公開前端 + seed」其實可在後台地基完成前先動工，只有「後台 CRUD」段需等地基；為維持垂直切片完整性，issue 整體相依後台地基，但留言會註明可提前並行的部分。

## 7. 每個 issue 對應的 skills

| 類型 | 主要 skills |
|------|-------------|
| 通用流程 | `worktree` → `superpowers:brainstorming`/`superpowers:writing-plans` → `superpowers:test-driven-development` → `superpowers:verification-before-completion` → `fix-review`/`fix-workflow` → `superpowers:finishing-a-development-branch` |
| 後台地基 | `composition-patterns`、`react-best-practices`、`web-design-guidelines`、`airexpert-design-system` |
| tab 頁面 | `airexpert-design-system`、`composition-patterns`、`react-best-practices`、`web-design-guidelines`、（Pencil MCP 讀 `airexpert.pen`） |
| SEO + AI | `react-best-practices`（metadata API）、`claude-api`（若改 provider 時參考） |
| 測試 | `superpowers:test-driven-development` |
| 部署 | `superpowers:finishing-a-development-branch` |

## 8. 標籤 / 里程碑 / 清理

- 新里程碑：**「V2 — 全站 DB 化 + 後台 CMS + AI SEO」**
- 新標籤：`admin`、`ai-seo`（沿用 `frontend` / `content` / `infra` / `phase-*`）
- **關閉**：#12 #13 #14 #15 #17，於關閉留言指向對應新 issue。

## 9. 備註與風險

- **Pencil MCP**：tab 頁面需重新連上 `pencil` MCP 讀 `airexpert.pen` 的新設計 frame。
- **Next.js 16**：見 `frontend/AGENTS.md`，寫碼前先讀 `node_modules/next/dist/docs/`。
- **AI key 安全**：key 僅 server 端 route handler 使用；存 DB 時加密 at rest，UI 遮罩；客戶可在後台自助替換（方案 A 的關鍵優勢）。
- **內容 seed**：`網站存檔/` 為 gitignored 本機資料，seed 腳本需對照 `目錄索引.md`。
- 每個 issue 各自走 spec → plan → implement 小循環（本文件為 backlog 層級母路線圖）。
