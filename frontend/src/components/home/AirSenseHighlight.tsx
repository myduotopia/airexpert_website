import { Cloud } from "lucide-react";
import type { HomeOverview } from "@/lib/data/home";

// AirSense highlight panel (within Overview). Horizontal on desktop, stacks on
// mobile. Right column shows three compact stat cards. Content from the
// `airsense` slice of site_settings `home_overview`.
export function AirSenseHighlight({
  content,
}: {
  content: HomeOverview["airsense"];
}) {
  return (
    <div className="border-border bg-surface-muted flex flex-col gap-8 rounded-[18px] border p-9 lg:flex-row lg:items-center">
      {/* Left col */}
      <div className="flex flex-1 flex-col gap-4">
        {/* White-text pill → primary-deep for WCAG AA (primary is only 4.04:1
            against white text). Consistent with Header/CTA precedent. */}
        <span className="bg-primary-deep inline-flex w-fit items-center gap-1.5 rounded-[20px] px-3 py-1.5 text-white">
          <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="font-mono text-[13px] font-bold tracking-[0.5px]">
            {content.badge}
          </span>
        </span>
        <h3 className="text-ink text-[28px] leading-tight font-bold md:text-[32px]">
          {content.title}
        </h3>
        <p className="text-text-muted text-[17px] leading-[1.6]">
          {content.description}
        </p>
      </div>

      {/* Right col — stat cards */}
      <div className="grid grid-cols-3 gap-4 lg:w-[420px] lg:shrink-0">
        {content.stats.map((stat) => (
          <div
            key={stat.label}
            className="border-border bg-surface flex flex-col items-center gap-1 rounded-[12px] border p-5 text-center"
          >
            <span className="text-primary-deep font-mono text-[24px] font-bold md:text-[28px]">
              {stat.value}
            </span>
            <span className="text-text-muted text-[14px]">{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
