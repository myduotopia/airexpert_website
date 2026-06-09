# AirExpert 官網 MVP — 重建路線圖（Roadmap Spec）

> 日期：2026-06-09 ・ 狀態：已核可（brainstorming）
> 範圍：把公開官網 MVP 的工作拆成可獨立執行的 GitHub issues。

## 1. 目標與成功標準

把 超勁賀空壓（AirExpert）舊站重建為現代化的公開官網並上線。

**MVP 成功標準：**
- 公開官網部署在 Vercel，網域指向 airexpert.com.tw。
- 核心頁面到位：首頁、商品介紹（列表＋詳情）、品牌介紹、服務項目、聯絡我們。
- 商品資料來自 Supabase；聯絡表單寫入 Supabase。
- 基本 SEO（每頁 metadata、sitemap、robots、OG）。

## 2. 範圍決策（brainstorming 結論）

| 主題 | 決策 |
|------|------|
| 階段目標 | **先上線公開官網 MVP**（後台 CMS / AI 內容生成往後排） |
| 視覺設計 | **照 `airexpert.pen`（Pencil 設計稿）實作**（實作時需重新連上 Pencil MCP 讀取） |
| 架構 | **純 Next.js + Supabase，不動 FastAPI 後端**；前端用 anon key 直讀已發佈內容，表單直接 insert |
| 內容完整度 | **核心內容先上，其餘後補** |
| 聯絡表單 | **只存 Supabase，不做通知**（`.insert()` 不可 chain `.select()`，anon 無讀權限） |
| 服務項目／品牌介紹 | 做成**靜態編輯頁**（內容少且穩定，不建表） |

**Non-goals（本階段不做）：** 後台 CMS、登入/Auth、AI 內容生成（Vertex AI）、FastAPI / Cloud Run 部署、Email 通知、多語系。

## 3. 既有狀態

- Supabase schema 已套用（`supabase/migrations/0001_init_schema.sql`）：8 張表 + RLS 已驗證。
- 前端：Next.js 16（App Router, TS, Tailwind）目前仍是預設 scaffold。
- 前端 client 已接好：`frontend/src/lib/supabase.ts`（lazy init, anon key）。
- 舊站內容在 `網站存檔/`（21 區，gitignored，本機）。

## 4. 工作切分（框架 C：地基 → 垂直頁面 → 內容/上線）

每個 issue 設計成可在獨立 worktree 完成、彼此衝突最小。

### Phase 0 — 地基（擋住所有頁面；#1、#2 可並行）
- **#1 版型外殼與設計系統** — 照 Pencil 定 Tailwind design tokens（色/字/間距）、Header＋全站導覽、Footer、全域樣式、字型、favicon、RWD。相依：—
- **#2 Supabase 資料存取層與型別** — 依 schema 產 TS 型別 + typed fetch helpers（`getPublishedProducts`、`getProductBySlug`…），移除預設首頁。相依：—

### Phase 1 — 核心頁面（地基後各自獨立，適合 worktree 並行）
- **#3 首頁 Home** — 照 Pencil 刻首頁，帶出精選商品/區塊。相依：#1, #2
- **#4 商品介紹（列表＋詳情）** — `/products`（6 分類）+ `/products/[slug]`，讀 `products`。相依：#1, #2
- **#5 品牌介紹 KAISHAN／DELTECH** — 2 個靜態編輯頁。相依：#1
- **#6 服務項目 ×4** — 節能方案／技術／機房規劃／減碳行動，靜態頁。相依：#1
- **#7 聯絡我們＋表單** — 聯絡頁 + 表單 insert 進 `contact_submissions`（`return=minimal`）。相依：#1, #2

### Phase 2 — 內容與上線
- **#8 核心內容匯入** — 把 `網站存檔/` 商品資料匯入 Supabase；品牌/服務靜態內容填入。相依：#2, #4
- **#9 SEO 基礎** — 每頁 metadata、`sitemap.xml`、`robots.txt`、Open Graph。相依：#3–#7
- **#10 部署 Vercel ＋ 網域** — Vercel 專案、env（`NEXT_PUBLIC_SUPABASE_*`）、preview、cutover 到 airexpert.com.tw。相依：#3–#9

### Phase 3 — 後補（post-MVP）
- **#11 最新消息 news** — `/news` 列表+詳情，`articles` 表。
- **#12 節能實績 cases** — `/cases`，`cases` 表。
- **#13 公司活動** — `events` 影片 + `photos` 相簿。

## 5. 每個 issue 對應的 skills

| Issue | 主要 skills |
|-------|-------------|
| 通用流程 | `worktree`（隔離開發）→ 開工前 `superpowers:brainstorming`（若需細設計）/ `superpowers:writing-plans` → `superpowers:test-driven-development` → 完成前 `superpowers:verification-before-completion` → `fix-review` / `fix-workflow`（CI）→ `superpowers:finishing-a-development-branch` |
| #1 版型/設計系統 | `web-design-guidelines`、`composition-patterns`、`react-best-practices`、（Pencil MCP 讀稿） |
| #2 資料層/型別 | `react-best-practices`（data fetching）、`superpowers:test-driven-development` |
| #3–#7 頁面 | `composition-patterns`、`react-best-practices`、`web-design-guidelines`、（Pencil MCP）、`react-view-transitions`（選用） |
| #8 內容匯入 | 一般腳本（無特定 skill）；`superpowers:verification-before-completion` |
| #9 SEO | `react-best-practices`（metadata API） |
| #10 部署 | `superpowers:finishing-a-development-branch` |
| #11–#13 後補 | 同 #3–#7 |

## 6. 備註與風險

- **Pencil MCP**：設計實作類 issue（#1、#3–#7）需重新連上 `pencil` MCP 才能讀 `airexpert.pen`。
- **Next.js 16**：見 `frontend/AGENTS.md`——此版本與訓練資料可能有差異，寫碼前先讀 `node_modules/next/dist/docs/`。
- **內容匯入**：`網站存檔/` 為 gitignored 本機資料；匯入腳本與資料映射需對照 `目錄索引.md`。
- 每個 issue 將各自走 spec → plan → implement 的小循環（本文件為 backlog 層級的母路線圖）。
