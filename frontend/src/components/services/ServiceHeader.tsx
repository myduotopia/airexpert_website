type ServiceHeaderProps = {
  /** Mono uppercase eyebrow, e.g. "ENERGY PLAN · 節能方案". */
  eyebrow: string;
  /** Page H1. */
  title: string;
  /** One-line tagline below the title. */
  tagline: string;
};

/**
 * Shared service page header band: mono eyebrow + H1 + tagline, on the white
 * surface with a bottom border (matches the products index header rhythm).
 */
export function ServiceHeader({ eyebrow, title, tagline }: ServiceHeaderProps) {
  return (
    <section className="bg-surface border-border border-b">
      <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-20 md:py-20">
        <p className="text-text-muted font-mono text-[14px] tracking-[1px] uppercase">
          {eyebrow}
        </p>
        <h1 className="text-ink mt-3 text-[32px] leading-[1.15] font-bold sm:text-[40px]">
          {title}
        </h1>
        <p className="text-text-muted mt-4 max-w-[680px] text-[17px] leading-[1.65]">
          {tagline}
        </p>
      </div>
    </section>
  );
}
