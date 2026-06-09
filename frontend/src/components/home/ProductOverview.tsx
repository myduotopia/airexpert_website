import { Wind, Gauge, Fan, Droplets, type LucideIcon } from "lucide-react";
import { AirSenseHighlight } from "@/components/home/AirSenseHighlight";
import { HOME_COLORS } from "@/components/home/tokens";

// Section 5 — Overview (bg white): product-systems heading, a 4-up card grid
// (4 → 2 → 1 responsive), then the AirSense highlight panel.
type ProductCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const PRODUCTS: ProductCard[] = [
  {
    icon: Wind,
    title: "空氣壓縮機",
    description: "無油與噴油螺旋、離心式機種，7.5–250 kW。",
  },
  {
    icon: Gauge,
    title: "真空泵浦",
    description: "乾式與水環式真空系統，穩定深真空表現。",
  },
  {
    icon: Fan,
    title: "鼓風機",
    description: "三葉羅茨與渦輪式，污水與氣力輸送應用。",
  },
  {
    icon: Droplets,
    title: "乾燥機",
    description: "冷凍式與吸附式乾燥，達 ISO 8573 露點。",
  },
];

export function ProductOverview() {
  return (
    <section className="bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-20 md:px-20">
        {/* Heading block */}
        <div className="mx-auto flex max-w-[720px] flex-col gap-3 text-center">
          <p className="text-primary-deep font-mono text-[12px] tracking-[1px]">
            PRODUCT SYSTEMS · 產品系列
          </p>
          <h2 className="text-ink text-[30px] leading-tight font-bold md:text-[38px]">
            完整節能氣源系統，單一窗口整合
          </h2>
        </div>

        {/* 4-card grid */}
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCTS.map(({ icon: Icon, title, description }) => (
            <li
              key={title}
              className="border-border bg-surface flex flex-col gap-4 rounded-[14px] border p-[26px]"
            >
              <span
                className="flex h-[46px] w-[46px] items-center justify-center rounded-full"
                style={{ backgroundColor: HOME_COLORS.chipMint }}
              >
                <Icon
                  className="text-primary h-[22px] w-[22px]"
                  aria-hidden="true"
                />
              </span>
              <h3 className="text-ink text-[18px] font-semibold">{title}</h3>
              <p className="text-text-muted text-[13px] leading-[1.6]">
                {description}
              </p>
            </li>
          ))}
        </ul>

        <AirSenseHighlight />
      </div>
    </section>
  );
}
