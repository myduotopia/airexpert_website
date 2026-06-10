import type { Metadata } from "next";
import { Battery, Droplets, Globe, Layers, Sparkles } from "lucide-react";
import { BrandHeader } from "@/components/brands/BrandHeader";
import { BrandSection } from "@/components/brands/BrandSection";
import { BrandSplit } from "@/components/brands/BrandSplit";
import { BrandImagePlaceholder } from "@/components/brands/BrandImagePlaceholder";
import { IconList } from "@/components/brands/IconList";
import { StatHighlight, type Stat } from "@/components/brands/StatHighlight";
import {
  FeatureCards,
  type FeatureCard,
} from "@/components/brands/FeatureCards";
import { BrandCta } from "@/components/brands/BrandCta";

export const metadata: Metadata = {
  title: "DELTECH — 來自 SPX FLOW 的相變節能乾燥技術",
  description:
    "DELTECH 隸屬全球領先供應商 SPX FLOW，其 PCM 相變節能乾燥機運用相變材料潛熱儲能，節能高達 99%，並提供無耗氣自動排水與接近無油的壓縮空氣處理。",
};

const PCM_POINTS: string[] = [
  "應用 PCM 相變材料（已註冊專利）",
  "採用內含 PCM 的不鏽鋼釺焊板式換熱器",
  "依壓縮空氣熱負荷調控冷媒壓縮機啟停",
];

const STATS: Stat[] = [
  { value: "99%", label: "節能高達 99%，最短時間內回收投資成本。" },
  {
    value: "99.8%",
    label: "內置冷聚結（Cold Coalescing）過濾器，濾除油氣效率高達 99.8%。",
  },
];

const PROCESSING: FeatureCard[] = [
  {
    icon: Droplets,
    title: "無耗氣自動排水裝置（No Loss Drain）",
    description:
      "靜電容量感測器；排放冷卻水時無壓縮空氣耗損；操作異常時自動轉為定時模式。",
  },
  {
    icon: Sparkles,
    title: "除油效果接近無油（Oil free）",
    description:
      "PCM28.1J 或更大機型內置冷聚結（Cold Coalescing）過濾器，濾除油氣效率高達 99.8%。",
  },
];

export default function DeltechPage() {
  return (
    <>
      <BrandHeader
        eyebrow="DELTECH · 品牌介紹"
        name="DELTECH"
        tagline="來自 SPX FLOW 的相變節能乾燥技術。"
      />

      {/* Brand introduction — SPX FLOW */}
      <BrandSection
        eyebrow="SPX FLOW · 品牌介紹"
        title="全球領先的流體技術供應商"
      >
        <BrandSplit
          aside={
            <BrandImagePlaceholder label="SPX FLOW HQ" className="h-[300px]" />
          }
        >
          <p className="text-text-muted text-[17px] leading-[1.8] md:text-[18px]">
            SPX FLOW
            總部位於美國北卡羅來納州夏洛特市，是全球領先供應商，提供高度工程化的流體組件、製程設備、統包系統工程及相關售後備件與服務；服務食品飲料、能源電力、通用工業三大市場，年銷售額超過
            20 億美金，在全球超過 35 個國家設分支機構、150
            多個國家有銷售辦事處。
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            <li className="text-ink flex items-start gap-3 text-[16px] leading-[1.6]">
              <Globe
                className="text-primary-deep mt-0.5 h-[18px] w-[18px] shrink-0"
                aria-hidden="true"
              />
              年銷售額超過 20 億美金
            </li>
            <li className="text-ink flex items-start gap-3 text-[16px] leading-[1.6]">
              <Globe
                className="text-primary-deep mt-0.5 h-[18px] w-[18px] shrink-0"
                aria-hidden="true"
              />
              全球 35+ 國設分支機構，150+ 國有銷售辦事處
            </li>
          </ul>
        </BrandSplit>
      </BrandSection>

      {/* Deltech PCM dryer */}
      <BrandSection
        tone="muted"
        eyebrow="PCM · 相變節能乾燥機"
        title="Deltech PCM 相變節能乾燥機"
      >
        <BrandSplit
          reverse
          aside={
            <BrandImagePlaceholder
              label="Deltech PCM Dryer"
              className="h-[300px]"
            />
          }
        >
          <p className="text-text-muted text-[17px] leading-[1.8] md:text-[18px]">
            利用相變材料（PCM）的潛熱儲能特性，可大幅降低冷媒壓縮機運轉時間，讓冷凍式乾燥機不必持續運轉。適用
            20~3000 馬力的空壓機。
          </p>
          <div className="text-ink mt-6 flex items-start gap-3 text-[16px] leading-[1.6]">
            <Battery
              className="text-primary-deep mt-0.5 h-[18px] w-[18px] shrink-0"
              aria-hidden="true"
            />
            適用 20~3000 馬力空壓機
          </div>
        </BrandSplit>
      </BrandSection>

      {/* Unique PCM energy-storage technology */}
      <BrandSection
        eyebrow="TECHNOLOGY · 相變式儲能"
        title="獨一無二的相變式儲能技術"
        lead="以已註冊專利的 PCM 相變材料為核心，依熱負荷智慧調控冷媒壓縮機啟停。"
      >
        <IconList items={PCM_POINTS} icon={Layers} columns={1} />
      </BrandSection>

      {/* Best-in-class performance stats */}
      <BrandSection
        tone="muted"
        eyebrow="PERFORMANCE · 最佳效能"
        title="節能與除油的雙重突破"
      >
        <StatHighlight stats={STATS} />
      </BrandSection>

      {/* Air processing features */}
      <BrandSection
        eyebrow="PROCESSING · 壓縮空氣處理"
        title="無耗氣排水與接近無油的潔淨空氣"
      >
        <FeatureCards items={PROCESSING} columns={2} />
      </BrandSection>

      <BrandCta
        title="想用 Deltech 相變技術節省乾燥能耗？"
        description="預約專人談話，我們將協助評估 PCM 相變節能乾燥機為您帶來的節能效益。"
      />
    </>
  );
}
