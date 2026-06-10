import { Ruler, BadgeCheck, LineChart, type LucideIcon } from "lucide-react";
import { CarbonDashboard } from "@/components/home/CarbonDashboard";

// Section 6 — Tech / sustainability (bg surface-muted, top+bottom border).
// Two columns on desktop (carbon dashboard + copy & feature list); stacks on
// mobile.
type Feature = {
  icon: LucideIcon;
  title: string;
  description: string;
};

const FEATURES: Feature[] = [
  {
    icon: Ruler,
    title: "用氣基線量測",
    description: "盤點全廠用氣量與耗能，建立可比較的減碳基準。",
  },
  {
    icon: BadgeCheck,
    title: "ISO 50001 導入",
    description: "依國際能源管理框架建置制度與績效指標。",
  },
  {
    icon: LineChart,
    title: "持續優化追蹤",
    description: "雲端數據持續監測，量化每一階段節能成效。",
  },
];

export function TechSection() {
  return (
    <section className="border-border bg-surface-muted border-y">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-12 px-6 py-20 md:px-20 lg:flex-row lg:items-center">
        {/* Left — carbon dashboard */}
        <div className="flex-1">
          <CarbonDashboard />
        </div>

        {/* Right — copy + feature list */}
        <div className="flex flex-col gap-5 lg:w-[520px] lg:shrink-0">
          <p className="text-primary-deep font-mono text-[14px] tracking-[1px]">
            SUSTAINABILITY · 永續節能
          </p>
          <h2 className="text-ink text-[30px] leading-tight font-bold md:text-[36px]">
            以數據實踐淨零承諾
          </h2>
          <p className="text-text-muted text-[17px] leading-[1.6]">
            從用氣基線量測到持續優化，導入 ISO 50001
            能源管理系統，讓每一度電與每一公斤碳排都被看見、被改善。
          </p>

          <ul className="flex flex-col">
            {FEATURES.map(({ icon: Icon, title, description }, index) => (
              <li
                key={title}
                className={`flex items-start gap-4 py-4 ${
                  index < FEATURES.length - 1 ? "border-border border-b" : ""
                }`}
              >
                <span className="border-border bg-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border">
                  <Icon
                    className="text-primary-deep h-[18px] w-[18px]"
                    aria-hidden="true"
                  />
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-ink text-[17px] font-semibold">
                    {title}
                  </span>
                  <span className="text-text-muted text-[15px] leading-[1.5]">
                    {description}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
