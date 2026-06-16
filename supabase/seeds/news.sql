-- 最新消息（News / articles）種子資料 —— 代表性樣本，非完整匯入。
--
-- 註：完整 55 篇文章匯入（來源：網站存檔 / 10_12）屬後續工作。
--     本檔僅放 6 篇代表性文章，涵蓋三個分類（新聞快訊 / 新機發表 / ESG實績），
--     讓 /news 列表頁、分類過濾與文章詳情頁可實際運作與驗收。
--
-- 冪等：以 slug 為衝突鍵 upsert（on conflict (slug) do update），可重複執行。
-- 全部 status = 'published'，published_at 給合理日期（新到舊）。
-- 內容為繁體中文佔位，待正式文案 / 圖片到位後再以後台或完整匯入覆蓋。

insert into articles
  (slug, category, title, excerpt, body_html, cover_image, images, seo_title, seo_description, status, published_at)
values
  (
    'ax-s9-oil-free-launch',
    '新機發表',
    'AX-S9 無油螺旋空壓機正式發表',
    '以 Class 0 認證空氣品質，為半導體與生醫產業提供潔淨氣源。',
    '<p>超勁賀空壓科技正式推出 AX-S9 無油螺旋空壓機，通過 ISO 8573-1 Class 0 認證，提供零油污染的潔淨壓縮空氣，適用於半導體、光電與生醫等對氣源純度要求嚴苛的製程。</p><h2>核心特色</h2><ul><li>永磁變頻馬達，部分負載效率提升 15%</li><li>智慧監控雲端平台，遠端掌握運轉狀態</li><li>低噪音設計，運轉音量低於 68 dB(A)</li></ul><p>新機種即日起接受詢價，歡迎與南北服務中心聯繫安排現場評估。</p>',
    null,
    '[]'::jsonb,
    'AX-S9 無油螺旋空壓機正式發表 | 超勁賀空壓科技',
    '超勁賀 AX-S9 無油螺旋空壓機通過 Class 0 認證，為半導體與生醫產業提供潔淨氣源。',
    'published',
    timestamptz '2026-05-18 10:00:00+08'
  ),
  (
    'vfd-dryer-2026-series',
    '新機發表',
    '新一代變頻冷凍式乾燥機系列上市',
    '依用氣量自動調節，露點穩定且較定頻機種節能達 30%。',
    '<p>全新變頻冷凍式乾燥機系列正式上市，採需求導向控制，依實際用氣量自動調節壓縮機轉速，在維持穩定露點的同時，較傳統定頻機種節能最高達 30%。</p><p>整機搭配環保冷媒與低壓損熱交換器，協助工廠在用氣高峰與離峰皆維持最佳能效。</p>',
    null,
    '[]'::jsonb,
    null,
    '變頻冷凍式乾燥機新系列上市，露點穩定、節能達 30%。',
    'published',
    timestamptz '2026-05-02 09:30:00+08'
  ),
  (
    'iso-50001-energy-management',
    '新聞快訊',
    '超勁賀通過 ISO 50001 能源管理系統認證',
    '以系統化能源管理推動製造業節能減碳，邁向淨零目標。',
    '<p>超勁賀空壓科技正式通過 ISO 50001 能源管理系統認證，建立從能源基線量測、目標設定到持續改善的完整管理機制，並將此方法論導入客戶現場的氣源系統節能輔導。</p><p>此認證象徵我們在協助製造業降低壓縮空氣能耗、實踐淨零承諾上，再進一步。</p>',
    null,
    '[]'::jsonb,
    null,
    '超勁賀通過 ISO 50001 能源管理系統認證，以系統化管理推動製造業節能減碳。',
    'published',
    timestamptz '2026-04-15 14:00:00+08'
  ),
  (
    'timtos-2026-invitation',
    '新聞快訊',
    'TIMTOS 2026 攤位 N0918 邀請函',
    '現場展示智慧監控雲端平台與最新無油機種，誠摯邀請蒞臨。',
    '<p>超勁賀空壓科技將參與 TIMTOS 2026 台北國際工具機展，攤位編號 N0918。現場將展示智慧監控雲端平台、AX-S9 無油螺旋空壓機與最新變頻乾燥機種，並由工程團隊提供一對一節能諮詢。</p><p>誠摯邀請各界先進蒞臨參觀指教。</p>',
    null,
    '[]'::jsonb,
    null,
    'TIMTOS 2026 攤位 N0918 邀請函 —— 超勁賀空壓科技。',
    'published',
    timestamptz '2026-04-01 11:00:00+08'
  ),
  (
    'esg-report-2025-carbon-42',
    'ESG實績',
    '2025 永續報告書：壓縮空氣減碳 42% 的實踐之路',
    '完整揭露超勁賀六年間如何將氣源系統碳排放降低 42%。',
    '<p>超勁賀 2025 永續報告書正式發布。報告完整揭露我們如何透過能源基線量測、變頻改造、熱回收與智慧監控，在六年間將氣源系統碳排放降低 42%，並協助 800 多家製造廠邁向淨零。</p><h2>關鍵成果</h2><ul><li>累計協助客戶年省電量逾 1.2 億度</li><li>導入熱回收系統的案場平均回收期低於 2 年</li></ul>',
    null,
    '[]'::jsonb,
    '2025 永續報告書：壓縮空氣減碳 42% | 超勁賀',
    '超勁賀 2025 永續報告書揭露氣源系統六年減碳 42% 的實踐之路。',
    'published',
    timestamptz '2026-05-28 16:00:00+08'
  ),
  (
    'heat-recovery-case-textile',
    'ESG實績',
    '紡織廠熱回收實績：把壓縮熱變成製程可用能源',
    '回收空壓機排出的壓縮熱供應熱水，年省天然氣成本逾百萬。',
    '<p>某中部紡織廠導入超勁賀熱回收系統，將空壓機運轉產生的壓縮熱回收用於製程熱水加熱，取代部分天然氣鍋爐負載，年省天然氣成本逾新台幣百萬元，並同步降低碳排放。</p><p>此案例展現壓縮空氣系統「節流」之外，亦能透過能源回收創造額外效益。</p>',
    null,
    '[]'::jsonb,
    null,
    '紡織廠熱回收實績：壓縮熱再利用，年省天然氣成本逾百萬。',
    'published',
    timestamptz '2026-03-20 10:30:00+08'
  )
on conflict (slug) do update set
  category        = excluded.category,
  title           = excluded.title,
  excerpt         = excluded.excerpt,
  body_html       = excluded.body_html,
  cover_image     = excluded.cover_image,
  images          = excluded.images,
  seo_title       = excluded.seo_title,
  seo_description = excluded.seo_description,
  status          = excluded.status,
  published_at    = excluded.published_at;
