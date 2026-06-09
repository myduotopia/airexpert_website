# Products — issue #6 (Pencil frame `eMCvR` = detail page; list page from design system)

Two routes. Renders between the existing shell Header/Footer. Follow `airexpert-design-system`
SKILL.md for tokens. The product **list** has no Pencil design — build it from the design system
(reuse the home "Overview" card style). The product **detail** follows frame `eMCvR` below.
Wire to the data layer `@/lib/data` (`getPublishedProducts`, `getProductsByCategory`,
`getProductBySlug`) and types in `@/lib/types`. No product data exists yet (import is #8), so
use the designed sample content as fallback / for visual reference; render real data when present.

The 6 categories (from schema `products.category`): 變頻空壓機 / 變頻真空泵 / 變頻鼓風機 / 離心式空壓機 / 冷凍式乾燥機 / 吸附式乾燥機 (the home Overview groups them as 空氣壓縮機 / 真空泵浦 / 鼓風機 / 乾燥機 — use the schema's category strings for data, display grouping is flexible).

## Route `/products` — list (design-system based, NO Pencil frame)
- Page hero/header band (white, padding ~64/80): eyebrow mono `PRODUCT SYSTEMS · 產品系列`, title Inter ~38/700 `ink`, short subtitle `text-muted`.
- Category filter row: pill chips (like Applications pills — bg `surface-muted`, border, radius 24, `ink` 14/500; active = `primary-deep` text or filled). One chip per category + an "全部" chip.
- Product grid (gap 20; 3-up desktop → 2 → 1): reuse a `ProductCard` (white, border, radius 14): image top (~16:9, next/image), category tag (mono, small), name Inter 16/600 `ink`, summary `text-muted` 13, "查看詳情 →" link. Card links to `/products/[slug]`.
- Data: `getPublishedProducts()` / `getProductsByCategory(category)`. Filtering can be client-side over the fetched list or via route query — your call; keep it simple. Empty state: a friendly "內容建置中" message (no data yet).

## Route `/products/[slug]` — detail (frame `eMCvR`)
Use Next 16 dynamic route. Fetch via `getProductBySlug(slug)`; if null → `notFound()`. Map fields:
name→H1, category→breadcrumb + eyebrow, brand→(optional), summary/body_html→description, `spec` jsonb→spec table, `images`→hero image + thumbnails, seo_title/description→`generateMetadata`.

Sections top→bottom:

### Breadcrumb — bg surface-muted, padding 14/80, bottom border, mono 12
`首頁 / 產品系列 / {category} / {name}` — separators `/` in `border` color, last crumb `primary-deep`, rest `text-muted`. Links where sensible (首頁→/, 產品系列→/products).

### Hero — bg white, padding 56/80/64/80, 2-col gap 56 (stack on mobile)
- **Left** (vertical gap 20): eyebrow mono 12 `primary-deep` ls1 (e.g. `無油螺旋 · OIL-FREE SCREW`); H1 Inter 42/700 `ink` lh1.15 (product name); SKU line mono 13 `primary-deep` (`SKU · …`); description Inter 15 `text-muted` lh1.65; a **metrics box** (bordered, radius 12, 2×2 grid of cells each white, 1px internal dividers, padding 18, small label + value) — pull 4 key spec highlights; buttons: primary `申請報價` (bg primary, radius 26) → `/contact`, secondary `下載技術手冊 PDF` + download icon (white, border) → PDF (placeholder href).
- **Right** (width ~560, vertical gap 16): main product image (radius 16, 1px border, ~460 tall, next/image) + thumbnail row (3 thumbs, radius 10, ~88 tall; first selected = 2px `primary` border, rest 1px `border`). Static thumbs ok for MVP.

### SpecSection — bg surface-muted, padding 64/80, top+bottom border, vertical gap 24
- Heading: eyebrow mono `SPECIFICATIONS · 技術規格`, title Inter 30/700 `完整機種規格比較`.
- **Spec table** (white, radius 12, 1px border, clip): header row bg `primary-deep`, white cells (first col label Inter 13/700, model cols mono 13/700); body rows alternate white / `surface-muted`, top border each row; first col `ink` Inter 13/600, value cells `text-muted` mono 13. Build per skill's table guidance (frame→row→cell). For MVP, render the product's `spec` jsonb as rows (key in first col, value in a single value col). The designed 4-model comparison (AX-S9/22·/55·/110 with 馬達功率/運轉壓力/FAD/噪音/空氣品質/出口接頭/淨重/保固) is the visual reference — a single-value column is acceptable when the product has one spec set.

### Features — bg white, padding 64/80, vertical gap 24
- Heading: eyebrow `KEY FEATURES · 核心優勢`, title Inter 30/700 `為潔淨而生`-style.
- Feature card grid (gap 16; ~3-up → responsive): each card white, border, radius 14, padding 20, gap 14 — icon chip (42×42 bg `#E3F1E8` radius ~21, lucide icon primary 21px) + title Inter 15/600 + desc Inter 12 `text-muted` lh1.55. Designed set (use as fallback/sample): zap·高效節能 / shield-check·Class 0 無油認證 / activity·智慧監控 / thermometer·穩定溫控 / volume-x·低噪音運轉.

### Applications — bg white, padding 56/80, top border, vertical gap 20
- Title Inter 24/700 `應用領域`. Pill row (gap 12, wrap): each pill bg `surface-muted`, border, radius 24, padding 12/18 — lucide `check` (primary 14) + label Inter 14/500 `ink`. Sample: 半導體製程 / 生醫藥廠 / 食品飲料 / 汽車零組件 / 精密機械.

### Related — bg surface-muted, padding 56/80/64/80, top border, vertical gap 24
- Heading: eyebrow `RELATED · 相關產品`, title Inter 30/700 `完整氣源系統搭配`.
- 4 related `ProductCard`s (grid gap 20 → responsive): image (~180 tall), name Inter 15/600, SKU mono 11 `text-muted`, "查看 →". Data: other published products (e.g. exclude current); sample names AX-RD/AX-V8/AX-FB/AX-IQ.

## Notes
- Reuse a single `ProductCard` component for list + related.
- Icons: match the shell/home decision (inline SVG vs lucide-react) — be consistent; flag if you add lucide-react.
- `generateMetadata({params})` from `getProductBySlug` (seo_title/seo_description) — and use React `cache()`-wrapped fetch (already in the data layer) so metadata + page don't double-fetch.
- Responsive: hero stacks, tables scroll horizontally on mobile (`overflow-x-auto`), grids collapse.
- Empty/no-data: render sample/fallback gracefully; never crash on missing fields (all data-layer types allow nulls).
