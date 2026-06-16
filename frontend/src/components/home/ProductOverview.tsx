import { AirSenseHighlight } from "@/components/home/AirSenseHighlight";
import { HOME_COLORS, resolveIcon } from "@/components/home/tokens";
import type { HomeOverview } from "@/lib/data/home";

// Section 5 — Overview (bg white): product-systems heading, a 4-up card grid
// (4 → 2 → 1 responsive), then the AirSense highlight panel. Content from
// site_settings `home_overview`. Card icons map by name via resolveIcon.
export function ProductOverview({ content }: { content: HomeOverview }) {
  return (
    <section className="bg-surface">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-20 md:px-20">
        {/* Heading block */}
        <div className="mx-auto flex max-w-[720px] flex-col gap-3 text-center">
          <p className="text-primary-deep font-mono text-[14px] tracking-[1px]">
            {content.eyebrow}
          </p>
          <h2 className="text-ink text-[32px] leading-tight font-bold md:text-[40px]">
            {content.title}
          </h2>
        </div>

        {/* 4-card grid */}
        <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {content.products.map((product) => {
            const Icon = resolveIcon(product.icon);
            return (
              <li
                key={product.title}
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
                <h3 className="text-ink text-[20px] font-semibold">
                  {product.title}
                </h3>
                <p className="text-text-muted text-[15px] leading-[1.6]">
                  {product.description}
                </p>
              </li>
            );
          })}
        </ul>

        <AirSenseHighlight content={content.airsense} />
      </div>
    </section>
  );
}
