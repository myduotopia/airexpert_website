-- 聯絡頁（V3.08 Eco Green Light）site_settings 種子資料。
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 migrations 套路）。
--
-- 內容與前端 fallback（frontend/src/lib/data/contact-info.ts 的 CONTACT_INFO_DEFAULT）一致，
-- 資料來源參考既有 Footer / 聯絡頁（airexpert.com.tw 南北兩服務中心）。
-- is_public 為 true（聯絡資訊為公開內容，anon 受 RLS 只讀 is_public=true）。
-- 冪等：on conflict (key) do update，可重複執行；會覆寫 value 與 is_public。

insert into site_settings (key, value, is_public) values
  (
    'contact_info',
    '{
      "eyebrow": "聯絡我們 · CONTACT",
      "title": "與超勁賀聯繫",
      "subtitle": "南北兩處服務中心，提供空壓系統諮詢、現場評估與節能改善。歡迎來電或線上留言，我們將盡快與您聯繫。",
      "centers": [
        {
          "name": "北區服務中心 · 勁賀空壓科技",
          "lines": [
            { "label": "免付費", "value": "0800-88-4588", "href": "tel:0800884588" },
            { "label": "電話", "value": "02-2675-9977", "href": "tel:0226759977" },
            { "label": "Email", "value": "Service@airexpert.com.tw", "href": "mailto:Service@airexpert.com.tw" },
            { "label": "地址", "value": "新北市樹林區備內街 136 號 1 樓", "href": null }
          ]
        },
        {
          "name": "南區服務中心 · 超賀空壓科技",
          "lines": [
            { "label": "免付費", "value": "0800-88-4588", "href": "tel:0800884588" },
            { "label": "電話", "value": "07-699-8686", "href": "tel:076998686" },
            { "label": "Email", "value": "support8686@airexpert.com.tw", "href": "mailto:support8686@airexpert.com.tw" },
            { "label": "地址", "value": "高雄市湖內區中山路二段 256 號", "href": null }
          ]
        }
      ]
    }'::jsonb,
    true
  )
on conflict (key) do update
  set value = excluded.value,
      is_public = excluded.is_public;
