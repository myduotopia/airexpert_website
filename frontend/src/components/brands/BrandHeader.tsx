// Brand-page header band (bg white, bottom border). Mono eyebrow + H1 brand
// name + one-line tagline. Mirrors the products page header rhythm.
type BrandHeaderProps = {
  /** Mono eyebrow label, e.g. "BRAND · 品牌介紹". */
  eyebrow: string;
  /** Brand name rendered as the page H1. */
  name: string;
  /** One-line tagline shown under the name. */
  tagline: string;
};

export function BrandHeader({ eyebrow, name, tagline }: BrandHeaderProps) {
  return (
    <section className="bg-surface border-border border-b">
      <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-20 md:py-20">
        <p className="text-text-muted font-mono text-[14px] tracking-[1px] uppercase">
          {eyebrow}
        </p>
        <h1 className="text-ink mt-3 text-[36px] leading-[1.12] font-bold sm:text-[44px]">
          {name}
        </h1>
        <p className="text-text-muted mt-4 max-w-[640px] text-[18px] leading-[1.65] md:text-[20px]">
          {tagline}
        </p>
      </div>
    </section>
  );
}
