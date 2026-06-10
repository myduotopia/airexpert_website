import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BrandHeader } from "@/components/brands/BrandHeader";
import { BrandSection } from "@/components/brands/BrandSection";

export const metadata: Metadata = {
  title: "品牌介紹",
  description:
    "AirExpert 代理的世界級氣源品牌：KAISHAN 開山的永磁變頻螺旋式空壓機技術，以及 DELTECH 來自 SPX FLOW 的相變節能乾燥技術。",
};

type BrandLink = {
  href: string;
  name: string;
  eyebrow: string;
  tagline: string;
};

const BRANDS: BrandLink[] = [
  {
    href: "/brands/kaishan",
    name: "開山 KAISHAN",
    eyebrow: "KAISHAN",
    tagline: "世界頂級的技術研發能力。",
  },
  {
    href: "/brands/deltech",
    name: "DELTECH",
    eyebrow: "DELTECH",
    tagline: "來自 SPX FLOW 的相變節能乾燥技術。",
  },
];

export default function BrandsIndexPage() {
  return (
    <>
      <BrandHeader
        eyebrow="BRANDS · 品牌介紹"
        name="世界級氣源品牌"
        tagline="精選代理具備頂尖研發與節能技術的國際品牌，為產業提供更高效、更潔淨的氣源解決方案。"
      />

      <BrandSection>
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {BRANDS.map((brand) => (
            <li key={brand.href}>
              <Link
                href={brand.href}
                className="border-border bg-surface hover:border-primary focus-visible:ring-primary group flex h-full flex-col gap-3 rounded-[16px] border p-8 transition-colors focus-visible:ring-2 focus-visible:outline-none"
              >
                <span className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
                  {brand.eyebrow}
                </span>
                <span className="text-ink text-[24px] font-bold">
                  {brand.name}
                </span>
                <span className="text-text-muted text-[15px] leading-[1.7]">
                  {brand.tagline}
                </span>
                <span className="text-primary-deep mt-2 inline-flex items-center gap-1 text-[14px] font-semibold">
                  了解更多
                  <ArrowRight
                    className="h-4 w-4 transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </BrandSection>
    </>
  );
}
