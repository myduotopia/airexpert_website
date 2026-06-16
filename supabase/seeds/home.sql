-- 首頁（V3.08 Eco Green Light）site_settings 種子資料。
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 migrations 套路）。
--
-- 內容與前端 fallback（frontend/src/lib/data/home.ts 的 HOME_DEFAULTS）一致。
-- is_public 一律 true（首頁文案為公開內容，anon 受 RLS 只讀 is_public=true）。
-- 冪等：on conflict (key) do update，可重複執行；會覆寫 value 與 is_public。

insert into site_settings (key, value, is_public) values
  (
    'home_hero',
    '{
      "eyebrow": "創立於 1997 · 台灣製造",
      "title": "節能氣源，邁向淨零的製造未來",
      "subtitle": "無油空壓、真空與乾燥系統結合智慧能源管理，協助台灣製造業降低能耗、減少碳排，落實 ESG 永續承諾。",
      "cta_primary": { "label": "探索產品系列", "href": "/products" },
      "cta_secondary": { "label": "預約專人談話", "href": "/contact" }
    }'::jsonb,
    true
  ),
  (
    'home_stats',
    '{
      "items": [
        { "value": "1997", "label": "成立年份 · 台灣製造" },
        { "value": "800+", "label": "信賴製造廠" },
        { "value": "35%", "label": "平均節能效益" },
        { "value": "12k", "label": "年減碳 tCO₂e" }
      ]
    }'::jsonb,
    true
  ),
  (
    'home_partners',
    '{
      "label": "台灣 800+ 製造廠信賴 · TRUSTED ACROSS TAIWAN",
      "logos": ["TSMC", "UMC", "ASE", "Delta", "FoxConn", "Merida"]
    }'::jsonb,
    true
  ),
  (
    'home_overview',
    '{
      "eyebrow": "PRODUCT SYSTEMS · 產品系列",
      "title": "完整節能氣源系統，單一窗口整合",
      "products": [
        { "icon": "wind", "title": "空氣壓縮機", "description": "無油與噴油螺旋、離心式機種，7.5–250 kW。" },
        { "icon": "gauge", "title": "真空泵浦", "description": "乾式與水環式真空系統，穩定深真空表現。" },
        { "icon": "fan", "title": "鼓風機", "description": "三葉羅茨與渦輪式，污水與氣力輸送應用。" },
        { "icon": "droplets", "title": "乾燥機", "description": "冷凍式與吸附式乾燥，達 ISO 8573 露點。" }
      ],
      "airsense": {
        "badge": "AIRSENSE CLOUD",
        "title": "智慧監控雲端平台",
        "description": "即時監測壓力、流量與耗能，結合 ISO 50001 能源管理框架，量化每一度節能成效。",
        "stats": [
          { "value": "−35%", "label": "能耗" },
          { "value": "24/7", "label": "遠端監控" },
          { "value": "−60%", "label": "停機" }
        ]
      }
    }'::jsonb,
    true
  ),
  (
    'home_tech',
    '{
      "eyebrow": "SUSTAINABILITY · 永續節能",
      "title": "以數據實踐淨零承諾",
      "description": "從用氣基線量測到持續優化，導入 ISO 50001 能源管理系統，讓每一度電與每一公斤碳排都被看見、被改善。",
      "features": [
        { "icon": "ruler", "title": "用氣基線量測", "description": "盤點全廠用氣量與耗能，建立可比較的減碳基準。" },
        { "icon": "badge-check", "title": "ISO 50001 導入", "description": "依國際能源管理框架建置制度與績效指標。" },
        { "icon": "line-chart", "title": "持續優化追蹤", "description": "雲端數據持續監測，量化每一階段節能成效。" }
      ]
    }'::jsonb,
    true
  ),
  (
    'home_news',
    '{
      "eyebrow": "NEWS · 最新消息",
      "title": "永續動態與技術觀點"
    }'::jsonb,
    true
  ),
  (
    'home_cta',
    '{
      "title": "準備好讓氣源系統更節能了嗎？",
      "subtitle": "預約能源診斷，我們將協助評估節能與減碳潛力，量身規劃最合適的氣源配置。",
      "cta": { "label": "預約能源診斷", "href": "/contact" }
    }'::jsonb,
    true
  )
on conflict (key) do update
  set value = excluded.value,
      is_public = excluded.is_public;
