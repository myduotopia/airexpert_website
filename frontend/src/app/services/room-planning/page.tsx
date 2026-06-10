import type { Metadata } from "next";
import { ServiceHeader } from "@/components/services/ServiceHeader";
import {
  ServiceSection,
  SectionHeading,
} from "@/components/services/ServiceSection";
import {
  NumberedSteps,
  type NumberedStep,
} from "@/components/services/NumberedSteps";
import { SpecTable, type SpecColumn } from "@/components/services/SpecTable";
import { ServiceCtaBanner } from "@/components/services/ServiceCtaBanner";

export const metadata: Metadata = {
  title: "機房規劃",
  description:
    "從規劃與施工初期做好空壓機房配置與管路佈置，避免日後洩漏、腐蝕或壓降，並依 ISO 8573-1 確保壓縮空氣品質。",
};

const SECTIONS: NumberedStep[] = [
  {
    title: "空壓機及後處理設備之建議配置",
    body: "空壓機出口與冷凍乾燥機入口間搭配儲氣桶做初步排水並降低入口溫度；冷乾機前搭精密過濾器以減少熱交換器阻塞、延長壽命；冷乾機後搭後製精密過濾器去除油氣與顆粒；最後再搭一儲氣桶維持壓力穩定。",
  },
  {
    title: "壓縮空氣管路的合理化佈置",
    body: "主幹管採環狀佈置，依壓降目標計算管徑且管徑一致；低點安裝卻水管及無耗氣式卻水器。主要洩漏點：管接頭、法蘭接合面、安全閥、關斷閥、快速接頭、氣動工具及軟管，須定期檢查。",
  },
  {
    title: "環境溫度對空壓機房的影響",
    body: "壓縮過程散發大量熱量，若無法及時排出會使室溫升高、吸氣口溫度升高，惡性循環造成排氣溫度升高，且高溫空氣密度小造成產氣量減少。",
  },
  {
    title: "國際標準壓縮空氣品質",
    body: (
      <>
        空氣含水氣與塵粒（油氣、微粒），壓縮後水氣凝結、塵粒集結，若未處理會造成：①設備／管路腐蝕與洩漏
        ②潤滑油沖失 ③儀控設備誤動作 ④氣壓閥／缸緩滯與磨損 ⑤最終產品污染
        ⑥工具因腐蝕／濕氣損毀。須依製程需求對照{" "}
        <strong className="text-primary-deep font-semibold">ISO 8573-1</strong>{" "}
        選用乾燥機與過濾器並做好預防保養。
      </>
    ),
  },
];

// 精密過濾器等級表. The source lists attributes per grade; rendered grade-as-row
// so each filter class reads across its適用 / 材質 / 過濾雜質 / 濾油含量.
// 最大壓力 16 kg/cm² is common to all grades and noted below the table.
const FILTER_COLUMNS: SpecColumn[] = [
  { label: "等級", minWidth: 90 },
  { label: "適用", minWidth: 160 },
  { label: "材質", minWidth: 140 },
  { label: "過濾雜質 (MICRON)", minWidth: 120 },
  { label: "濾油含量 (PPM)", minWidth: 110 },
];

const FILTER_ROWS: string[][] = [
  ["Q / QA", "一般往復式前置", "多層玻璃纖維濾芯", "3", "3"],
  ["P / AO", "一般螺旋式前置", "多層玻璃纖維濾芯", "1", "0.5"],
  ["S / AA", "一般空壓後置", "多層玻璃纖維濾芯", "0.01", "0.01"],
  ["C / AC", "高度精密", "活性碳濾芯", "0.01", "0.003"],
];

export default function RoomPlanningPage() {
  return (
    <>
      <ServiceHeader
        eyebrow="ROOM PLANNING · 機房規劃"
        title="從源頭規劃的氣源機房"
        tagline="管路佈置若在規劃或施工初期未能良好配置，日後一旦洩漏、腐蝕或壓降，除非重新配管，幾乎無計可施。"
      />

      <ServiceSection variant="muted">
        <SectionHeading eyebrow="LAYOUT · 規劃重點" title="五大規劃要點" />
        <NumberedSteps steps={SECTIONS} />
      </ServiceSection>

      <ServiceSection>
        <SectionHeading eyebrow="05" title="精密過濾器等級表" />
        <SpecTable
          columns={FILTER_COLUMNS}
          rows={FILTER_ROWS}
          note="最大壓力 16 kg/cm²（各等級共通）。"
        />
      </ServiceSection>

      <ServiceCtaBanner
        title="規劃新機房或檢視既有管路配置？"
        description="預約現場勘查，我們將協助您從設備配置、管路佈置到空氣品質等級，做好整體機房規劃。"
      />
    </>
  );
}
