import type { HomeStats } from "@/lib/data/home";

// Section 3 — Stats (bg white, top+bottom border). Stat blocks collapse
// 4-up → 2-up on small screens. Content from site_settings `home_stats`.
export function StatBar({ content }: { content: HomeStats }) {
  return (
    <section className="border-border bg-surface border-y">
      <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-8 px-6 py-11 md:grid-cols-4 md:px-20">
        {content.items.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-3">
            {/* brass 漸層金屬細線（暖金屬點綴） */}
            <span
              aria-hidden="true"
              className="h-[3px] w-[72px] rounded-[2px] bg-[linear-gradient(90deg,var(--color-brass-deep),var(--color-brass)_35%,transparent)]"
            />
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
