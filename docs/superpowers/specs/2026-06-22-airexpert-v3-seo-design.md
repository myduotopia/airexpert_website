# AirExpert 官網 V3 — SEO 強化（Backlog Spec）

> 日期：2026-06-22 ・ 狀態：已核可（brainstorming）
> 範圍：在 V2（全站 DB 化 + 後台 CMS + 基礎 AI SEO）之上，補齊**完整 SEO 管理能力**：每篇內容可編輯完整 meta、AI 修文與一鍵填 SEO、SEO 代管角色、聯絡通知（Email/LINE）、首頁/品牌資產設定、技術 SEO（sitemap/301/robots/GA4/GSC）。
> 上承：`docs/superpowers/specs/2026-06-16-airexpert-v2-cms-backlog-design.md`。

## 1. 目標與成功標準

把 V2 的「基礎 SEO（手動 seo_title/description + 新聞 AI 生成）」升級為可由 admin 與 **SEO 代管人員**日常維運的完整 SEO 系統。

**成功標準：**
- 商品介紹 / 最新消息 / 服務項目 / 節能實績 / 公司活動 五區，新增/編輯時皆可設定完整 SEO meta（title / description / canonical / OG title·description·image / slug / JSON-LD schema / noindex / nofollow）。
- 兩個 AI 輔助：①修正錯字/語法、補完內容並輸出乾淨 HTML；②依內文一鍵產生並填入 SEO meta。AI prompt 可在後台 read/update（內建第一版）。
- 後台可建立/停用多個 **SEO 代管帳號**；代管只能編輯 SEO meta，看不到/改不了內文、帳號與部署設定。
- 一個**統一 SEO 總覽頁**跨五區檢視缺漏並快速編輯 meta（admin + 代管皆可進）。
- 聯絡表單送出後寄 **Email** 並發 **LINE** 通知給後台設定的固定收件人。
- 首頁設定操作更清楚，並可設定 **LOGO / favicon**。
- 技術 SEO：sitemap 補全、301 redirect（舊站 .html）、per-page noindex/nofollow、串 GA4 與 Google Search Console。

## 2. 範圍決策（brainstorming 結論）

| 主題 | 決策 |
|------|------|
| Issue 切分 | 母 **Epic + 7 子 issue**（每主題一個，沿用 V2 垂直切片 + phase 標籤） |
| 代管權限 | **只能編輯 SEO meta**（內文/帳號/部署鎖定）。欄位級限制以 **server action + UI gating** 為主，RLS 為縱深防禦 |
| 代管工作區 | 主要走**統一 SEO 總覽頁**；文章編輯頁仍 admin-only（含內文 + AI 修文） |
| SEO meta UI | **內嵌各文章編輯頁 + 統一總覽頁**兩者都做 |
| 通知收件人 | **後台可設定的固定收件人**（email 清單 + 單一 LINE 目標）；非依來源分流 |
| LINE 機制 | LINE Notify 已於 2025 停止 → 改用 **LINE Messaging API**（push 至設定的 user/group/官方帳號） |
| 設定儲存 | AI prompt / 通知設定 / branding 一律存 `site_settings`（沿用 `ai_config` 加密模式），不另建表 |
| 301 redirect | **DB `redirects` 表 + proxy**（Next 16 用 proxy 非 middleware） |

**Non-goals：** 多語系、SEO 自動評分/競品分析、A/B 測試、會員系統、改 AI 供應商（仍 Gemini）。

## 3. 既有狀態（V2 已完成）

- `products` `articles` 有 `seo_title` `seo_description`；`cases` `brands` `services` 於 0002 補上；`photo_albums` 有 `slug`。
- `events` 無 slug/seo（影片清單，無自有 detail 頁）；公司活動的 SEO 主要落在 `photo_albums`（相簿 detail）與 events 清單頁。
- AI：`lib/ai/gemini.ts` 僅 `generateNewsDraft`（依主題生成新聞 + SEO），prompt 硬編碼。
- `admin_profiles.role` 預設 `admin`；`is_admin()` RLS。單一角色。
- 聯絡：表單寫入 `contact_submissions`，後台可檢視；**無 email/LINE**。
- `robots.ts` / `sitemap.ts` 存在但 sitemap 僅含 products + services 動態項。
- 首頁設定頁存在（`site_settings` 多 key）；無 LOGO/favicon 設定。

## 4. Schema 擴充（新 migration `0004_v3_seo.sql`）

| 項目 | 說明 |
|------|------|
| 各內容表加 SEO 欄位 | `products` `articles` `cases` `services` `photo_albums` 補 `canonical_url` `og_title` `og_description` `og_image_url` `schema_jsonld jsonb` `noindex bool` `nofollow bool`（`events` 視需要加同欄位於清單層） |
| `admin_profiles.role` | 擴充值 `seo_manager`；新增 `is_seo_manager()` / 角色判斷 helper；代管可讀內容表、寫入僅限 SEO 欄位（server 層強制） |
| `redirects` 表 | `from_path`（unique）/ `to_path` / `status`(301/302) / `enabled` / `created_at`；proxy 查表做轉址 |
| `site_settings` 新 key | `ai_prompts`（fix_article / fill_seo 兩段，加密非必要）、`contact_notify`（email_recipients[]、line_channel_token_enc、line_target_id、email provider 設定）、`branding`（logo_url / favicon_url）、`analytics`（ga4_id、gsc_verification） |

## 5. 工作切分（母 Epic + 7 子 issue）

> 每個子 issue 為垂直切片，可獨立 worktree；各自走 spec → plan → implement 小循環。labels 沿用 `ai-seo` `admin` `infra` `frontend` `phase-3`，里程碑 **V3 — SEO 強化**。

- **Epic [V3] SEO 強化** — 追蹤下列 7 子 issue。
- **V3-1 SEO 欄位擴充 + 文章內嵌 SEO 編輯**（涵蓋點 1、6）：migration 加完整 SEO 欄位；五區新增/編輯頁內嵌 SEO 區塊；前端動態渲染 metadata（canonical / OG / robots meta / JSON-LD）。相依：—
- **V3-2 AI 修文 + 一鍵填 SEO + Prompt 管理**（點 1-1、1-2）：`gemini.ts` 加修文（→HTML）與一鍵填 SEO 兩函式；後台 Prompt 設定頁 read/update（內建第一版）；按鈕接到五區編輯頁 + SEO 總覽。相依：V3-1
- **V3-3 SEO 代管角色 + 帳號管理頁**（點 3）：`admin_profiles.role` 擴 `seo_manager`；人員管理頁建立/停用多代管帳密（Supabase Auth admin API）；nav/route 角色 gating；代管只能改 SEO meta。相依：—
- **V3-4 統一 SEO 總覽管理頁**（點 6）：跨五區列出 SEO 狀態與缺漏標示、快速編輯 meta；admin + 代管入口。相依：V3-1、V3-3
- **V3-5 聯絡通知 — Email + LINE**（點 2）：表單送出後寄 email + LINE 通知；通知設定頁（收件人清單、LINE channel token 加密、目標 id、email provider）。相依：—
- **V3-6 首頁設定優化 + LOGO/favicon**（點 4）：首頁設定 UI 改善（說明/預覽、處理已隱藏 tab）；LOGO + favicon 上傳（`site_settings.branding`，套 layout/Nav/icon）。相依：—
- **V3-7 技術 SEO — sitemap/301/robots/GA4/GSC**（點 5）：sitemap 補 news·cases·events·services；per-page noindex/nofollow 串 V3-1；`redirects` 表 + proxy 做 301；GA4 注入；GSC 驗證 + sitemap 提交。相依：V3-1

## 6. 相依圖

```
V3-1 SEO 欄位/渲染 ──┬─ V3-2 AI 修文/填 SEO
                     ├─ V3-4 統一 SEO 總覽 ── 也相依 V3-3
                     └─ V3-7 技術 SEO
V3-3 代管角色 ───────┘
V3-5 通知 / V3-6 首頁·branding ── 獨立（無相依）
```

## 7. 建議執行順序（subagents 並行）

- **Wave A（立即並行，無相依）：** V3-1、V3-3、V3-5、V3-6 各一 subagent（四者互不衝突，分屬 schema/角色/通知/branding）。
- **Wave B（待 A）：** V3-2（待 V3-1）、V3-7（待 V3-1）、V3-4（待 V3-1 + V3-3）。
- 遷移編號：V3-1 已合併為 `0004_v3_seo.sql`（origin/main 另有 #62 的 `0003_sort_order.sql`）；V3-3 角色相關 SQL 用新檔 `0005_seo_roles.sql`，避免與 V3-1 共用檔衝突。每個 subagent 用獨立 worktree，orchestrator 驗證後合併（見 `subagent-worktree-workflow` 記憶）。

## 8. 風險

- **欄位級權限**：代管「只能改 SEO 欄位」靠 server action 白名單；RLS 無法欄位級，需確保所有寫入路徑都過白名單。
- **LINE Messaging API**：需官方帳號 + channel access token；推播對象需先取得 user/group id。
- **301 對 SEO 關鍵**：舊站 `.html` URL 對照需完整，否則流量斷鏈。
- **schema_jsonld**：使用者自訂 JSON-LD 需驗證/防 XSS（僅輸出於 `<script type="application/ld+json">`，跳脫處理）。
