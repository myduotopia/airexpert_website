import { CarbonDashboard } from "@/components/home/CarbonDashboard";
import { resolveIcon } from "@/components/home/tokens";
import type { HomeTech } from "@/lib/data/home";

// Section 6 — Tech / sustainability (bg surface-muted, top+bottom border).
// Two columns on desktop (carbon dashboard + copy & feature list); stacks on
// mobile. Copy/features from site_settings `home_tech`; the carbon dashboard
// chart is a fixed illustrative widget.
export function TechSection({ content }: { content: HomeTech }) {
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
            {content.eyebrow}
          </p>
          <h2 className="text-ink text-[30px] leading-tight font-bold md:text-[36px]">
            {content.title}
          </h2>
          <p className="text-text-muted text-[17px] leading-[1.6]">
            {content.description}
          </p>

          <ul className="flex flex-col">
            {content.features.map((feature, index) => {
              const Icon = resolveIcon(feature.icon);
              return (
                <li
                  key={feature.title}
                  className={`flex items-start gap-4 py-4 ${
                    index < content.features.length - 1
                      ? "border-border border-b"
                      : ""
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
                      {feature.title}
                    </span>
                    <span className="text-text-muted text-[15px] leading-[1.5]">
                      {feature.description}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
