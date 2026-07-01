# 首頁改版：依 wholenewhome 2.pen（issue #97）

**日期**：2026-07-01
**設計來源**：`old_website_data/wholenewhome 2.pen`，frame `gnbJu`「首頁改版全頁示意」（桌面 1440）。
**範圍**：輪播（PainCarousel）以下所有區塊重整＋新增；Nav / Hero 輪播 / Footer 沿用。

## 已確認決定

1. 保留現有全套綠色 tokens；**新增金屬副色**進 Tailwind theme（純新增，不影響其他頁）。
2. brass 暖金屬**克制點綴**；steel/graphite 用於 Cases 深色卡。
3. **標題維持 Inter**（不導入 Archivo）。
4. 新區塊內容先用 mockup 數據寫進 `HOME_DEFAULTS`（CMS 架構保留，之後補真實數據）。
5. 移除 `TechSection`+`CarbonDashboard`、`ProductFeatures`。

## 新增色彩 token（Tailwind theme + globals）

沿用設計檔變數值：

| token | hex | 用途 |
|---|---|---|
| `brass` | `#b9a06a` | 暖金屬點綴（徽章、⚡圖示）|
| `brass-deep` | `#9a8250` | 金屬細線深端、數值強調 |
| `brass-soft` | `#e7dcc4` | 淺金徽章底、chip 底 |
| `steel` | `#9aa7a0` | Cases 深色卡邊框、Products eyebrow |
| `steel-soft` | `#c8d2cc` | 冷金屬淺線 |
| `graphite` | `#2e3b34` | 產品深色帶底（備用）|
| `accent` | `#37b89b` | 薄荷 teal（備用，暫少用）|

其餘既有 token 不動。字體維持 Inter（body/heading）+ JetBrains Mono（eyebrow/數值/日期）。

## 區塊規格（由上到下）

版面共通：內容區左右 gutter 80px（rail 區右側 0、由卡片溢出捲動）；section 間白/淺綠交替；1px `border` 分隔；標題區 eyebrow(mono 12, primary-deep, letterSpacing 1) + title(Inter 32/700 ink) 模式。手機需 responsive（縮 gutter、rail 改可橫向捲動、grid 堆疊）。

### 0. Hero 輪播 — 不動
沿用 `PainCarousel`。

### 1. StatBar（數字會說話）— 修正現有 `StatBar`
- 白底，padding [56,80]，下 1px border，4 欄 space-between。
- 每欄（垂直 gap 12）：
  - **brass 漸層細線**：width 72、height 3、radius 2，linear gradient（`brass-deep #9a8250` 0 → `brass #b9a06a` 0.35 → 透明 1，水平）。
  - **數值**：JetBrains Mono 46/700，`primary-deep #1f6b43`。
  - **label**：Inter 15，`text-muted`。
- 數據（先用 mockup）：`1997 成立年份 · 台灣製造`、`800+ 信賴製造廠`、`35% 平均節能效益`、`12k 年減碳 tCO₂e`。
- 資料：更新 `HOME_DEFAULTS.home_stats`（保留現有 site_settings 結構，加上「brass 細線」為固定視覺、非資料欄位）。

### 2. Cases（客戶實績）— 新增
- 白底，padding [72,80]，下 border，gap 36。
- Head（space-between, 底對齊）：左 eyebrow `CASE STUDIES · 客戶實績` + title `數字會說話：客戶的 before / after`(Inter 32/700) + sub(15, text-muted, width 640)：「平均為客戶減碳約 −36%、年省電費逾 200 萬。以下為模擬數據，實際案例待業主提供。」；右「看更多案例」link(primary-deep + arrow-right)。
- Cards：2 欄 gap 24，每張：
  - 深色**綠灰漸層底**（linear 120°：`#54685c` 0 → `#71877a` 0.24 → `#3a4a42` 0.58 → `#1d2620` 1），radius 18，padding 28，**border `steel #9aa7a0` 1px**，gap 20。
  - top(space-between)：chip（`surface-dark-2 #1f2e24` 底、radius20、產業標籤）＋ badge（`brass-soft #e7dcc4` 底、radius20、減碳%）。
  - bars：導入前/導入後兩組水平長條（before/after 對比）。
  - footer(上 1px `border-dark`)：⚡`zap` icon（`brass #b9a06a`）＋「年省電費 320 萬」(white 15/600)。
  - 兩張：**半導體大廠**（年省 320 萬）、**食品飲料廠**（年省 180 萬）。模擬數據。
- 資料：新 `HOME_DEFAULTS.home_cases`（陣列，每筆：industry、reductionPct、beforeLabel/beforeVal、afterLabel/afterVal、savingText）。

### 3. Products（產品帶）— 修正現有 `ProductShowcase`
- **深色 `ink #16201a` 底**，padding [72,0,72,80]，gap 30。
- ProdHead(space-between)：左 eyebrow `PRODUCT SYSTEMS · 產品系列`(**steel #9aa7a0**) + title `完整節能氣源系統，一個窗口整合`(white 32/700)；右 Arrows：左圓鈕(透明白、brass 邊)、右圓鈕(**brass 底**、深色 chevron)。（箭頭視覺為主；桌面 rail 可捲動，MVP 箭頭可先不接互動或做基本捲動。）
- Rail：橫向 6 張卡（width 460，白底 radius16 border）：img 區(h345、白底、圖片 fit、padding16) + content(padding[18,20,22,20]、上 border)：name(Inter 19/600 ink) + desc(14 text-muted) + 「查看系列」link(primary-deep+arrow)。點擊導 `/products?category=<name>`。
- 6 分類 + tagline：變頻空壓機「永磁變頻螺旋，7.5–600 HP 完整涵蓋」、變頻真空泵「乾式與微油變頻，穩定深真空」、變頻鼓風機「氣懸浮／磁懸浮離心式」、離心式空壓機「300–4500 kW 大流量需求」、冷凍式乾燥機「相變儲能，穩定露點控制」、吸附式乾燥機「雙塔吸附，達 −70°C 低露點」。
- 資料：`HOME_DEFAULTS.home_products`（沿用既有分類卡結構，補 tagline；圖片用 `public/categories/*`，缺圖以佔位）。

### 4. News（最新消息）— 修正現有 `NewsTeaser`
- 白底，padding [72,0,72,80]，下 border，gap 30。
- NewsHead(space-between)：eyebrow `NEWS · 最新消息` + title `永續動態與技術觀點`；右 Arrows（右鈕 brass 底）。
- Rail：橫向卡（width 360，白底 radius16 border）：img(h200 fill) + content(padding20 gap12)：meta(cat primary-deep 12/600 · dot · date mono 12 text-muted) + title(Inter 18/600 ink, 兩行)。
- **資料續接** `getPublishedArticles()`（取最新數篇），映射 cat/date/title/cover。無文章時沿用現有 graceful degradation。

### 5. Service（服務流程）— 新增（取代 ProductFeatures）
- `surface-muted #f1f6f1` 底，padding [72,80]，下 border，gap 48。
- Head(置中 gap12)：eyebrow `SERVICES · 一站式服務` + slogan `氣壓的事，交給勁賀`(Inter 36/800) + sub(16 text-muted)：「設備買了之後，安裝、施工、定期保養到維修，全部我們負責。」
- Timeline：5 步驟橫排 space-between，每步（垂直 gap16、置中）：
  - **connector**：左右 2px **brass `#b9a06a`** 水平線 + 中央 46×46 badge（圓、`ink` 底；最後兩步 badge 底改 brass）；首步左線、末步右線 opacity 0。
  - icon 圈：50×50、`#5fbf8626` 底、圓，內 lucide icon(24, `primary #2f8f5c`)。
  - 標題(Inter 17/700 ink, 置中)。
  - chip(`brass-soft #e7dcc4` 底 radius20)：mono 12/700 ink。
  - 5 步：`clipboard-list` 諮詢・節能評估「免費現場勘查」／`cpu` 選型・節能技術「降耗 15~20%」／`hard-hat` 機房規劃・安裝施工「ISO 8573-1」／`calendar-check` 定期保養「定期巡檢」／`headset` 維修支援「24h 到廠」。
- BracketRow(靠右)：520 寬、上 2px brass border、置中 `heart-handshake` icon(primary-deep) +「一次成交永續服務」(primary-deep 15/600)。
- 資料：`HOME_DEFAULTS.home_service`（步驟陣列：icon、title、chip）。

### 6. Contact（與我們保持聯繫）— 修正現有 `SocialFollow`
- 白底，padding [72,80]，下 border，gap 40。
- Head(置中)：eyebrow `FOLLOW US · 追蹤我們` + title `與我們保持聯繫`(Inter 34/800) + desc(16)：「關注勁賀・超賀空壓官方帳號，掌握最新消息，或透過 LINE 與專人即時諮詢。」
- Cards：2 欄 gap 24，每張（`surface-muted` 底 radius18 border padding32 gap24）：
  - h：region(mono 12 primary-deep) + company(Inter 24/700 ink)。
  - contacts（gap12，每列 icon+文字）：免付費電話、市話、地址、email。
  - btns：LINE(`#06C755` 底、白字)、FB(`#1877F2` 底、白字)，radius12。
  - 北區：勁賀空壓科技／0800-88-4588／02-2675-9977／新北市樹林區備內街 136 號 1 樓／Service@airexpert.com.tw。
  - 南區：超賀空壓科技／0800-88-4588／07-699-8686／高雄市湖內區中山路二段 256 號／support8686@airexpert.com.tw。
- 資料：更新 `HOME_DEFAULTS.home_social`（補電話/地址/email 欄位）。

### 7. Footer — 沿用現有。

## 實作方式

- **色彩 token**：在 Tailwind theme（issue #3 的 tokens 檔）+ `globals.css` 加上 brass*/steel*/graphite/accent；元件一律用 token class，不硬編 hex。
- **page.tsx**：更新 section 順序為「輪播 → StatBar → Cases → Products → News → Service → Contact」；移除 TechSection、ProductFeatures 的 import 與 render。
- **元件**：
  - 修正：`StatBar`、`ProductShowcase`（→ 深色 rail）、`NewsTeaser`（→ rail）、`SocialFollow`（→ 補欄位）。
  - 新增：`CasesSection`、`ServiceProcess`。
  - 移除 render（保留檔案）：`TechSection`、`CarbonDashboard`、`ProductFeatures`。
- **資料層**：`@/lib/data/home-keys.ts` 加 `home_cases`、`home_service` key；`@/lib/data/home.ts` 的 `HOME_DEFAULTS` 補對應預設；`getHomeContent()` 並行讀取新增 key（沿用 `mergeShape` fallback）。Products/News 續用既有資料來源。
- **RWD**：桌面 1440 為準；手機縮 gutter、rail 可橫向捲動、多欄 grid 堆疊、Timeline 改直式或可捲動。

## 不做（YAGNI）

- 不導入 Archivo 字體；不改其他頁。
- 不做 rail 的完整輪播互動（箭頭先做基本捲動或視覺，之後再強化）。
- 新區塊的後台編輯表單本次不做（先靠 HOME_DEFAULTS；site_settings key 預留）。
- 客戶實績為模擬數據，待業主提供真實案例。

## 測試

- 既有 home 相關單元測試（mergeShape / defaults 型別）需隨新 key 更新且通過。
- `format:check` / `eslint` / `tsc` / `vitest` / `next build` 全綠。
