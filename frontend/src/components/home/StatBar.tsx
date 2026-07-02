"use client";

import type { HomeStats } from "@/lib/data/home";
import { AnimatedNumber, useInViewOnce } from "@/components/home/scrollAnimate";

// Section — 數字會說話。白底、上下框線；4 欄（手機 2 欄）。內容來自 site_settings
// `home_stats`。數字在區塊「底部」捲入視窗時由 0 往上 count-up（sentinel 觸發，
// 避免頂端剛露出就跑）。數值字串可含前後綴（100,000K / 550萬度+ / 63% / 1,000+）。
export function StatBar({ content }: { content: HomeStats }) {
  // sentinel 放在區塊底部：等區塊底部進入視窗才觸發。
  const { ref, inView } = useInViewOnce<HTMLSpanElement>();

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
            <span className="text-primary-deep font-mono text-[28px] leading-none font-bold tabular-nums sm:text-[34px] md:text-[44px]">
              <AnimatedNumber raw={stat.value} run={inView} />
            </span>
            <span className="text-text-muted text-[15px]">{stat.label}</span>
          </div>
        ))}
      </div>
      {/* 區塊底部偵測點：滑到此處（區塊底部露出）才啟動 count-up。 */}
      <span ref={ref} aria-hidden="true" className="block h-0 w-full" />
    </section>
  );
}
