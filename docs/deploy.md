# 部署指南 — Vercel + 網域（issue #12）

前端是 Next.js 16，部署到 **Vercel**；monorepo 結構（`frontend/` + `backend/`），所以
Vercel 專案的 **Root Directory 必須設成 `frontend`**。後端 / Supabase 不需在此部署。

採「**先預覽、確認無誤、再導網域**」流程 —— 先用 Vercel 給的 `*.vercel.app` 網址驗證，
全部 OK 後才把 `airexpert.com.tw` 指過去。

---

## A. 建立 Vercel 專案

1. 到 https://vercel.com → **Add New… → Project** → 連結 GitHub repo `myduotopia/airexpert_website`。
2. **Root Directory** 設為 **`frontend`**（重要，否則 build 會失敗）。
3. Framework 會自動偵測為 Next.js；Build Command / Output 用預設即可（`next build`）。
4. 先**不要**設定 Production 網域，直接 Deploy → 取得 `https://<專案名>.vercel.app` 預覽網址。

## B. 環境變數（Vercel → Project → Settings → Environment Variables）

| 變數 | 值 | 環境 |
|------|-----|------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://jgqswfjdehtpesfdlmhe.supabase.co` | Production + Preview |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 你的 anon key（公開金鑰，可放前端） | Production + Preview |
| `NEXT_PUBLIC_SITE_URL` | 先填 `https://<專案名>.vercel.app`；導網域後改成 `https://airexpert.com.tw` | Production |

> anon key 與本機 `frontend/.env.local` 相同。`NEXT_PUBLIC_SITE_URL` 影響 sitemap / robots /
> canonical / OG 的絕對網址——**網域 cutover 後記得改成正式網域並重新部署**。

設好變數後 **redeploy** 一次讓變數生效。

## C. 用 `*.vercel.app` 驗證（導網域前）

- [ ] 首頁 `/` 正常、區塊與樣式正確
- [ ] `/products` 列出 19 個商品、分類篩選可用；`/products/am3` 等詳情頁有規格表
- [ ] `/brands/kaishan`、`/brands/deltech`、`/services` 及 4 個子頁正常
- [ ] `/contact` 表單送出 → 到 Supabase Dashboard → Table `contact_submissions` 確認有新列
- [ ] `/sitemap.xml`、`/robots.txt` 可開啟，且網址用的是當前站台 URL
- [ ] 手機 RWD（導覽選單、表格橫向捲動）正常
- [ ] 用 https://www.opengraph.xyz/ 之類工具貼預覽網址檢查 OG 卡片

## D. 導入網域 airexpert.com.tw（驗證 OK 後）

1. Vercel → Project → **Settings → Domains** → 加入 `airexpert.com.tw`（及 `www.airexpert.com.tw`，擇一設為主、另一轉址）。
2. 依 Vercel 指示到**網域 DNS 商**設定：
   - 根網域 `airexpert.com.tw`：A record → Vercel 提供的 IP（通常 `76.76.21.21`），或用 DNS 商支援的 ALIAS/ANAME 指向 Vercel。
   - `www`：CNAME → `cname.vercel-dns.com`。
   - （實際值以 Vercel Domains 頁面顯示為準。）
3. 等 DNS 生效 + Vercel 自動簽發 SSL（Let's Encrypt）。
4. 把 `NEXT_PUBLIC_SITE_URL` 改成 `https://airexpert.com.tw` → **redeploy**（讓 sitemap/canonical/OG 用正式網域）。
5. 重跑 C 區的檢查清單（這次用正式網域）。

## E. 上線後 / 待辦

- [ ] OG 圖目前是 `public/og-default.png` 品牌色佔位 —— 換成正式 1200×630 視覺。
- [ ] 商品 / 品牌 / 服務頁圖片仍是 placeholder（真實素材或後續匯入）。
- [ ] Logo 是 placeholder「AE」mark —— 換真實 SVG。
- [ ] 之後到 Google Search Console 提交 `airexpert.com.tw/sitemap.xml`。

## 備註

- 後端 FastAPI **不**部署於此（MVP 純 Next.js + Supabase）。未來 AI 服務再上 GCP Cloud Run。
- CI（`ci-frontend`）已在每個 PR 跑 lint/typecheck/build；Vercel 也會在每次 push 自動建 Preview。
