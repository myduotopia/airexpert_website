# 後台流量分析：Google 端設定操作手冊

目的：讓後台 `/admin/analytics` 能讀取 GA4 與 Search Console 數據。
本文件所有步驟需人工在 Google 各服務完成，做完才能開始寫程式。

對應設計文件：[2026-07-22-admin-analytics-dashboard-design.md](superpowers/specs/2026-07-22-admin-analytics-dashboard-design.md)

完成後你會拿到三個值：

| 值 | 存放位置 |
| --- | --- |
| GA4 資源 ID（純數字） | 後台 ▸ 網站設定 |
| Search Console 資源網址 | 後台 ▸ 網站設定 |
| service account JSON 金鑰（base64） | `.env.local` + Vercel 環境變數 |

> 前兩個欄位的後台 UI 尚未實作，先把值記在手邊，實作完成後再填入。

---

## 步驟 1 — 建立 GCP 專案

目前 gcloud 底下的 5 個專案都屬於其他產品（duotopia、mai-today 等），
airexpert 還沒有自己的專案。分開建立比較乾淨，日後 Cloud Run / Vertex AI 也用同一個。

先確認 gcloud 用的是正確帳號：

```bash
gcloud auth list
```

`cbtzeng@gmail.com` 應為 ACTIVE。若不是：

```bash
gcloud config set account cbtzeng@gmail.com
```

建立專案（專案 ID 全 Google 唯一，若被佔用就換一個）：

```bash
gcloud projects create airexpert-web --name="AirExpert Website"
gcloud config set project airexpert-web
```

> **計費**：本案用到的兩個 API 都是免費配額，正常情況不需要綁定計費帳戶。
> 若步驟 2 啟用 API 時出現要求啟用計費的錯誤，到
> [Console ▸ 計費](https://console.cloud.google.com/billing) 綁一個帳戶再重試。
> 只要不動用付費服務就不會產生費用。

---

## 步驟 2 — 啟用兩個 API

```bash
gcloud services enable analyticsdata.googleapis.com searchconsole.googleapis.com
```

確認：

```bash
gcloud services list --enabled | grep -E "analyticsdata|searchconsole"
```

兩行都要出現。

---

## 步驟 3 — 建立 service account 並產生金鑰

```bash
gcloud iam service-accounts create airexpert-analytics \
  --display-name="AirExpert Analytics Reader"
```

取得它的 email（後面兩步都要用，請複製下來）：

```bash
gcloud iam service-accounts list
```

格式會是 `airexpert-analytics@airexpert-web.iam.gserviceaccount.com`。

產生 JSON 金鑰到**專案外**的位置（避免手滑 commit 進 git）：

```bash
gcloud iam service-accounts keys create ~/airexpert-analytics-key.json \
  --iam-account=airexpert-analytics@airexpert-web.iam.gserviceaccount.com
```

> ⚠️ 這個檔案是機密。**不要**放進專案資料夾、不要傳到 Slack / email。
> 步驟 7 轉成 base64 填進環境變數後，本機這份可以留著備份，但要放在 repo 之外。

**這個 service account 不需要任何 GCP IAM 角色。** 它的存取權完全來自
接下來兩步在 GA4 和 Search Console 裡的授權——這也是為什麼它外洩的風險有限：
它只能讀你指定的那一個 GA4 資源和那一個網站的數據，不能寫、不能碰 GCP 其他資源。

---

## 步驟 4 — 授權存取 GA4

1. 開 [Google Analytics](https://analytics.google.com/) → 左下角**管理**（齒輪）
2. 確認上方選的是 airexpert 的**資源（Property）**
3. **資源**欄 → **資源存取權管理**
4. 右上角 **+** → **新增使用者**
5. 電子郵件填步驟 3 的 service account email
6. **取消勾選**「通知新使用者」（寄不到 service account）
7. 角色選 **檢視者（Viewer）**
8. 新增

> 一定要加在**資源層級**，不是帳戶層級。加在帳戶層級雖然通常也會繼承下來，
> 但權限範圍比需要的大。

### 順便取得 GA4 資源 ID

同一個管理頁 → **資源**欄 → **資源設定**（或 **資源詳情**），
右上角會看到 **資源 ID**，是一串純數字（例如 `483920175`）。

**記下來** → 這是設計文件裡的 `ga4_property_id`。

> 注意：這跟你已經填在後台的 `G-XXXXXXXX`（評估 ID / Measurement ID）**是不同的東西**。
> `G-` 開頭那個是用來「送」資料的，這串數字是用來「讀」資料的，兩個都要。

---

## 步驟 5 — 授權存取 Search Console

1. 開 [Search Console](https://search.google.com/search-console)
2. 左上角切到 airexpert 的資源
3. 左側最下方 **設定** → **使用者和權限**
4. 右上 **新增使用者**
5. 電子郵件填同一個 service account email
6. 權限選 **受限**
7. 新增

> 若之後 API 回 403，把權限改成**完整**再試一次。「受限」理論上足以讀取
> 成效資料，但不同資源的設定情況偶有差異。

### 順便確認 Search Console 資源網址

看左上角資源選單裡它的顯示方式，決定要填哪個格式：

| 資源類型 | 顯示樣子 | 要填的值 |
| --- | --- | --- |
| 網域（Domain） | `airexpert.com.tw` | `sc-domain:airexpert.com.tw` |
| 網址前置字元（URL prefix） | `https://airexpert.com.tw/` | `https://airexpert.com.tw/`（含結尾斜線，完全照抄） |

**記下來** → 這是設計文件裡的 `gsc_site_url`。

> 格式錯了 API 會回 403（而不是好懂的錯誤訊息），是最常見的卡關點。
> 網址前置字元類型務必一字不差，包含 `https://` 和結尾的 `/`。

---

## 步驟 6 — 驗證權限確實生效

直接用 service account 的身分換一個 access token，打一次真實 API。
這一步能在寫任何程式之前就確認「權限到底通不通」，強烈建議不要跳過。

```bash
# 用金鑰檔啟用 service account 身分
gcloud auth activate-service-account \
  --key-file=~/airexpert-analytics-key.json

# 取一個 access token
TOKEN=$(gcloud auth print-access-token)
```

測 GA4（把 `483920175` 換成你的資源 ID）：

```bash
curl -s -X POST \
  "https://analyticsdata.googleapis.com/v1beta/properties/483920175:runReport" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dateRanges":[{"startDate":"7daysAgo","endDate":"today"}],"metrics":[{"name":"activeUsers"}]}'
```

測 Search Console（把 site URL 換成你的，且需 **URL-encode**：
`sc-domain:airexpert.com.tw` → `sc-domain%3Aairexpert.com.tw`）：

```bash
curl -s -X POST \
  "https://searchconsole.googleapis.com/webmasters/v3/sites/sc-domain%3Aairexpert.com.tw/searchAnalytics/query" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startDate":"2026-06-01","endDate":"2026-07-15","dimensions":["query"],"rowLimit":5}'
```

**成功**：回傳含 `rows` 或 `rowCount` 的 JSON（數字多少不重要，有回資料就對了）。

**常見錯誤**：

| 回應 | 原因 |
| --- | --- |
| `403 PERMISSION_DENIED` | 步驟 4 / 5 的授權沒生效，或 site URL 格式錯 |
| `403 SERVICE_DISABLED` | 步驟 2 的 API 沒啟用（訊息會指出是哪一個） |
| `404` | 資源 ID 或 site URL 打錯 |
| 空的 `{}` | 權限沒問題，只是該區間真的沒有資料 |

測完把 gcloud 身分切回自己（重要，否則後續 gcloud 指令都會以 service account 執行）：

```bash
gcloud config set account cbtzeng@gmail.com
```

---

## 步驟 7 — 金鑰轉 base64 填入環境變數

```bash
base64 < ~/airexpert-analytics-key.json | tr -d '\n' | pbcopy
```

（`tr -d '\n'` 去掉換行，`pbcopy` 複製到剪貼簿。）

**本機**：貼進 `frontend/.env.local`

```
GOOGLE_SERVICE_ACCOUNT_JSON=<貼上>
```

**Vercel**：Project ▸ Settings ▸ Environment Variables ▸ Add New

- Key：`GOOGLE_SERVICE_ACCOUNT_JSON`
- Value：同一串
- Environments：Production / Preview / Development 全勾

> `.env.local` 已在 gitignore 內。`.env.local.example` 會在實作時補上這個鍵名
> （只有鍵名、不含值）。

---

## 完成檢查表

- [ ] GCP 專案已建立
- [ ] `analyticsdata` 與 `searchconsole` 兩個 API 已啟用
- [ ] service account 已建立，JSON 金鑰存在 repo 之外
- [ ] service account 已加入 GA4 資源，角色為檢視者
- [ ] service account 已加入 Search Console，權限為受限
- [ ] 步驟 6 兩個 curl 都成功回傳資料
- [ ] `GOOGLE_SERVICE_ACCOUNT_JSON` 已填入 `.env.local` 與 Vercel
- [ ] **GA4 資源 ID 已記下**：`________________`
- [ ] **GSC 資源網址已記下**：`________________`

最後兩項在後台設定頁實作完成後填入 網站設定 ▸ 分析與索引。
