---
name: airexpert-design-system
description: Use when building or styling any AirExpert frontend page or component (Next.js + Tailwind) — the chosen visual direction is "V3.08 Eco Green Light". Provides exact design tokens (colors, fonts, spacing, radius), the Nav and Footer specs, and section-layout conventions to follow so pages stay consistent.
---

# AirExpert Design System — V3.08 "Eco Green Light"

The approved visual direction for the public site. Source of truth = the Pencil file
`airexpert.pen`, frames **`hFFr2` Home / `eMCvR` Product / `rhx08` News** (open in Pencil
for visual reference; the design has many other exploratory frames — ignore them).

Light, editorial, eco/green-accented. White base with light-green alternating sections,
thin green-grey borders, a dark green near-black footer + CTA banner.

> **Code source of truth:** the Tailwind theme tokens implemented in issue #3 must match the
> values below. When code and this file disagree, fix whichever drifted — keep them in sync.

## Color tokens

| Hex | Role | Suggested token |
|-----|------|-----------------|
| `#FFFFFF` | Base background, nav bg, text-on-dark | `base` / `surface` |
| `#F1F6F1` | Alternating section background (light green-grey) | `surface-muted` |
| `#DCE8DD` | Borders / section dividers (on light) | `border` |
| `#16201A` | Dark bg (footer, CTA banner) **and** primary text on light | `ink` / `surface-dark` |
| `#1F2E24` | Badge / chip bg on dark | `surface-dark-2` |
| `#2A3A2F` | Divider on dark | `border-dark` |
| `#2F8F5C` | **Primary green accent** — CTA buttons, highlight bg | `primary` |
| `#1F6B43` | Logo mark green on light | `primary-deep` |
| `#5FBF86` | Logo / accent green on dark | `primary-soft` |
| `#5C6B61` | Secondary text on light (inactive nav, sub-labels) | `text-muted` |
| `#8FA697` | Muted text on dark (footer) | `text-on-dark-muted` |

## Typography

- **Inter** — primary UI + body + headings. Load via `next/font`.
- **JetBrains Mono** — mono accents only: EN wordmark, ISO/eyebrow labels, copyright. Often `letterSpacing` ~0.5.

Observed scale (px) / weight: brand CN 17/700 · nav 14/500 · footer links 13 (header 600, item normal) · lang 13/600 · CTA 14/600 · mono eyebrow 10 · copyright 11 · micro EN 8. Heading sizes live in the Hero frames — read from Pencil per page.

## Layout conventions

- Desktop content width **1440**. Two distinct horizontal gutters: **content sections = 80px**, **Nav & Footer bars = 48px**. (Don't treat gutter as one global value.)
- Responsive: frames are desktop-only — choose breakpoints yourself (Tailwind defaults are fine), shrink gutters on mobile, collapse nav to a menu, stack footer columns.
- Sections stack vertically and **alternate background**: `#FFFFFF` ↔ `#F1F6F1`.
- Section separators: **1px `#DCE8DD`** top/bottom borders (on light); **`#2A3A2F`** on dark.
- CTA banner before footer: dark `#16201A`.
- Radius: pill button **24**, chip/badge **20**.
- Build responsive — the Pencil frames are desktop (1440); collapse nav to a menu and stack columns on mobile.

## Nav (`UrJQe` "DB2 Nav")

White bar, `border-bottom: 1px #DCE8DD`, padding `18px / 48px`, `justify-between`, `items-center`.
- **Brand** (left, gap 12): green logo mark (40×26) + wordmark — CN `超勁賀空壓科技` Inter 17/700 `#16201A`; EN `JIN HE & CHAO HE AIR COMPRESSOR` JetBrains Mono 8 `#5C6B61`.
- **Nav items** (center, gap 30): `首頁 · 產品系列 · 解決方案 · 技術文獻 · 最新消息 · 關於` — Inter 14/500; active `#16201A`, rest `#5C6B61`.
- **Right** (gap 18): language switch `中 / EN` (Inter 13; active `#16201A` 600, slash `#DCE8DD`) + CTA pill `預約談話` — bg `#2F8F5C`, text `#FFFFFF` 14/600, radius 24, padding `10/18`.

> Nav IA is the design's simplified menu; map these labels to actual routes during #3/page issues (e.g. 產品系列→/products, 最新消息→/news, 關於→about). Don't invent extra nav items.

## Footer (`LBdKX` "DB2 Footer")

Dark `#16201A`, vertical.
- **Top** (padding `56/48/40/48`, `justify-between`): Brand column (width 360) — soft-green logo `#5FBF86` + wordmark; description `#8FA697` 13/normal lineHeight 1.6, copy: `以節能氣源系統推動永續製造。導入 ISO 50001 能源管理，協助產業邁向淨零目標。`; ISO badge (bg `#1F2E24`, radius 20, padding `6/12`) lucide `leaf` icon + `ISO 50001 · NET-ZERO READY` JetBrains Mono 10 `#5FBF86`. Then 3 link columns (gap 64): header `#FFFFFF` 13/600, items `#8FA697` 13/normal, gap 12:
  - **產品**: 空氣壓縮機 · 真空泵浦 · 鼓風機 · 乾燥機
  - **公司**: 關於我們 · 最新消息 · 技術文獻 · 聯絡我們
  - **永續**: ESG 報告 · 能源管理 · 碳足跡 · 循環經濟
- **Bottom bar** (padding `20/48`, `border-top: 1px #2A3A2F`, `justify-between`): copyright `© 2026 JIN HE & CHAO HE AIR COMPRESSOR CO., LTD.` JetBrains Mono 11 `#8FA697`; legal `隱私權政策 · 使用條款 · ISO 9001 / ISO 50001` Inter 12 `#8FA697`.

## Home section rhythm (`hFFr2`)

`Nav → Hero (white) → HeroImage (#F1F6F1, h460) → Stats (white, ±borders) → Partners (#F1F6F1) → Overview (white) → Tech (#F1F6F1, ±borders) → NewsTeaser (white) → CTABanner (#16201A) → Footer`. Use as the template for white/muted alternation and the closing dark CTA.

## Implementing

- Define the color + font tokens once in the Tailwind theme (issue #3) using the names above; reference tokens in components, never hardcode hex twice.
- Fonts: `next/font` for Inter + JetBrains Mono; expose as CSS vars.
- Build **Nav and Footer as shared components** in the layout shell (#3); pages compose sections between them.
- To read exact per-section values (Hero copy, spacing, heading font sizes not listed here), open the frame in Pencil via the IDs above — values are inline literals (this file has no Pencil variables).
- **Logo asset**: the green logo mark is artwork, not in this doc — obtain the SVG from the client/Pencil (`o2OvdI` "AirExpert Mark") before building Nav/Footer. The `leaf` badge icon needs `lucide-react`.

## Common mistakes

- Hardcoding hex values instead of theme tokens → drift. Always use tokens.
- Using `#16201A` as "black" — it's a dark green; don't substitute `#000`.
- Forgetting JetBrains Mono for eyebrow/label/copyright text (it's a deliberate accent).
- Shipping desktop-only — frames are 1440; you must add responsive behaviour.
- Pulling in another exploratory frame (Dark Tech / Light Minimal / V3.09 …) — only V3.08 is approved.
