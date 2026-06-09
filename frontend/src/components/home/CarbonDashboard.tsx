import { TrendingDown } from "lucide-react";
import { HOME_COLORS } from "@/components/home/tokens";

// Carbon dashboard card (left side of the Tech section). The bar chart is built
// with flex bars — each bar's flex-grow weight comes from its spec height, so
// the row fills the fixed ~170px track without absolute positioning.
type Bar = {
  year: string;
  weight: number;
};

// Spec heights 150,138,120,112,96,80,66 used as relative flex weights.
const BARS: Bar[] = [
  { year: "19", weight: 150 },
  { year: "20", weight: 138 },
  { year: "21", weight: 120 },
  { year: "22", weight: 112 },
  { year: "23", weight: 96 },
  { year: "24", weight: 80 },
  { year: "25", weight: 66 },
];

const MAX_WEIGHT = 150;

export function CarbonDashboard() {
  return (
    <div className="border-border bg-surface flex flex-col gap-5 rounded-2xl border p-6">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-ink text-[15px] font-semibold">
            年度碳排放趨勢
          </span>
          <span className="text-text-muted font-mono text-[11px]">
            tCO₂e · 2019–2025
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1 rounded-[20px] px-2.5 py-1"
          style={{ backgroundColor: HOME_COLORS.chipMint }}
        >
          <TrendingDown
            className="text-primary-deep h-3.5 w-3.5"
            aria-hidden="true"
          />
          <span className="text-primary-deep font-mono text-[12px] font-bold">
            −42%
          </span>
        </span>
      </div>

      {/* Big number */}
      <div className="flex items-baseline gap-2">
        <span className="text-ink font-mono text-[32px] leading-none font-bold md:text-[38px]">
          8,420
        </span>
        <span className="text-primary-deep font-mono text-[14px] font-bold">
          tCO₂e / yr
        </span>
      </div>

      {/* Bar chart — flex bars, no absolute positioning */}
      <div>
        <div
          className="flex h-[170px] items-end justify-between gap-2"
          role="img"
          aria-label="2019 至 2025 年度碳排放呈下降趨勢"
        >
          {BARS.map((bar, index) => {
            const isLast = index === BARS.length - 1;
            return (
              <div
                key={bar.year}
                className="flex flex-1 items-end self-stretch"
              >
                <div
                  className="w-full rounded-t-md"
                  style={{
                    height: `${(bar.weight / MAX_WEIGHT) * 100}%`,
                    backgroundColor: isLast
                      ? "var(--color-primary)"
                      : HOME_COLORS.logoMuted,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between gap-2">
          {BARS.map((bar) => (
            <span
              key={bar.year}
              className="text-text-muted flex-1 text-center font-mono text-[11px]"
            >
              {bar.year}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
