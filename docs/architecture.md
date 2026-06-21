# 系統架構 — 現況 vs 目標

> 本文件釐清「**目前實際在跑的架構**」與「**README 規劃中的目標架構**」之間的差異，
> 避免把規劃當成現況。最後更新：2026-06-22。

相關文件：[README.md](../README.md)（目標架構表）、[docs/deploy.md](deploy.md)（部署）、
[supabase/README.md](../supabase/README.md)（DB schema）。

---

## TL;DR

- **現在是 Next.js (Vercel) + Supabase 單體**：CRUD 與 AI 生成都在 Next.js server 端完成。
- **GCP / FastAPI / Vertex AI 目前完全沒用到**。`backend/` 只是骨架（僅一個 health router），
  未部署、前端也沒有任何呼叫後端的地方。
- AI 文章/SEO 生成已上線，但走「**Next.js server 直連 Gemini API**」，不是經過 FastAPI，也不是 Vertex。

---

## 目前實際架構（現況）

```
                ┌─────────────────────────────────────────────┐
   瀏覽器  ───► │  Next.js 16 (App Router)  —  Vercel          │
                │                                              │
                │  公開頁  src/lib/data/*      （讀）           │
                │  後台    admin/**/actions.ts （Server Action 寫）│
                │  AI      src/lib/ai/gemini.ts（server-only）  │
                └───────┬───────────────────────────┬─────────┘
                        │                           │
              直接讀寫（4 個 client）          server 直連
                        ▼                           ▼
                ┌───────────────┐           ┌───────────────┐
                │   Supabase    │           │  Gemini API   │
                │  (Tokyo)      │           │ (Google AI)   │
                │ Postgres+RLS  │           └───────────────┘
                │ Auth / Storage│
                └───────────────┘
```

### 1. 前端 — Next.js 16 on Vercel
- App Router、TypeScript、Tailwind；程式在 [frontend/src/app/](../frontend/src/app/)。
- 部署在 Vercel，**Root Directory = `frontend`**（見 [docs/deploy.md](deploy.md)）。
- Next.js 16 特性：用 **Proxy**（前身 Middleware）而非 middleware —
  [frontend/src/proxy.ts](../frontend/src/proxy.ts) 只在 `/admin/*` 刷新 Supabase session cookie。

### 2. 資料 / CRUD — 前端直接打 Supabase（**無中間後端**）
- 沒有經過任何自建 API server，前端直接連 Supabase。共 4 個 client：
  | client | 角色 | 用途 |
  |--------|------|------|
  | [supabase-browser.ts](../frontend/src/lib/supabase-browser.ts) | anon | 瀏覽器端（登入等） |
  | [supabase-server.ts](../frontend/src/lib/supabase-server.ts) | anon + cookie | server component / action 以使用者身分讀寫（受 RLS 約束） |
  | [supabase-admin.ts](../frontend/src/lib/supabase-admin.ts) | **service_role** | server-only，繞過 RLS 的後台/系統操作 |
  | proxy 內 createServerClient | anon | 只做 token 刷新 |
- **公開頁讀取**：[src/lib/data/](../frontend/src/lib/data/)（articles / brands / products / cases /
  events / services / home / site / contact-info），快取 tag 集中在
  [data/cache.ts](../frontend/src/lib/data/cache.ts)，Server Action 以 `revalidateTag` 失效。
- **後台 CRUD**：Server Actions（[admin/(protected)/*/actions.ts](../frontend/src/app/admin/)），全部直寫 Supabase。
  例：聯絡表單直接寫入 `contact_submissions`。

### 3. 後台授權
- 安全檢查貼近資料源：`(protected)/layout` 呼叫
  [admin/auth.ts](../frontend/src/lib/admin/auth.ts) 的 `requireAdmin()` →
  `auth.getUser()` + Postgres `is_admin()` RPC（RLS 強制）。
- Proxy 只做 optimistic 的 cookie 刷新，**不**當作授權閘門。

### 4. AI 生成 — Next.js server 直連 Gemini
- [src/lib/ai/gemini.ts](../frontend/src/lib/ai/gemini.ts)，標記 `server-only`，key 絕不送瀏覽器。
- key 來源：後台設定 `site_settings.ai_config`（AES 加密，見 [crypto.ts](../frontend/src/lib/crypto.ts)）▸ `GEMINI_API_KEY` env。
- 後台 AI 文章/SEO 生成頁：[admin/(protected)/news/ai/](../frontend/src/app/admin/)；草稿存 `ai_content_drafts`。
- **不經 FastAPI、不是 Vertex AI**，是直接 HTTP 呼叫 Google AI Studio 的 Gemini。

### 5. 資料庫（Supabase, Tokyo）
- Schema：[supabase/migrations/](../supabase/migrations/)
  （`0001_init_schema.sql`、`0002_v2_cms.sql`）。
- 主要 table：`products` `articles` `cases` `events` `photo_albums` `photos`
  `contact_submissions` `ai_content_drafts` `admin_profiles` `brands` `services` `site_settings`。
- Storage：public bucket `media`（公開讀、admin 寫，policy 用 `is_admin()`）。
- 全表啟用 RLS。

---

## 目標架構（README 規劃，尚未落地）

| 層 | 技術 | 部署 | 現況 |
|----|------|------|------|
| 前端公開官網 | Next.js (App Router) | Vercel | ✅ 已上線 |
| 後端 + AI 服務 | Python FastAPI | GCP Cloud Run + Vertex AI | ❌ 未啟用（見下） |
| 資料 / Auth / 儲存 | Supabase | Tokyo | ✅ 已上線 |

### `backend/` 目前狀態
- 只有骨架：[backend/app/main.py](../backend/app/main.py) + 單一
  [routers/health.py](../backend/app/routers/health.py)，無任何業務邏輯。
- **未部署**到 Cloud Run；前端程式中**沒有任何**呼叫後端的地方
  （`localhost:8000` / `BACKEND_URL` / `cloud.run` 皆 0 筆）。
- 文件已註明：「後端 FastAPI 不部署於此（MVP 純 Next.js + Supabase）。未來 AI 服務再上 GCP Cloud Run。」

### 何時才會用到 GCP？
當 AI 服務出現以下需求時，再把它從 Next.js 搬到 FastAPI on Cloud Run：
- 需要重運算 / 長時間任務（超出 Vercel serverless 執行時間限制）。
- 需要與 Vertex AI 同雲低延遲，或用到 Vertex 專屬模型/功能。
- 需要獨立於前端的 API、排程、或非 web 的 worker。

在那之前，「Next.js server 直連 Gemini」這個輕量方案就足夠。

---

## 一句話總結

> 現在是 **Next.js (Vercel) + Supabase** 的單體；CRUD 與 AI 都在 Next.js server 端完成，
> **GCP / FastAPI / Vertex 都還沒啟用**，留待 AI 服務需要獨立、重運算或同雲低延遲時再搬上去。
</content>
</invoke>
