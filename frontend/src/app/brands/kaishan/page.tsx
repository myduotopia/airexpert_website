import type { Metadata } from "next";
import {
  Award,
  CircleDot,
  Cog,
  Cpu,
  MapPin,
  SlidersHorizontal,
} from "lucide-react";
import { BrandHeader } from "@/components/brands/BrandHeader";
import { BrandSection } from "@/components/brands/BrandSection";
import { BrandSplit } from "@/components/brands/BrandSplit";
import { BrandImagePlaceholder } from "@/components/brands/BrandImagePlaceholder";
import { IconList } from "@/components/brands/IconList";
import {
  FeatureCards,
  type FeatureCard,
} from "@/components/brands/FeatureCards";
import { BrandCta } from "@/components/brands/BrandCta";

export const metadata: Metadata = {
  title: "KAISHAN 開山 — 世界頂級的技術研發能力",
  description:
    "KAISHAN 開山在湯炎博士帶領下，整合北美、上海與衢州研發據點，搭配世界頂級加工檢測設備，打造永磁變頻螺旋式空壓機等世界領先的高新技術產品。",
};

const EQUIPMENT: string[] = [
  "日本三井 MHU630A 加工中心",
  "德國 KAPP 線上檢測轉子磨床",
  "英國 HOLROYD 數控螺旋式轉子磨床",
  "德國 HERMEL 五軸加工中心",
  "義大利進口落地式鏜銑加工中心",
  "德國 TRUMPF 柔性鈑金加工系統",
  "瑞士 KLINGELNBERG 轉子動態測量儀",
];

const TECH_ADVANTAGES: FeatureCard[] = [
  {
    icon: CircleDot,
    title: "螺旋主機能效",
    description:
      "主機軸承與 SKF 共同開發專用軸承，軸承數量達 9 個（業內其他品牌一般僅 6 個），確保壽命與性能。",
  },
  {
    icon: Cpu,
    title: "高效永磁同步馬達",
    description:
      "採特種稀土永磁材料，調節範圍更寬、效率更高；內置油冷卻全封閉結構（IP65），耐熱達 180°C（較同類 120°C 提升 50%）；轉子稀土永磁化、功率因數接近 1、調速誤差 1/30000。",
  },
  {
    icon: SlidersHorizontal,
    title: "永磁變頻控制",
    description:
      "專利弱磁控制 + 壓力控制 + 永磁馬達開環控制，適應惡劣環境；無需轉子轉角位置感測器；母線電壓利用率 >93%；PID 控制 + 恆功控制技術，提供穩定供氣壓力。",
  },
];

export default function KaishanPage() {
  return (
    <>
      <BrandHeader
        eyebrow="KAISHAN · 品牌介紹"
        name="開山 KAISHAN"
        tagline="世界頂級的技術研發能力。"
      />

      {/* R&D centres */}
      <BrandSection eyebrow="R&D · 美國研發中心" title="美國研發中心傾力製作">
        <BrandSplit
          aside={
            <BrandImagePlaceholder
              label="KAISHAN R&D Center"
              className="h-[300px]"
            />
          }
        >
          <p className="text-text-muted text-[15px] leading-[1.8] md:text-[16px]">
            研發團隊在湯炎博士帶領下，按北美研發中心完成的模型設計提供參數設計，上海研發中心進行圖紙設計，衢州技術中心開展工藝設計的分工，開發出大量擁有自主知識產權、世界領先的高新技術產品。
          </p>
          <ul className="mt-6 flex flex-col gap-3">
            <li className="text-ink flex items-start gap-3 text-[14px] leading-[1.6]">
              <MapPin
                className="text-primary-deep mt-0.5 h-[18px] w-[18px] shrink-0"
                aria-hidden="true"
              />
              美國西雅圖北美研發中心（Jersey North America Development Center）
            </li>
            <li className="text-ink flex items-start gap-3 text-[14px] leading-[1.6]">
              <MapPin
                className="text-primary-deep mt-0.5 h-[18px] w-[18px] shrink-0"
                aria-hidden="true"
              />
              美國工廠 Alabama Baldwin（阿拉巴馬州）
            </li>
          </ul>
        </BrandSplit>
      </BrandSection>

      {/* Dr. Tang Yan — person card */}
      <BrandSection tone="muted" eyebrow="EXPERT · 核心人物" title="核心人物">
        <BrandSplit
          reverse
          aside={
            <BrandImagePlaceholder label="Dr. Tang Yan" className="h-[300px]" />
          }
        >
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <span className="bg-surface border-border flex h-[46px] w-[46px] items-center justify-center rounded-full border">
                <Award
                  className="text-primary-deep h-[22px] w-[22px]"
                  aria-hidden="true"
                />
              </span>
              <h3 className="text-ink text-[24px] font-bold">湯炎 博士</h3>
            </div>
            <p className="text-text-muted text-[15px] leading-[1.8] md:text-[16px]">
              全球為數不多最頂尖的螺旋式壓縮機專家之一，海外二十餘年領導數家世界著名壓縮機公司的膨脹發電站、天然氣、冷媒及空氣壓縮機產品開發，擁有多項美國專利。發明的
              T、α、Y
              型線應用於多家世界知名壓縮機公司產品，約佔每年全球螺旋式產品 15%
              左右。
            </p>
          </div>
        </BrandSplit>
      </BrandSection>

      {/* World-class equipment */}
      <BrandSection
        eyebrow="EQUIPMENT · 加工 / 檢測設備"
        title="世界頂級加工 / 檢測設備"
        lead="導入全球頂尖工具機與量測儀器，從轉子磨削到動態測量全程把關精度。"
      >
        <IconList items={EQUIPMENT} icon={Cog} columns={2} />
      </BrandSection>

      {/* Permanent-magnet VSD screw compressor advantages */}
      <BrandSection
        tone="muted"
        eyebrow="TECHNOLOGY · 技術優勢"
        title="開山永磁變頻螺旋式空壓機"
        lead="從主機軸承、永磁同步馬達到變頻控制，三大核心技術協同提升能效與穩定度。"
      >
        <FeatureCards items={TECH_ADVANTAGES} columns={3} />
      </BrandSection>

      <BrandCta
        title="想導入開山永磁變頻螺旋式空壓機？"
        description="預約專人談話，我們將依您的用氣需求評估最合適的機種與節能配置。"
      />
    </>
  );
}
