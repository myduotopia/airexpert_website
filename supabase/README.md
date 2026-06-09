# Supabase

專案：`jgqswfjdehtpesfdlmhe`（region: Tokyo / ap-northeast）
URL：`https://jgqswfjdehtpesfdlmhe.supabase.co`

## 套用 migration

**方式 A — Dashboard（最快）**
Supabase Dashboard → SQL Editor → 貼上 `migrations/0001_init_schema.sql` → Run。

**方式 B — Supabase CLI**
```bash
brew install supabase/tap/supabase
supabase link --project-ref jgqswfjdehtpesfdlmhe
supabase db push
```

## Schema 一覽

| 資料表 | 對應舊站 | 備註 |
|--------|----------|------|
| `products` | 商品介紹 | category: 變頻空壓機 / 真空泵 / 鼓風機 / 離心式 / 冷凍式乾燥 / 吸附式乾燥 |
| `articles` | 最新消息 | category: 新聞快訊 / 新機發表 / ESG實績 |
| `cases` | 節能實績 | category: 空壓機 / 乾燥機；含 region/industry/metrics |
| `events` | 公司活動 | 交機實錄 YouTube 影片 |
| `photo_albums` / `photos` | 活動照片 | 相簿 + 照片 |
| `contact_submissions` | 聯絡我們 | 表單送出 |
| `ai_content_drafts` | （新）後台 AI | SEO 文案 / 內容生成草稿 |

## RLS 原則

- 後端用 **service_role key** → 繞過 RLS，可全權讀寫。
- 前端用 **anon key** → 只能讀 `status = 'published'` 的內容，可送出 `contact_submissions`。
- 後台管理員登入（auth）導入後，再為 `authenticated` 加寫入 policy。
