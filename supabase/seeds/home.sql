-- 首頁（V3.08 Eco Green Light）site_settings 種子資料。
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 migrations 套路）。
--
-- 內容與前端 fallback（frontend/src/lib/data/home.ts 的 HOME_DEFAULTS）一致。
-- 改版後首頁實際 render 的 7 個區段（依顯示順序）：
--   home_carousel 輪播圖 → home_stats 數據列 → home_tech 永續節能
--   → home_news 最新消息(卡片自動取已發佈文章) → home_products 產品系列
--   → home_features 產品特色 → home_social 追蹤我們
-- is_public 一律 true（首頁文案為公開內容，anon 受 RLS 只讀 is_public=true）。
-- 冪等：on conflict (key) do update，可重複執行；會覆寫 value 與 is_public。
--
-- 註：前台未 seed 時即以 HOME_DEFAULTS 顯示，故此 seed 非必要，僅供需要把預設
--     內容寫入 DB（例如要在後台微調前先落地）時使用。

insert into site_settings (key, value, is_public) values
  (
    'home_carousel',
    '{
      "slides": [
        { "image_url": "/hero/pain-01-cost.png",     "alt": "壓縮機房中能源被漩渦吸走，象徵電費成本", "category": "電費過高",   "headline": "空壓機最貴的不是買，是用",   "tagline": "設備不貴，電費才是成本黑洞" },
        { "image_url": "/hero/pain-02-pressure.png", "alt": "壓力錶指針劇烈擺動，產線亮起警示燈",   "category": "壓力不穩",   "headline": "氣壓忽高忽低，產線最怕這個", "tagline": "壓力不穩，良率就在流失" },
        { "image_url": "/hero/pain-03-downtime.png", "alt": "工廠紅色警示燈亮起，機台停擺、員工等待", "category": "故障停機",   "headline": "一停機，全廠都在等",         "tagline": "停機一分鐘，損失持續放大" },
        { "image_url": "/hero/pain-04-repair.png",   "alt": "拆開維修中的空壓機，零件與工具散落",   "category": "維修頻繁",   "headline": "一直修，一直花錢",           "tagline": "維修不是成本，是無底洞" },
        { "image_url": "/hero/pain-05-mismatch.png", "alt": "雜亂的壓縮空氣管路多處漏氣",           "category": "系統不匹配", "headline": "買了機器，卻不適合現場",     "tagline": "選錯規格，比沒買還貴" }
      ]
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
    'home_products',
    '{
      "eyebrow": "PRODUCT SYSTEMS · 產品系列",
      "title": "完整節能氣源系統",
      "description": "從空壓、真空、鼓風到乾燥，單一窗口整合最適合廠務設備的節能配置。",
      "categories": [
        { "image_url": "/categories/cat-air-compressor.jpg",    "name": "變頻空壓機",   "desc": "永磁變頻螺旋、無油與微油機種，7.5–600 HP 完整涵蓋。" },
        { "image_url": "/categories/cat-vacuum-pump.jpg",        "name": "變頻真空泵",   "desc": "乾式與微油變頻真空系統，穩定深真空表現。" },
        { "image_url": "/categories/cat-blower.jpg",             "name": "變頻鼓風機",   "desc": "氣懸浮／磁懸浮離心式，污水與氣力輸送應用。" },
        { "image_url": "/categories/cat-centrifugal.jpg",        "name": "離心式空壓機", "desc": "大型離心機種，300–4500 kW 高流量需求。" },
        { "image_url": "/categories/cat-refrigerated-dryer.jpg", "name": "冷凍式乾燥機", "desc": "相變儲能與冷凍式乾燥，穩定露點控制。" },
        { "image_url": "/categories/cat-adsorption-dryer.jpg",   "name": "吸附式乾燥機", "desc": "壓縮熱回收與雙塔吸附，達 −70°C 低露點。" }
      ]
    }'::jsonb,
    true
  ),
  (
    'home_features',
    '{
      "eyebrow": "KEY FEATURES · 產品特色",
      "title": "為潔淨與節能而生",
      "features": [
        { "icon": "zap", "title": "高效節能", "desc": "永磁變頻隨需供氣，平均節能達 35%。" },
        { "icon": "shield-check", "title": "Class 0 無油", "desc": "符合 ISO 8573-1 最高潔淨等級，零油氣污染。" },
        { "icon": "activity", "title": "智慧監控", "desc": "感測聯網，遠端即時掌握壓力、流量與耗能。" },
        { "icon": "thermometer", "title": "穩定溫控", "desc": "多級冷卻設計，確保長時間穩定輸出。" },
        { "icon": "volume-x", "title": "低噪音運轉", "desc": "隔音機罩設計，運轉噪音低至 67 dB(A)。" },
        { "icon": "leaf", "title": "永續減碳", "desc": "導入 ISO 50001 能源管理，落實淨零承諾。" }
      ]
    }'::jsonb,
    true
  ),
  (
    'home_social',
    '{
      "eyebrow": "FOLLOW US · 追蹤我們",
      "title": "與我們保持聯繫",
      "description": "關注勁賀・超賀空壓官方帳號，掌握最新消息，或透過 LINE 與專人即時諮詢。",
      "companies": [
        { "region": "北區服務中心", "name": "勁賀空壓科技", "line": "https://page.line.me/189njhgy?openQrModal=true", "fb": "https://www.facebook.com/kaitain0120/" },
        { "region": "南區服務中心", "name": "超賀空壓科技", "line": "https://page.line.me/427hiucm?openQrModal=true", "fb": "https://www.facebook.com/people/%E8%B6%85%E8%B3%80%E7%A9%BA%E5%A3%93%E7%A7%91%E6%8A%80%E6%9C%89%E9%99%90%E5%85%AC%E5%8F%B8/100079963752126/" }
      ]
    }'::jsonb,
    true
  )
on conflict (key) do update
  set value = excluded.value,
      is_public = excluded.is_public;
