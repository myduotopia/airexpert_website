import type { ReactNode } from "react";

// Generic content section for brand pages. Alternates background per the design
// system (white ↔ surface-muted) and renders an optional mono eyebrow + H2
// heading block above its children. Muted sections also get top+bottom borders,
// matching the home/product section rhythm.
type BrandSectionProps = {
  /** Background tone — alternate "light" / "muted" down the page. */
  tone?: "light" | "muted";
  /** Optional mono eyebrow label above the heading. */
  eyebrow?: string;
  /** Optional H2 section heading. */
  title?: string;
  /** Optional lead paragraph under the heading. */
  lead?: string;
  children: ReactNode;
};

export function BrandSection({
  tone = "light",
  eyebrow,
  title,
  lead,
  children,
}: BrandSectionProps) {
  const surface =
    tone === "muted" ? "bg-surface-muted border-border border-y" : "bg-surface";

  return (
    <section className={surface}>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-16 md:px-20 md:py-20">
        {(eyebrow || title || lead) && (
          <div className="flex max-w-[760px] flex-col gap-3">
            {eyebrow && (
              <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
                {eyebrow}
              </p>
            )}
            {title && (
              <h2 className="text-ink text-[30px] leading-tight font-bold md:text-[36px]">
                {title}
              </h2>
            )}
            {lead && (
              <p className="text-text-muted text-[17px] leading-[1.7] md:text-[18px]">
                {lead}
              </p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
