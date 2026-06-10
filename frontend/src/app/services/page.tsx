import type { Metadata } from "next";
import { ClipboardList, Cpu, Building2, Leaf } from "lucide-react";
import { ServiceHeader } from "@/components/services/ServiceHeader";
import { ServiceSection } from "@/components/services/ServiceSection";
import {
  ServiceIndexCard,
  type ServiceLink,
} from "@/components/services/ServiceIndexCard";
import { ServiceCtaBanner } from "@/components/services/ServiceCtaBanner";

export const metadata: Metadata = {
  title: "服務項目",
  description:
    "AirExpert 超勁賀空壓科技提供一站式節能氣源服務：節能方案、節能技術、機房規劃與減碳行動，協助工廠落實高效與淨零。",
};

const SERVICES: ServiceLink[] = [
  {
    icon: ClipboardList,
    title: "節能方案",
    summary: "幫助客戶釐清節能觀念，製作符合每間工廠不同狀況的省電方案。",
    href: "/services/energy-plan",
  },
  {
    icon: Cpu,
    title: "節能技術",
    summary: "利用有別於傳統空壓機及乾燥機的技術，提供客戶廠內最佳省電效益。",
    href: "/services/energy-tech",
  },
  {
    icon: Building2,
    title: "機房規劃",
    summary:
      "良好的管路佈置從規劃與施工初期做起，避免日後洩漏、腐蝕或壓降難以補救。",
    href: "/services/room-planning",
  },
  {
    icon: Leaf,
    title: "減碳行動",
    summary: "以系統化碳盤查與智能監控，協助企業落實 ESG 與淨零。",
    href: "/services/carbon-reduction",
  },
];

export default function ServicesIndexPage() {
  return (
    <>
      <ServiceHeader
        eyebrow="SERVICES · 服務項目"
        title="一站式節能氣源服務"
        tagline="從觀念釐清、技術導入到機房規劃與碳盤查，AirExpert 以完整服務協助工廠提升能源效率、邁向淨零。"
      />

      <ServiceSection>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SERVICES.map((service) => (
            <ServiceIndexCard key={service.href} service={service} />
          ))}
        </div>
      </ServiceSection>

      <ServiceCtaBanner />
    </>
  );
}
