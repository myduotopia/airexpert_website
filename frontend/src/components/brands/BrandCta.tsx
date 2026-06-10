import Link from "next/link";
import { ArrowRight } from "lucide-react";

// Closing dark CTA banner for brand pages (bg surface-dark) → /contact. Mirrors
// the home CtaBanner; copy is configurable per brand.
type BrandCtaProps = {
  /** Banner heading. */
  title: string;
  /** Supporting line under the heading. */
  description: string;
};

export function BrandCta({ title, description }: BrandCtaProps) {
  return (
    <section className="bg-surface-dark">
      <div className="mx-auto flex max-w-[1440px] flex-col items-center gap-[18px] px-6 py-16 text-center md:px-20">
        <h2 className="max-w-[760px] text-[30px] leading-tight font-bold text-white md:text-[38px]">
          {title}
        </h2>
        <p className="text-text-on-dark-muted max-w-[620px] text-[18px] leading-[1.6]">
          {description}
        </p>
        {/* Use primary-deep (not primary) so white text passes WCAG AA, matching
            the home CtaBanner and Header CTA precedent. */}
        <Link
          href="/contact"
          className="bg-primary-deep focus-visible:ring-primary-soft mt-2 inline-flex items-center justify-center gap-2 rounded-[26px] px-7 py-[15px] text-[17px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:outline-none"
        >
          預約專人談話
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
