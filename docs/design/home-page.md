# Home page spec — issue #5 (Pencil frame `hFFr2`, V3.08 Eco Green Light)

Build the home page **body** that renders between the existing shell `Header` and `Footer`
(already in the root layout — do NOT add nav/footer). Follow `airexpert-design-system` SKILL.md
for all tokens. Content below is the approved marketing copy — use it verbatim (static is fine
for MVP; wire to data later in #8/#11). Desktop sections are 1440 wide, 80px horizontal padding,
alternating white / `surface-muted`. All section headings Inter; eyebrows/numbers JetBrains Mono.

## Section order & content

### 1. Hero — bg white, padding 88/80/72/80, vertical, centered, gap 26
- Eyebrow pill (bg `surface-muted`, border, radius 20, padding 6/14): lucide `leaf` icon (primary `#2F8F5C`, 13px) + mono 12px `#1F6B43` letterSpacing .5 — text `創立於 1997 · 台灣製造`
- H1 Inter 60/700 `ink`, lineHeight 1.12, centered, max-width ~960: `節能氣源，邁向淨零的製造未來`
- Sub Inter 18 `text-muted` lineHeight 1.6 centered max-width ~680: `無油空壓、真空與乾燥系統結合智慧能源管理，協助台灣製造業降低能耗、減少碳排，落實 ESG 永續承諾。`
- Buttons (gap 12): primary CTA `探索產品系列` + arrow-right (bg `primary-deep` for AA, white, radius 26, padding 14/26) → `/products`; secondary `預約專人談話` (white bg, border, `ink`, radius 26) → `/contact`

### 2. HeroImage — bg surface-muted, padding 0/80, height ~460
- A rounded (radius 16) image filling the band, 1px border. Use a relevant industrial/clean-energy photo (next/image). Placeholder ok; note for later asset.

### 3. Stats — bg white, padding 44/80, top+bottom 1px border, justify space-between
Four stat blocks (number JetBrains Mono 42/700 `primary-deep`; label Inter 13 `text-muted`):
- `1997` / `成立年份 · 台灣製造`
- `800+` / `信賴製造廠`
- `35%` / `平均節能效益`
- `12k` / `年減碳 tCO₂e`

### 4. Partners — bg surface-muted, padding 48/80, vertical, centered, gap 24
- Label mono 12 `text-muted` letterSpacing 1: `台灣 800+ 製造廠信賴 · TRUSTED ACROSS TAIWAN`
- Logo row (gap 56, centered) Inter 22/700 in muted green `#C3D6C8`: `TSMC` `UMC` `ASE` `Delta` `FoxConn` `Merida` (text wordmarks, not real logos)

### 5. Overview (product systems) — bg white, padding 80, vertical, gap 32
- Heading block (centered, max-width ~720): eyebrow mono 12 `primary-deep` ls1 `PRODUCT SYSTEMS · 產品系列`; title Inter 38/700 `ink` `完整節能氣源系統，單一窗口整合`
- **4-card grid** (gap 20; responsive: 4-up desktop → 2-up tablet → 1-up mobile). Each card: white bg, 1px border, radius 14, padding 26, vertical gap 16 — icon chip (46×46, bg `#E3F1E8`, radius ~23, centered lucide icon primary 22px) + title Inter 18/600 `ink` + desc Inter 13 `text-muted` lh1.6:
  - icon `wind` · `空氣壓縮機` · `無油與噴油螺旋、離心式機種，7.5–250 kW。`
  - icon `gauge` · `真空泵浦` · `乾式與水環式真空系統，穩定深真空表現。`
  - icon `fan` · `鼓風機` · `三葉羅茨與渦輪式，污水與氣力輸送應用。`
  - icon `droplets` · `乾燥機` · `冷凍式與吸附式乾燥，達 ISO 8573 露點。`
- **AirSense highlight** panel (bg surface-muted, radius 18, 1px border, padding 36, horizontal gap 32; stack on mobile): left col — tag pill (bg primary, white, radius 20) lucide `cloud` + mono 11/700 `AIRSENSE CLOUD`; title Inter 30/700 `ink` `智慧監控雲端平台`; desc Inter 15 `text-muted` `即時監測壓力、流量與耗能，結合 ISO 50001 能源管理框架，量化每一度節能成效。` Right col (width ~420, 3 stat cards gap 16; white bg, border, radius 12, padding 20): `−35%`/`能耗` · `24/7`/`遠端監控` · `−60%`/`停機` (numbers mono 26/700 primary-deep).

### 6. Tech (sustainability) — bg surface-muted, padding 80, top+bottom border, horizontal gap 48 (stack on mobile)
- **Left: carbon dashboard card** (white, radius 16, border, padding 24): header row — `年度碳排放趨勢` Inter 15/600 + `tCO₂e · 2019–2025` mono 11 muted; live pill (bg `#E3F1E8`, radius 20) trending-down icon + `−42%` primary-deep. Big number `8,420` mono 38/700 ink + `tCO₂e / yr` mono 14/700 primary-deep. **Bar chart** (height ~170, 7 bars, justify space-between, bars radius top 6): heights descending 150,138,120,112,96,80,66 — first 6 bars `#C3D6C8`, last (`25`) `primary`; x-labels `19 20 21 22 23 24 25` mono 11 muted. (Build with flex bars per skill's chart guidance — no absolute positioning.)
- **Right col** (width ~520, vertical gap 20): eyebrow mono 12 primary-deep ls1 `SUSTAINABILITY · 永續節能`; title Inter 34/700 ink `以數據實踐淨零承諾`; desc Inter 15 text-muted `從用氣基線量測到持續優化，導入 ISO 50001 能源管理系統，讓每一度電與每一公斤碳排都被看見、被改善。`; then a 3-row feature list (each row: 40×40 white icon chip w/ border + small title/desc, bottom 1px divider between rows). Reasonable feature rows (icons + short copy) e.g. 用氣基線量測 / ISO 50001 導入 / 持續優化追蹤 — infer concise copy consistent with the theme.

### 7. NewsTeaser — bg white, padding 80, vertical, gap 28
- Head row (justify space-between, end-aligned): left — eyebrow mono 12 primary-deep ls1 `NEWS · 最新消息` + title Inter 34/700 ink `永續動態與技術觀點`; right — `查看全部` Inter 14/600 primary-deep + arrow-right → `/news`
- **3 news cards** (grid gap 20, 3-up → 1-up mobile). Build a reusable `NewsCard` component: image top (radius, ~16:9), category tag, date (mono), title Inter ~16/600 ink, excerpt text-muted. Cards:
  - `2026.05.18` · `永續報告` · `邁向淨零：壓縮空氣節能白皮書` · `導入 ISO 50001 與智慧監控，平均降低 35% 壓縮空氣能耗。`
  - `2026.04.30` · `技術專文` · `熱回收系統：把壓縮熱變成可用能源` · `透過熱交換回收壓縮過程廢熱，提升整廠能源效率。`
  - `2026.04.12` · `企業動態` · `超勁賀獲頒能源管理績優企業` · `以系統化能源管理與減碳成效，獲產業永續肯定。`
  - (Cards link to `/news` for now. Images: use placeholder/next-image; real images later.)

### 8. CTABanner — bg `surface-dark` #16201A, padding 64/80, vertical, centered, gap 18
- Title Inter 36/700 white centered max-width ~760: `準備好讓氣源系統更節能了嗎？`
- Desc Inter 16 `text-on-dark-muted` centered max-width ~620: `預約能源診斷，我們將協助評估節能與減碳潛力，量身規劃最合適的氣源配置。`
- CTA `預約能源診斷` + arrow-right (bg primary, white, radius 26, padding 15/28) → `/contact`

## Notes
- Icons: use inline SVGs (lucide paths) consistent with the shell's approach, OR introduce `lucide-react` if you prefer — decide once and note it (the shell used inline SVG). Many icons here, so `lucide-react` may be justified; flag the decision.
- Make every section a small component under `src/components/home/` (Hero, StatBar, Partners, ProductOverview, AirSenseHighlight, CarbonDashboard, NewsTeaser, CtaBanner) composed in `app/page.tsx`. Reuse tokens; no hardcoded hex twice.
- Responsive: collapse multi-column grids to 1–2 columns; reduce hero font sizes on mobile.
- Static content for MVP; structure cleanly so news/products can wire to the data layer (`@/lib/data`) later.
