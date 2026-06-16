-- 品牌介紹 brands 種子資料（issue #30）。
--
-- 兩個代理品牌：開山 KAISHAN / DELTECH。status = 'published'。
-- 冪等：以 slug upsert（on conflict (slug) do update），可重複執行。
-- 文案沿用 V2 改版前的靜態 kaishan / deltech 介紹頁。
-- 套用方式：Supabase Dashboard → SQL Editor 貼上執行（沿用 migrations 套路）。
--
-- images 暫留空 []（尚無授權品牌影像）；前台會以 BrandImagePlaceholder 代位。
-- body_html 為信任內容（service_role / 後台撰寫；前台 anon RLS 唯讀）。

insert into brands (slug, name, summary, body_html, images, seo_title, seo_description, sort_order, status, legacy_path)
values
  (
    'kaishan',
    '開山 KAISHAN',
    '世界頂級的技術研發能力。開山集團為亞洲領先的螺旋式空壓機與真空設備製造商，超勁賀為其台灣授權代理。',
    $html$
<p>研發團隊在湯炎博士帶領下，按北美研發中心完成的模型設計提供參數設計，上海研發中心進行圖紙設計，衢州技術中心開展工藝設計的分工，開發出大量擁有自主知識產權、世界領先的高新技術產品。</p>
<ul>
  <li>美國西雅圖北美研發中心（Jersey North America Development Center）</li>
  <li>美國工廠 Alabama Baldwin（阿拉巴馬州）</li>
</ul>
<h3>核心人物：湯炎 博士</h3>
<p>全球為數不多最頂尖的螺旋式壓縮機專家之一，海外二十餘年領導數家世界著名壓縮機公司的膨脹發電站、天然氣、冷媒及空氣壓縮機產品開發，擁有多項美國專利。發明的 T、α、Y 型線應用於多家世界知名壓縮機公司產品，約佔每年全球螺旋式產品 15% 左右。</p>
<h3>世界頂級加工 / 檢測設備</h3>
<ul>
  <li>日本三井 MHU630A 加工中心</li>
  <li>德國 KAPP 線上檢測轉子磨床</li>
  <li>英國 HOLROYD 數控螺旋式轉子磨床</li>
  <li>德國 HERMEL 五軸加工中心</li>
  <li>義大利進口落地式鏜銑加工中心</li>
  <li>德國 TRUMPF 柔性鈑金加工系統</li>
  <li>瑞士 KLINGELNBERG 轉子動態測量儀</li>
</ul>
<h3>開山永磁變頻螺旋式空壓機</h3>
<p><strong>螺旋主機能效</strong>：主機軸承與 SKF 共同開發專用軸承，軸承數量達 9 個（業內其他品牌一般僅 6 個），確保壽命與性能。</p>
<p><strong>高效永磁同步馬達</strong>：採特種稀土永磁材料，調節範圍更寬、效率更高；內置油冷卻全封閉結構（IP65），耐熱達 180&deg;C（較同類 120&deg;C 提升 50%）；轉子稀土永磁化、功率因數接近 1、調速誤差 1/30000。</p>
<p><strong>永磁變頻控制</strong>：專利弱磁控制 + 壓力控制 + 永磁馬達開環控制，適應惡劣環境；無需轉子轉角位置感測器；母線電壓利用率 &gt;93%；PID 控制 + 恆功控制技術，提供穩定供氣壓力。</p>
$html$,
    '[]'::jsonb,
    'KAISHAN 開山 — 世界頂級的技術研發能力',
    'KAISHAN 開山在湯炎博士帶領下，整合北美、上海與衢州研發據點，搭配世界頂級加工檢測設備，打造永磁變頻螺旋式空壓機等世界領先的高新技術產品。',
    1,
    'published',
    'kaishan.html'
  ),
  (
    'deltech',
    'DELTECH',
    '來自 SPX FLOW 的相變節能乾燥技術。PCM 相變節能乾燥機節能高達 99%，提供接近無油的潔淨壓縮空氣。',
    $html$
<h3>SPX FLOW：全球領先的流體技術供應商</h3>
<p>SPX FLOW 總部位於美國北卡羅來納州夏洛特市，是全球領先供應商，提供高度工程化的流體組件、製程設備、統包系統工程及相關售後備件與服務；服務食品飲料、能源電力、通用工業三大市場，年銷售額超過 20 億美金，在全球超過 35 個國家設分支機構、150 多個國家有銷售辦事處。</p>
<h3>Deltech PCM 相變節能乾燥機</h3>
<p>利用相變材料（PCM）的潛熱儲能特性，可大幅降低冷媒壓縮機運轉時間，讓冷凍式乾燥機不必持續運轉。適用 20~3000 馬力的空壓機。</p>
<h3>獨一無二的相變式儲能技術</h3>
<ul>
  <li>應用 PCM 相變材料（已註冊專利）</li>
  <li>採用內含 PCM 的不鏽鋼釺焊板式換熱器</li>
  <li>依壓縮空氣熱負荷調控冷媒壓縮機啟停</li>
</ul>
<h3>節能與除油的雙重突破</h3>
<p><strong>節能高達 99%</strong>，最短時間內回收投資成本。</p>
<p>內置冷聚結（Cold Coalescing）過濾器，<strong>濾除油氣效率高達 99.8%</strong>。</p>
<h3>無耗氣排水與接近無油的潔淨空氣</h3>
<p><strong>無耗氣自動排水裝置（No Loss Drain）</strong>：靜電容量感測器；排放冷卻水時無壓縮空氣耗損；操作異常時自動轉為定時模式。</p>
<p><strong>除油效果接近無油（Oil free）</strong>：PCM28.1J 或更大機型內置冷聚結（Cold Coalescing）過濾器，濾除油氣效率高達 99.8%。</p>
$html$,
    '[]'::jsonb,
    'DELTECH — 來自 SPX FLOW 的相變節能乾燥技術',
    'DELTECH 隸屬全球領先供應商 SPX FLOW，其 PCM 相變節能乾燥機運用相變材料潛熱儲能，節能高達 99%，並提供無耗氣自動排水與接近無油的壓縮空氣處理。',
    2,
    'published',
    'deltech.html'
  )
on conflict (slug) do update set
  name            = excluded.name,
  summary         = excluded.summary,
  body_html       = excluded.body_html,
  images          = excluded.images,
  seo_title       = excluded.seo_title,
  seo_description = excluded.seo_description,
  sort_order      = excluded.sort_order,
  status          = excluded.status,
  legacy_path     = excluded.legacy_path;
