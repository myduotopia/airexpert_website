# 品牌介紹 — issue #7 (no Pencil frame; design from the design system)

Two static editorial brand pages. Content below is the REAL copy extracted from the old site
(`網站存檔/`). Build per `airexpert-design-system` SKILL.md (tokens, fonts, section rhythm,
lucide-react icons). Renders between the existing shell Header/Footer. These are static
(hardcode the content in the page/components — no data layer needed).

Routes: `/brands/kaishan` and `/brands/deltech`. (A tiny `/brands` index linking both is optional/nice.)

## Page pattern (both)
Header band (eyebrow mono `BRAND · 品牌介紹`, brand name as H1 Inter ~42/700 ink, one-line tagline) →
alternating white / surface-muted content sections (per design system) → closing CTA banner
(dark, `預約專人談話` → /contact). Use icon chips / cards / stat blocks consistent with the home page.
Images: tinted placeholder blocks with TODO (real brand imagery later). lucide icons for any glyphs.

## `/brands/kaishan` — KAISHAN 開山
Tagline: 世界頂級的技術研發能力。

- **美國研發中心傾力製作**: 研發團隊在湯炎博士帶領下，按北美研發中心完成的模型設計提供參數設計，上海研發中心進行圖紙設計，衢州技術中心開展工藝設計的分工，開發出大量擁有自主知識產權、世界領先的高新技術產品。據點：美國西雅圖北美研發中心（Jersey North America Development Center）、美國工廠 Alabama Baldwin（阿拉巴馬州）。
- **湯炎 博士**（人物卡）: 全球為數不多最頂尖的螺旋式壓縮機專家之一，海外二十餘年領導數家世界著名壓縮機公司的膨脹發電站、天然氣、冷媒及空氣壓縮機產品開發，擁有多項美國專利。發明的 T、α、Y 型線應用於多家世界知名壓縮機公司產品，約佔每年全球螺旋式產品 15% 左右。
- **世界頂級加工/檢測設備**（清單，可做成 icon list 或 2-col）：1. 日本三井 MHU630A 加工中心 2. 德國 KAPP 線上檢測轉子磨床 3. 英國 HOLROYD 數控螺旋式轉子磨床 4. 德國 HERMEL 五軸加工中心 5. 義大利進口落地式鏜銑加工中心 6. 德國 TRUMPF 柔性鈑金加工系統 7. 瑞士 KLINGELNBERG 轉子動態測量儀。
- **開山永磁變頻螺旋式空壓機 — 技術優勢**（3 卡片）：
  1. 螺旋主機能效：主機軸承與 SKF 共同開發專用軸承，軸承數量達 9 個（業內其他品牌一般僅 6 個），確保壽命與性能。
  2. 高效永磁同步馬達：採特種稀土永磁材料，調節範圍更寬、效率更高；內置油冷卻全封閉結構（IP65），耐熱達 180°C（較同類 120°C 提升 50%）；轉子稀土永磁化、功率因數接近 1、調速誤差 1/30000。
  3. 永磁變頻控制：專利弱磁控制 + 壓力控制 + 永磁馬達開環控制，適應惡劣環境；無需轉子轉角位置感測器；母線電壓利用率 >93%；PID 控制 + 恆功控制技術，提供穩定供氣壓力。

## `/brands/deltech` — DELTECH
Tagline: 來自 SPX FLOW 的相變節能乾燥技術。

- **品牌介紹**: SPX FLOW 總部位於美國北卡羅來納州夏洛特市，是全球領先供應商，提供高度工程化的流體組件、製程設備、統包系統工程及相關售後備件與服務；服務食品飲料、能源電力、通用工業三大市場，年銷售額超過 20 億美金，在全球超過 35 個國家設分支機構、150 多個國家有銷售辦事處。
- **Deltech PCM 相變節能乾燥機**: 利用相變材料（PCM）的潛熱儲能特性，可大幅降低冷媒壓縮機運轉時間，讓冷凍式乾燥機不必持續運轉。適用 20~3000 馬力的空壓機。
- **獨一無二的相變式儲能技術**（要點）：應用 PCM（已註冊專利）；採用內含 PCM 的不鏽鋼釺焊板式換熱器；依壓縮空氣熱負荷調控冷媒壓縮機啟停。
- **最佳效能**（stat 強調）：節能高達 **99%**；最短時間內回收投資成本。
- **無耗氣自動排水裝置 (No Loss Drain)**：靜電容量感測器；排放冷卻水時無壓縮空氣耗損；操作異常時自動轉為定時模式。
- **除油效果接近無油 (Oil free)**（PCM28.1J 或更大機型）：內置冷聚結（Cold Coalescing）過濾器；濾除油氣效率高達 **99.8%**。

## Notes
- Static content — hardcode in the route/components; no `@/lib/data`.
- Consider a shared `BrandPage`/section components under `src/components/brands/` since the two pages share structure.
- KAISHAN/DELTECH are real third-party brands — use the copy above as-is; don't invent specs.
- lucide-react for icons. Tokens only. Responsive. End each page with the dark CTA → /contact.
