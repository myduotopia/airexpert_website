import Link from "next/link";
import { ArrowRight } from "lucide-react";

type ServiceCtaBannerProps = {
  title?: string;
  description?: string;
  ctaLabel?: string;
};

/**
 * Dark closing CTA banner (bg surface-dark) → /contact, matching the home
 * page's CtaBanner. Defaults are tuned for the services context; pages may
 * override the copy. White text sits on `primary-deep` for WCAG AA.
 */
export function ServiceCtaBanner({
  title = "想為廠內氣源系統量身規劃節能方案？",
  description = "預約能源診斷，我們將實地檢測空壓設備狀況，提供數據分析與最合適的節能與減碳建議。",
  ctaLabel = "預約能源診斷",
}: ServiceCtaBannerProps) {
  return (
    <section className="bg-surface-dark">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-[18px] px-6 py-16 text-center md:px-20">
        <h2 className="max-w-[760px] text-[30px] leading-tight font-bold text-white md:text-[38px]">
          {title}
        </h2>
        <p className="text-text-on-dark-muted max-w-[620px] text-[18px] leading-[1.6]">
          {description}
        </p>
        <Link
          href="/contact"
          className="bg-primary-deep focus-visible:ring-primary-soft mt-2 inline-flex items-center justify-center gap-2 rounded-[26px] px-7 py-[15px] text-[17px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
