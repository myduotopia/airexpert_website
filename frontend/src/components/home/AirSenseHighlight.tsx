import { Cloud } from "lucide-react";

// AirSense highlight panel (within Overview). Horizontal on desktop, stacks on
// mobile. Right column shows three compact stat cards.
type HighlightStat = {
  value: string;
  label: string;
};

const STATS: HighlightStat[] = [
  { value: "−35%", label: "能耗" },
  { value: "24/7", label: "遠端監控" },
  { value: "−60%", label: "停機" },
];

export function AirSenseHighlight() {
  return (
    <div className="border-border bg-surface-muted flex flex-col gap-8 rounded-[18px] border p-9 lg:flex-row lg:items-center">
      {/* Left col */}
      <div className="flex flex-1 flex-col gap-4">
        {/* White-text pill → primary-deep for WCAG AA (primary is only 4.04:1
            against white text). Consistent with Header/CTA precedent. */}
        <span className="bg-primary-deep inline-flex w-fit items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-white">
          <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-mono text-[11px] font-bold tracking-[0.5px]">
            AIRSENSE CLOUD
          </span>
        </span>
        <h3 className="text-ink text-[26px] leading-tight font-bold md:text-[30px]">
          智慧監控雲端平台
        </h3>
        <p className="text-text-muted text-[15px] leading-[1.6]">
          即時監測壓力、流量與耗能，結合 ISO 50001
          能源管理框架，量化每一度節能成效。
        </p>
      </div>

      {/* Right col — stat cards */}
      <div className="grid grid-cols-3 gap-4 lg:w-[420px] lg:shrink-0">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="border-border bg-surface flex flex-col items-center gap-1 rounded-[12px] border p-5 text-center"
          >
            <span className="text-primary-deep font-mono text-[22px] font-bold md:text-[26px]">
              {stat.value}
            </span>
            <span className="text-text-muted text-[12px]">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
