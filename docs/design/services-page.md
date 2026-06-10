# 服務項目 — issue #8 (no Pencil frame; design from the design system)

Four static editorial service pages + an optional `/services` index. REAL copy extracted from
the old site (`網站存檔/`). Build per `airexpert-design-system` SKILL.md (tokens, fonts, section
rhythm, lucide-react). Renders between the existing shell Header/Footer. Static content (hardcode).

Routes (the shell nav maps 解決方案 → `/services`): `/services` index linking the four, plus
`/services/energy-plan` (節能方案), `/services/energy-tech` (節能技術), `/services/room-planning`
(機房規劃), `/services/carbon-reduction` (減碳行動). Use a shared layout/section components under
`src/components/services/`. Each page: header band (eyebrow + title + tagline) → content sections →
dark CTA → /contact.

## `/services` index
Title 服務項目 / 一站式節能氣源服務. 4 cards (lucide icons) linking the pages:
節能方案 · 節能技術 · 機房規劃 · 減碳行動, each with a one-line summary (from each page's tagline).

## 節能方案 (`/services/energy-plan`)
Tagline: 幫助客戶釐清節能觀念，製作符合每間工廠不同狀況的省電方案。
**3-step process** (numbered cards / timeline):
1. **洽談諮詢 / 觀念釐清** — 了解客戶廠內需求、使用習慣及空壓機狀況，提供初步評估及後續規劃。
2. **現場勘查 / 效能檢測** — 評估工廠環境（油氣、溫度對空壓機之影響），並用專業儀器檢測空壓機及乾燥機之排氣量、露點等級與耗電狀況。
3. **報告製作 / 會議討論** — 以檢測數據及報表智能分析報告，分析廠內機台狀況，討論最佳節能方案。

## 節能技術 (`/services/energy-tech`)
Tagline: 利用有別於傳統空壓機及乾燥機的技術，提供客戶廠內最佳省電效益。
**01. 空壓機雙段與單段壓縮的差異** — 繼變頻技術後的突破：相同排氣量下，雙段壓縮排氣量比單段大，故同馬力數的雙段壓縮負荷量小於單段，耗電量降低 **15~20%**。以 100HP 空壓機、每年 6336 小時計，實測年運轉電力可節省 **82,685 kW**。
  - 表格「永磁變頻單段螺旋空壓機」(PMV)：欄位 型號 / 排氣壓力(6~9 Kg/cm²) / 排氣量(m³/min) / 馬達(kW·HP) / 排氣接口 / 噪音 dB(A) / 重量 kg。資料：PMV-20 2.37~2.88, 15kW/20HP, G1, 68, 380｜PMV-30 3.61~4.22, 22/30, 480｜PMV-50 6.28~7.42, 37/50, G1½, 70, 710｜PMV-75 9.99~11.95, 55/75, 990。
  - 表格「永磁變頻二段螺旋空氣壓縮機」(PMV2)：PMV2-30 3.8~4.6, 550｜PMV2-50 6.5~7.65, 740｜PMV2-75 10.5~12.5, 1100｜PMV2-100 14.5~16.5, 100HP, G2, 72, 1500。
**02. 儲能型與傳統型冷凍式乾燥機的差異** — 儲能型利用 PCM 相變材料讓冷媒壓縮機有休息節電空間。
  - 傳統型：製冷壓縮機與風扇須持續作動以維持冷媒效能。
  - 儲能型：冷媒冷卻 PCM 並凍結，凍結時壓縮機/風扇停止；PCM 吸收壓縮空氣熱能期間不耗功率，融化後恢復運轉。可配合廠內用氣量休息或運轉，不影響效能，卻水效果比傳統型提升 **10~20%**。
  - PCM 機種表（欄位：處理流量 Nm³/min / 壓力露點 4±2°C / 耗電量 kW / 口徑 / 重量 kg / 機台尺寸 高×寬×深 mm）。資料列（型號 處理流量 耗電 口徑 重量 尺寸）：PCM2.7 2.73 0.54 PT1" 54.5 751×363×603｜PCM3.5 3.5 0.64 66.5 712×363×782｜PCM6.8 6.83 1.30 PT2" 98.5 762×443×962｜PCM14.1 14.14 2.55 152 912×494×1112｜PCM18.9 18.9 3.53 192 1032×494×1253｜PCM28.1 28.1 4.50 80A 514 1600×820×1394｜PCM42.7 42.7 6.50 100A 850 1860×1000×1382｜PCM49.9 49.9 870｜PCM66.5 66.54 10.50 1200 1860×1120×1802｜PCM99.8 99.8 18 150A 1745 2200×2075×1382｜PCM199.6 199.61 36 250A 3490｜PCM299.4 299.42 54 300A 5235｜PCM399.2 399.23 6980. (入口溫度 2~45°C；電源 220/1/60 小機型、380/3/60 大機型。) Render as a scrollable spec table per skill's table guidance; if the full matrix is too wide, show key columns + note.

## 機房規劃 (`/services/room-planning`)
Tagline: 管路佈置若在規劃或施工初期未能良好配置，日後一旦洩漏、腐蝕或壓降，除非重新配管，幾乎無計可施。
5 sections (numbered):
1. **空壓機及後處理設備之建議配置** — 空壓機出口與冷凍乾燥機入口間搭配儲氣桶做初步排水並降低入口溫度；冷乾機前搭精密過濾器以減少熱交換器阻塞、延長壽命；冷乾機後搭後製精密過濾器去除油氣與顆粒；最後再搭一儲氣桶維持壓力穩定。
2. **壓縮空氣管路的合理化佈置** — 主幹管採環狀佈置，依壓降目標計算管徑且管徑一致；低點安裝卻水管及無耗氣式卻水器。主要洩漏點：管接頭、法蘭接合面、安全閥、關斷閥、快速接頭、氣動工具及軟管，須定期檢查。
3. **環境溫度對空壓機房的影響** — 壓縮過程散發大量熱量，若無法及時排出會使室溫升高、吸氣口溫度升高，惡性循環造成排氣溫度升高，且高溫空氣密度小造成產氣量減少。
4. **國際標準壓縮空氣品質** — 空氣含水氣與塵粒（油氣、微粒），壓縮後水氣凝結、塵粒集結，若未處理會造成：①設備/管路腐蝕與洩漏 ②潤滑油沖失 ③儀控設備誤動作 ④氣壓閥/缸緩滯與磨損 ⑤最終產品污染 ⑥工具因腐蝕/濕氣損毀。須依製程需求對照 **ISO 8573-1** 選用乾燥機與過濾器並做好預防保養。
5. **精密過濾器等級表** — 等級 Q/QA · P/AO · S/AA · C/AC；適用：一般往復式前置 / 一般螺旋式前置 / 一般空壓後置 / 高度精密；材質 多層玻璃纖維濾芯 / 活性碳濾芯；過濾雜質 3 / 1 / 0.01 MICRON；濾油含量 3 / 0.5 / 0.01 / 0.003 PPM；最大壓力 16 kg/cm²。

## 減碳行動 (`/services/carbon-reduction`)
Tagline: 以系統化碳盤查與智能監控，協助企業落實 ESG 與淨零。
- **為何推動 ESG**：管理風險、滿足投資者需求、遵守法律、提升品牌形象與競爭優勢，同時提高員工滿意度與創新效率——既是社會責任，也是帶來商業利益的策略。
- **空壓設備碳盤查流程**：數據收集 → 能源來源分析 → 碳排放計算 → 效率評估 → 改善措施 → 監測與報告。其中「數據收集」最優先也最重要：①收集所有空壓設備基本資訊（型號、功率、運行時間、負載）②確定每台設備能源消耗量（kWh）。
- **數據收集設備**（icon cards）：
  - 智能群控箱 — 即時收集整合所有空壓設備訊息（能耗、流量、露點）；多台空壓機時配合用氣量調控啟停，避免多餘能源損耗。
  - 智能電表 — 隨時紀錄用電量，便於資料收集。
  - 差壓式流量計 — 即時紀錄單台空壓機排氣量，評估有無衰退。
  - 露點計 — 即時記錄乾燥機處理後壓縮空氣的含水量。
  - 熱質式流量計 — 即時紀錄多台空壓機總排氣量（即廠內總需求用氣量）。
  - 彙整：即時資料匯入智能群控箱，自動彙整功率/運行時間/負載；出現高溫、跳機等狀況時警報並立即調配運行。

## Notes
- Static content — hardcode; no `@/lib/data`. Shared section components under `src/components/services/`.
- Spec tables: build with flex per skill's table guidance; make wide tables horizontally scrollable on mobile (`overflow-x-auto`).
- lucide-react icons. Tokens only. Responsive. End each page with dark CTA → /contact.
