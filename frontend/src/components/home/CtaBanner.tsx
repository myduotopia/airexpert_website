import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Section 8 — CTA banner (bg surface-dark). Centered, closes the page before
// the shell Footer.
export function CtaBanner() {
  return (
    <section className="bg-surface-dark">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-[18px] px-6 py-16 text-center md:px-20">
        <h2 className="max-w-[760px] text-[30px] leading-tight font-bold text-white md:text-[38px]">
          準備好讓氣源系統更節能了嗎？
        </h2>
        <p className="text-text-on-dark-muted max-w-[620px] text-[18px] leading-[1.6]">
          預約能源診斷，我們將協助評估節能與減碳潛力，量身規劃最合適的氣源配置。
        </p>
        {/* Spec calls for bg `primary`, but white text on #2F8F5C fails WCAG AA
            (4.04:1). Use `primary-deep` for the white-text CTA, matching the
            Header precedent and the design-system token guidance. */}
        <Link
          href="/contact"
          className="bg-primary-deep mt-2 inline-flex items-center justify-center gap-2 rounded-[26px] px-7 py-[15px] text-[17px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          預約能源診斷
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
