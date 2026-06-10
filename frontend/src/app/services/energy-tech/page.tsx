import type { Metadata } from "next";
import { ServiceHeader } from "@/components/services/ServiceHeader";
import {
  ServiceSection,
  SectionHeading,
} from "@/components/services/ServiceSection";
import { SpecTable, type SpecColumn } from "@/components/services/SpecTable";
import { ServiceCtaBanner } from "@/components/services/ServiceCtaBanner";

export const metadata: Metadata = {
  title: "節能技術",
  description:
    "雙段壓縮空壓機與儲能型冷凍式乾燥機，利用有別於傳統的技術提供廠內最佳省電效益，耗電量最高可降低 15~20%。",
};

// Columns shared by both screw-compressor tables (single-stage PMV and
// two-stage PMV2). 排氣壓力 is a constant 6~9 Kg/cm² range, kept as a column.
const COMPRESSOR_COLUMNS: SpecColumn[] = [
  { label: "型號", minWidth: 110 },
  { label: "排氣壓力 (Kg/cm²)", minWidth: 120 },
  { label: "排氣量 (m³/min)", minWidth: 130 },
  { label: "馬達 (kW / HP)", minWidth: 120 },
  { label: "排氣接口", minWidth: 90 },
  { label: "噪音 dB(A)", minWidth: 90 },
  { label: "重量 (kg)", minWidth: 90 },
];

// 永磁變頻單段螺旋空壓機 (PMV). Cells follow COMPRESSOR_COLUMNS order; values
// not provided by the source spec are left blank (rendered as an em dash).
const PMV_ROWS: string[][] = [
  ["PMV-20", "6~9", "2.37~2.88", "15 / 20", "G1", "68", "380"],
  ["PMV-30", "6~9", "3.61~4.22", "22 / 30", "", "", "480"],
  ["PMV-50", "6~9", "6.28~7.42", "37 / 50", "G1½", "70", "710"],
  ["PMV-75", "6~9", "9.99~11.95", "55 / 75", "", "", "990"],
];

// 永磁變頻二段螺旋空氣壓縮機 (PMV2).
const PMV2_ROWS: string[][] = [
  ["PMV2-30", "6~9", "3.8~4.6", "", "", "", "550"],
  ["PMV2-50", "6~9", "6.5~7.65", "", "", "", "740"],
  ["PMV2-75", "6~9", "10.5~12.5", "", "", "", "1100"],
  ["PMV2-100", "6~9", "14.5~16.5", "75 / 100", "G2", "72", "1500"],
];

// PCM storage-type dryer matrix. The full source table also carries 壓力露點
// (a constant 4±2°C) and entrance/power conditions — pulled into the note below
// so the on-screen columns stay legible while no data is dropped.
const PCM_COLUMNS: SpecColumn[] = [
  { label: "型號", minWidth: 100 },
  { label: "處理流量 (Nm³/min)", minWidth: 130 },
  { label: "耗電量 (kW)", minWidth: 100 },
  { label: "口徑", minWidth: 90 },
  { label: "重量 (kg)", minWidth: 90 },
  { label: "機台尺寸 高×寬×深 (mm)", minWidth: 180 },
];

const PCM_ROWS: string[][] = [
  ["PCM2.7", "2.73", "0.54", 'PT1"', "54.5", "751×363×603"],
  ["PCM3.5", "3.5", "0.64", "", "66.5", "712×363×782"],
  ["PCM6.8", "6.83", "1.30", 'PT2"', "98.5", "762×443×962"],
  ["PCM14.1", "14.14", "2.55", "", "152", "912×494×1112"],
  ["PCM18.9", "18.9", "3.53", "", "192", "1032×494×1253"],
  ["PCM28.1", "28.1", "4.50", "80A", "514", "1600×820×1394"],
  ["PCM42.7", "42.7", "6.50", "100A", "850", "1860×1000×1382"],
  ["PCM49.9", "49.9", "", "", "870", ""],
  ["PCM66.5", "66.54", "10.50", "", "1200", "1860×1120×1802"],
  ["PCM99.8", "99.8", "18", "150A", "1745", "2200×2075×1382"],
  ["PCM199.6", "199.61", "36", "250A", "3490", ""],
  ["PCM299.4", "299.42", "54", "300A", "5235", ""],
  ["PCM399.2", "399.23", "", "", "6980", ""],
];

const PCM_NOTE =
  "壓力露點 4±2°C；入口溫度 2~45°C；電源 220/1/60（小機型）、380/3/60（大機型）。空白欄位為原廠規格未提供。";

export default function EnergyTechPage() {
  return (
    <>
      <ServiceHeader
        eyebrow="ENERGY TECH · 節能技術"
        title="突破傳統的節能技術"
        tagline="利用有別於傳統空壓機及乾燥機的技術，提供客戶廠內最佳省電效益。"
      />

      {/* 01 — 雙段 vs 單段壓縮 */}
      <ServiceSection variant="muted">
        <SectionHeading eyebrow="01" title="空壓機雙段與單段壓縮的差異" />
        <p className="text-text-muted max-w-[760px] text-[15px] leading-[1.75]">
          繼變頻技術後的突破：相同排氣量下，雙段壓縮排氣量比單段大，故同馬力數的雙段壓縮負荷量小於單段，耗電量降低{" "}
          <strong className="text-primary-deep font-semibold">15~20%</strong>
          。以 100HP 空壓機、每年 6336 小時計，實測年運轉電力可節省{" "}
          <strong className="text-primary-deep font-semibold">82,685 kW</strong>
          。
        </p>

        <SpecTable
          caption="永磁變頻單段螺旋空壓機（PMV）"
          columns={COMPRESSOR_COLUMNS}
          rows={PMV_ROWS}
        />

        <SpecTable
          caption="永磁變頻二段螺旋空氣壓縮機（PMV2）"
          columns={COMPRESSOR_COLUMNS}
          rows={PMV2_ROWS}
        />
      </ServiceSection>

      {/* 02 — 儲能型 vs 傳統型乾燥機 */}
      <ServiceSection>
        <SectionHeading eyebrow="02" title="儲能型與傳統型冷凍式乾燥機的差異" />
        <p className="text-text-muted max-w-[760px] text-[15px] leading-[1.75]">
          儲能型利用 PCM
          相變材料讓冷媒壓縮機有休息節電空間，可配合廠內用氣量休息或運轉，不影響效能，卻水效果比傳統型提升{" "}
          <strong className="text-primary-deep font-semibold">10~20%</strong>。
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="border-border bg-surface flex flex-col gap-2 rounded-[14px] border p-6">
            <h3 className="text-ink text-[16px] font-semibold">傳統型</h3>
            <p className="text-text-muted text-[14px] leading-[1.7]">
              製冷壓縮機與風扇須持續作動以維持冷媒效能。
            </p>
          </div>
          <div className="border-primary/40 bg-surface-muted flex flex-col gap-2 rounded-[14px] border p-6">
            <h3 className="text-ink text-[16px] font-semibold">儲能型</h3>
            <p className="text-text-muted text-[14px] leading-[1.7]">
              冷媒冷卻 PCM 並凍結，凍結時壓縮機／風扇停止；PCM
              吸收壓縮空氣熱能期間不耗功率，融化後恢復運轉。
            </p>
          </div>
        </div>

        <SpecTable
          caption="PCM 儲能型冷凍式乾燥機機種規格"
          columns={PCM_COLUMNS}
          rows={PCM_ROWS}
          note={PCM_NOTE}
        />
      </ServiceSection>

      <ServiceCtaBanner
        title="想評估雙段壓縮或儲能型乾燥機的節電效益？"
        description="預約能源診斷，我們將以實測數據協助您試算導入後的省電與減碳潛力。"
      />
    </>
  );
}
