import { HOME_COLORS } from "@/components/home/tokens";
import type { HomePartners } from "@/lib/data/home";

// Section 4 — Partners (bg surface-muted). Text wordmarks, not real logos.
// Content from site_settings `home_partners`.
export function Partners({ content }: { content: HomePartners }) {
  return (
    <section className="bg-surface-muted">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-6 px-6 py-12 text-center md:px-20">
        <p className="text-text-muted font-mono text-[14px] tracking-[1px]">
          {content.label}
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-14 gap-y-6">
          {content.logos.map((name) => (
            <li
              key={name}
              className="text-[24px] font-bold"
              style={{ color: HOME_COLORS.logoMuted }}
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
