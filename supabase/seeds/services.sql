-- 服務項目（Services）種子資料 —— 4 項一站式節能氣源服務。
--
-- 對應 V2 之前的 4 個靜態子頁（energy-plan / energy-tech / room-planning /
-- carbon-reduction），改為 DB-driven 後以本檔灌入文案。內容轉自既有靜態子頁，
-- body_html 為段落 / 清單 / 表格（渲染端會經 sanitizeBodyHtml allowlist 消毒）。
--
-- 冪等：以 slug 為衝突鍵 upsert（on conflict (slug) do update），可重複執行。
-- 全部 status = 'published'，sort_order 依索引頁排序（節能方案→技術→機房→減碳）。
-- 文案為繁體中文佔位，待正式內容 / 圖片到位後再以後台或完整匯入覆蓋。

insert into services
  (slug, title, summary, body_html, images, seo_title, seo_description, sort_order, status)
values
  (
    'energy-plan',
    '節能方案規劃',
    '從觀念釐清、現場檢測到報告討論，以三步驟為每間工廠量身打造專屬省電方案，讓節能決策有數據可依循。',
    '<p>空壓系統往往是工廠裡最容易被忽略、卻最耗電的一環。管路佈置若在規劃或施工初期未能妥善配置，日後一旦發生洩漏、腐蝕或壓降，除了重新配管幾乎無計可施，能源就這樣一點一滴流失。超勁賀相信「節能不是換一台機器，而是重新理解整套系統」，因此我們以三個步驟，陪客戶從觀念釐清開始，逐步找出真正適合每間工廠的省電方案。</p><h2>三步驟節能規劃</h2><p>每一步都以實測數據為依據，讓節能決策不再憑感覺，而是看得見、算得出。</p><h3>1. 洽談諮詢 · 觀念釐清</h3><p>先深入了解廠內的用氣需求、使用習慣與現有空壓機狀況，釐清常見的節能迷思，並提供初步評估與後續規劃方向。這一步不急著談設備，而是先把問題定義清楚。</p><h3>2. 現場勘查 · 效能檢測</h3><p>實地評估工廠環境中油氣與溫度對空壓機的影響，並以專業儀器檢測空壓機及乾燥機的排氣量、露點等級與耗電狀況，讓每一項能源損耗都有具體數字佐證。</p><h3>3. 報告製作 · 會議討論</h3><p>將檢測數據整理成智能分析報告，清楚呈現廠內各機台的運轉現況與改善空間，再與客戶一同討論、排定優先順序，訂出投資報酬最合理的節能方案。</p><p>從第一次對談到最終方案，超勁賀提供的不只是設備建議，而是一套可被驗證、可持續優化的節能路徑。</p>',
    '[{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/hero-energy-plan.jpg","alt":"工程師在明亮廠房檢視空壓機能耗報表","sort":0},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/energy-plan-steps.svg","alt":"三步驟節能規劃流程圖：洽談諮詢、現場勘查、報告製作","sort":1}]'::jsonb,
    '節能方案規劃 | 超勁賀空壓科技',
    '幫助客戶釐清節能觀念，從洽談諮詢、現場勘查到報告製作，製作符合每間工廠不同狀況的省電方案。',
    1,
    'published'
  ),
  (
    'energy-tech',
    '突破傳統的節能技術',
    '以雙段壓縮空壓機與儲能型冷凍式乾燥機，跳脫傳統設計思維，從壓縮與除濕兩端同時省電，耗電量最高可降低 15~20%。',
    '<p>節能的下一步，往往藏在「機器怎麼運作」的細節裡。繼變頻技術之後，超勁賀導入雙段壓縮與儲能型乾燥兩項關鍵技術，從壓縮與除濕兩端同時降低能耗，讓省電不必犧牲產氣量與空氣品質。</p><h2>空壓機雙段與單段壓縮的差異</h2><p>在相同排氣量下，雙段壓縮的排氣量比單段更大，因此同馬力數的雙段壓縮負荷量小於單段，耗電量可降低 <strong>15~20%</strong>。以一台 100HP 空壓機、每年運轉 6336 小時計算，實測年運轉電力可節省 <strong>82,685 kW</strong> —— 相當於一筆年復一年、持續回收的能源成本。</p><h2>儲能型與傳統型冷凍式乾燥機的差異</h2><p>乾燥機是另一個常被忽略的耗電來源。儲能型利用 PCM 相變材料，讓冷媒壓縮機擁有「休息」的節電空間，可依廠內用氣量彈性休息或運轉；在不影響效能的前提下，卻水效果比傳統型提升 <strong>10~20%</strong>。</p><ul><li><strong>傳統型：</strong>製冷壓縮機與風扇必須持續作動，才能維持冷媒效能，即使用氣量下降也照樣耗電。</li><li><strong>儲能型：</strong>冷媒先冷卻 PCM 並使其凍結，凍結期間壓縮機與風扇即停止；PCM 吸收壓縮空氣熱能的過程完全不耗功率，待其融化後才恢復運轉，用電因此大幅下降。</li></ul>',
    '[{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/hero-energy-tech.jpg","alt":"雙段壓縮空壓機內部剖視","sort":0},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/energy-tech-compare.svg","alt":"雙段壓縮與單段壓縮能耗對比圖","sort":1},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/energy-tech-dryer.svg","alt":"儲能型與傳統型冷凍式乾燥機差異對比","sort":2},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/tech-cutaway.jpg","alt":"雙段壓縮主機剖視：高效主機設計與級間冷卻","sort":3}]'::jsonb,
    '突破傳統的節能技術 | 超勁賀空壓科技',
    '雙段壓縮空壓機與儲能型冷凍式乾燥機，利用有別於傳統的技術提供廠內最佳省電效益，耗電量最高可降低 15~20%。',
    2,
    'published'
  ),
  (
    'room-planning',
    '從源頭規劃的氣源機房',
    '好的氣源品質從機房被畫出來的那一刻就決定；從規劃與施工初期做對配置與管路佈置，並依 ISO 8573-1 把關壓縮空氣品質。',
    '<p>好的氣源品質，是從機房被「畫出來」的那一刻就決定的。管路佈置若在規劃或施工初期未能妥善配置，日後一旦洩漏、腐蝕或壓降，除非重新配管，幾乎無計可施。與其事後補救，不如從規劃與施工初期就把機房做對——這也是超勁賀最重視的一環。</p><h2>機房規劃的關鍵要點</h2><h3>空壓機及後處理設備之建議配置</h3><p>設備的擺放順序，直接決定了除水與過濾的效率。空壓機出口與冷凍乾燥機入口之間搭配儲氣桶做初步排水並降低入口溫度；冷乾機前搭精密過濾器以減少熱交換器阻塞、延長使用壽命；冷乾機後再搭後製精密過濾器去除殘餘油氣與顆粒；最後以一顆儲氣桶穩定末端壓力。每一段都環環相扣，少一環就多一分風險。</p><h3>壓縮空氣管路的合理化佈置</h3><p>主幹管採環狀佈置，依壓降目標計算並統一管徑，讓廠內各點都能取得穩定壓力；低點安裝卻水管與無耗氣式卻水器排除冷凝水。管接頭、法蘭接合面、安全閥、關斷閥、快速接頭、氣動工具及軟管都是常見洩漏點，須納入定期檢查，避免看不見的漏氣長期蠶食能源。</p><h3>環境溫度對空壓機房的影響</h3><p>壓縮過程會散發大量熱量，若無法及時排出，室溫與吸氣口溫度便隨之升高，形成排氣溫度不斷攀升的惡性循環；加上高溫空氣密度較低，最終導致產氣量減少。良好的通風與散熱設計，是機房長期穩定運轉的隱形基礎。</p><h3>國際標準壓縮空氣品質</h3><p>空氣中本就含有水氣與塵粒（油氣、微粒），壓縮後水氣凝結、塵粒集結，若未妥善處理，將造成設備與管路腐蝕洩漏、潤滑油沖失、儀控設備誤動作、氣壓閥與氣缸緩滯磨損，甚至污染最終產品、讓工具因腐蝕與濕氣提前損毀。應依製程需求對照 <strong>ISO 8573-1</strong> 選用適當等級的乾燥機與過濾器，並落實預防保養。</p><h2>精密過濾器等級表</h2><p>依製程對空氣潔淨度的要求，選用對應等級的過濾器，是確保氣源品質的最後一道把關。</p><table><thead><tr><th>等級</th><th>適用</th><th>材質</th><th>過濾雜質 (MICRON)</th><th>濾油含量 (PPM)</th></tr></thead><tbody><tr><td>Q / QA</td><td>一般往復式前置</td><td>多層玻璃纖維濾芯</td><td>3</td><td>3</td></tr><tr><td>P / AO</td><td>一般螺旋式前置</td><td>多層玻璃纖維濾芯</td><td>1</td><td>0.5</td></tr><tr><td>S / AA</td><td>一般空壓後置</td><td>多層玻璃纖維濾芯</td><td>0.01</td><td>0.01</td></tr><tr><td>C / AC</td><td>高度精密</td><td>活性碳濾芯</td><td>0.01</td><td>0.003</td></tr></tbody></table><p>最大壓力 16 kg/cm²（各等級共通）。</p>',
    '[{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/hero-room-planning.jpg","alt":"規劃整齊的空壓機房與儲氣桶","sort":0},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/room-planning-layout.svg","alt":"後處理設備建議配置順序流程圖","sort":1},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/room-planning-loop.svg","alt":"環狀主幹管管路佈置示意圖","sort":2},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/room-equipment.jpg","alt":"氣源機房完整設備配置圖（含 ISO 7183 入口狀態參數）","sort":3}]'::jsonb,
    '從源頭規劃的氣源機房 | 超勁賀空壓科技',
    '從規劃與施工初期做好空壓機房配置與管路佈置，避免日後洩漏、腐蝕或壓降，並依 ISO 8573-1 確保壓縮空氣品質。',
    3,
    'published'
  ),
  (
    'carbon-reduction',
    '以數據驅動的減碳行動',
    '以系統化碳盤查與即時智能監控，協助企業把 ESG 與淨零從口號變成可量化的成果，從數據收集到改善措施逐步落實。',
    '<h2>ESG 不只是責任，更是策略</h2><p>面對日益嚴格的法規與供應鏈要求，減碳早已不只是社會責任。妥善的 ESG 實踐能同時管理營運風險、滿足投資者與客戶需求、遵循法規、提升品牌形象與競爭優勢，還能帶動員工滿意度與創新效率——它既是責任，更是能帶來實質商業利益的策略。而空壓系統，正是製造業最值得優先盤查的耗能來源之一。</p><h2>空壓設備碳盤查流程</h2><p>減碳無法憑感覺，必須建立在完整、可追溯的數據之上。超勁賀以六個步驟，協助企業把空壓設備的碳排放攤在陽光下：</p><ol><li>數據收集</li><li>能源來源分析</li><li>碳排放計算</li><li>效率評估</li><li>改善措施</li><li>監測與報告</li></ol><p>其中「數據收集」最優先、也最關鍵：①完整盤點所有空壓設備的基本資訊（型號、功率、運行時間、負載）；②確定每一台設備的實際能源消耗量（kWh）。基礎數據愈完整，後續的分析與改善就愈精準。</p><h2>即時監控的智能量測設備</h2><p>要讓減碳可持續，關鍵在於「即時看得見」。透過以下量測設備，廠內每一度電、每一分氣量都能被記錄與優化：</p><ul><li><strong>智能群控箱：</strong>即時收集並整合所有空壓設備的訊息（能耗、流量、露點）；當多台空壓機並聯時，可依用氣量自動調控啟停，避免多餘的能源損耗。</li><li><strong>智能電表：</strong>隨時紀錄用電量，讓資料收集更省力、更即時。</li><li><strong>差壓式流量計：</strong>即時紀錄單台空壓機的排氣量，評估效能是否衰退。</li><li><strong>露點計：</strong>即時記錄乾燥機處理後壓縮空氣的含水量，確保空氣品質穩定。</li><li><strong>熱質式流量計：</strong>即時紀錄多台空壓機的總排氣量，也就是廠內的總需求用氣量。</li><li><strong>資料彙整：</strong>所有即時資料匯入智能群控箱，自動彙整功率、運行時間與負載；一旦出現高溫、跳機等異常即發出警報，並立即重新調配運行。</li></ul>',
    '[{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/hero-carbon-reduction.jpg","alt":"智能能源管理系統即時能耗監控螢幕","sort":0},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/carbon-reduction-flow.svg","alt":"空壓設備碳盤查六步驟流程圖","sort":1},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/carbon-reduction-devices.svg","alt":"智能量測設備生態圖：智能群控箱與各式量測設備","sort":2},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/carbon-dashboard.jpg","alt":"智能群控系統實際畫面：全廠空壓機狀態與電流能耗總覽","sort":3},{"url":"https://jgqswfjdehtpesfdlmhe.supabase.co/storage/v1/object/public/media/services/carbon-status.jpg","alt":"智能群控系統實際畫面：單機當日運轉狀態與運轉時數","sort":4}]'::jsonb,
    '以數據驅動的減碳行動 | 超勁賀空壓科技',
    '以系統化碳盤查與智能監控，協助企業落實 ESG 與淨零；從數據收集、能源分析到改善措施，量化每一步減碳成效。',
    4,
    'published'
  )
on conflict (slug) do update set
  title           = excluded.title,
  summary         = excluded.summary,
  body_html       = excluded.body_html,
  images          = excluded.images,
  seo_title       = excluded.seo_title,
  seo_description = excluded.seo_description,
  sort_order      = excluded.sort_order,
  status          = excluded.status;
