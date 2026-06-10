// Section 3 — Stats (bg white, top+bottom border). Four stat blocks. Collapses
// 4-up → 2-up on small screens.
type Stat = {
  value: string;
  label: string;
};

const STATS: Stat[] = [
  { value: "1997", label: "成立年份 · 台灣製造" },
  { value: "800+", label: "信賴製造廠" },
  { value: "35%", label: "平均節能效益" },
  { value: "12k", label: "年減碳 tCO₂e" },
];

export function StatBar() {
  return (
    <section className="border-border bg-surface border-y">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-8 px-6 py-11 md:grid-cols-4 md:px-20">
        {STATS.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <span className="text-primary-deep font-mono text-[44px] leading-none font-bold">
              {stat.value}
            </span>
            <span className="text-text-muted text-[15px]">{stat.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
