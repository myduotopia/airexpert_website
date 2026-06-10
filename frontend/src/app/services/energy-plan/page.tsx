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
import { ServiceCtaBanner } from "@/components/services/ServiceCtaBanner";

export const metadata: Metadata = {
  title: "節能方案",
  description:
    "幫助客戶釐清節能觀念，從洽談諮詢、現場勘查到報告製作，製作符合每間工廠不同狀況的省電方案。",
};

const STEPS: NumberedStep[] = [
  {
    title: "洽談諮詢 / 觀念釐清",
    body: "了解客戶廠內需求、使用習慣及空壓機狀況，提供初步評估及後續規劃。",
  },
  {
    title: "現場勘查 / 效能檢測",
    body: "評估工廠環境（油氣、溫度對空壓機之影響），並用專業儀器檢測空壓機及乾燥機之排氣量、露點等級與耗電狀況。",
  },
  {
    title: "報告製作 / 會議討論",
    body: "以檢測數據及報表智能分析報告，分析廠內機台狀況，討論最佳節能方案。",
  },
];

export default function EnergyPlanPage() {
  return (
    <>
      <ServiceHeader
        eyebrow="ENERGY PLAN · 節能方案"
        title="量身打造的省電方案"
        tagline="幫助客戶釐清節能觀念，製作符合每間工廠不同狀況的省電方案。"
      />

      <ServiceSection variant="muted">
        <SectionHeading eyebrow="PROCESS · 服務流程" title="三步驟節能規劃" />
        <NumberedSteps steps={STEPS} />
      </ServiceSection>

      <ServiceCtaBanner
        title="想了解貴廠的節能潛力？"
        description="預約現場勘查與效能檢測，我們將以實測數據為您製作專屬的省電方案。"
      />
    </>
  );
}
