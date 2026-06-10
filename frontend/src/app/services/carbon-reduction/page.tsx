import type { Metadata } from "next";
import {
  Network,
  Gauge,
  Wind,
  Droplets,
  Activity,
  Database,
} from "lucide-react";
import { ServiceHeader } from "@/components/services/ServiceHeader";
import {
  ServiceSection,
  SectionHeading,
} from "@/components/services/ServiceSection";
import { IconCards, type IconCard } from "@/components/services/IconCards";
import { ServiceCtaBanner } from "@/components/services/ServiceCtaBanner";

export const metadata: Metadata = {
  title: "減碳行動",
  description:
    "以系統化碳盤查與智能監控，協助企業落實 ESG 與淨零；從數據收集、能源分析到改善措施，量化每一步減碳成效。",
};

// 空壓設備碳盤查流程 — six ordered stages.
const AUDIT_FLOW: string[] = [
  "數據收集",
  "能源來源分析",
  "碳排放計算",
  "效率評估",
  "改善措施",
  "監測與報告",
];

// 數據收集設備 — instrumentation that feeds the carbon audit.
const DEVICES: IconCard[] = [
  {
    icon: Network,
    title: "智能群控箱",
    description:
      "即時收集整合所有空壓設備訊息（能耗、流量、露點）；多台空壓機時配合用氣量調控啟停，避免多餘能源損耗。",
  },
  {
    icon: Gauge,
    title: "智能電表",
    description: "隨時紀錄用電量，便於資料收集。",
  },
  {
    icon: Wind,
    title: "差壓式流量計",
    description: "即時紀錄單台空壓機排氣量，評估有無衰退。",
  },
  {
    icon: Droplets,
    title: "露點計",
    description: "即時記錄乾燥機處理後壓縮空氣的含水量。",
  },
  {
    icon: Activity,
    title: "熱質式流量計",
    description: "即時紀錄多台空壓機總排氣量（即廠內總需求用氣量）。",
  },
  {
    icon: Database,
    title: "資料彙整",
    description:
      "即時資料匯入智能群控箱，自動彙整功率／運行時間／負載；出現高溫、跳機等狀況時警報並立即調配運行。",
  },
];

export default function CarbonReductionPage() {
  return (
    <>
      <ServiceHeader
        eyebrow="CARBON REDUCTION · 減碳行動"
        title="以數據驅動的減碳行動"
        tagline="以系統化碳盤查與智能監控，協助企業落實 ESG 與淨零。"
      />

      {/* 為何推動 ESG */}
      <ServiceSection variant="muted">
        <SectionHeading
          eyebrow="WHY ESG · 為何推動 ESG"
          title="ESG 不只是責任，更是策略"
        />
        <p className="text-text-muted max-w-[760px] text-[17px] leading-[1.75]">
          管理風險、滿足投資者需求、遵守法律、提升品牌形象與競爭優勢，同時提高員工滿意度與創新效率——既是社會責任，也是帶來商業利益的策略。
        </p>
      </ServiceSection>

      {/* 碳盤查流程 */}
      <ServiceSection>
        <SectionHeading
          eyebrow="AUDIT FLOW · 碳盤查流程"
          title="空壓設備碳盤查流程"
        />
        <ol className="flex flex-wrap items-stretch gap-3">
          {AUDIT_FLOW.map((stage, index) => (
            <li
              key={stage}
              className="border-border bg-surface flex items-center gap-3 rounded-[12px] border px-4 py-3"
            >
              <span
                className="bg-primary-soft/25 text-primary-deep flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[15px] font-bold"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <span className="text-ink text-[16px] font-medium">{stage}</span>
            </li>
          ))}
        </ol>
        <p className="text-text-muted max-w-[760px] text-[16px] leading-[1.7]">
          其中「數據收集」最優先也最重要：①收集所有空壓設備基本資訊（型號、功率、運行時間、負載）②確定每台設備能源消耗量（kWh）。
        </p>
      </ServiceSection>

      {/* 數據收集設備 */}
      <ServiceSection variant="muted">
        <SectionHeading
          eyebrow="DEVICES · 數據收集設備"
          title="即時監控的智能量測設備"
        />
        <IconCards cards={DEVICES} />
      </ServiceSection>

      <ServiceCtaBanner
        title="準備好啟動空壓設備碳盤查了嗎？"
        description="預約能源診斷，我們將協助您導入智能監控設備，落實 ESG 與淨零目標。"
      />
    </>
  );
}
