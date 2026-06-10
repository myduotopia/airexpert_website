import type { ReactNode } from "react";

type ServiceSectionProps = {
  /** Alternates the section background; `muted` adds top/bottom borders. */
  variant?: "surface" | "muted";
  children: ReactNode;
};

/**
 * Section wrapper enforcing the design's white ↔ light-green alternation,
 * 80px desktop gutter and 1440 max width. `muted` sections also get the
 * 1px green-grey top/bottom borders per the design system.
 */
export function ServiceSection({
  variant = "surface",
  children,
}: ServiceSectionProps) {
  const tone =
    variant === "muted"
      ? "bg-surface-muted border-border border-y"
      : "bg-surface";

  return (
    <section className={tone}>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-8 px-6 py-16 md:px-20 md:py-20">
        {children}
      </div>
    </section>
  );
}

type SectionHeadingProps = {
  /** Optional mono uppercase eyebrow. */
  eyebrow?: string;
  title: string;
  /** Renders as `h2` by default; pass `h3` for nested groups. */
  as?: "h2" | "h3";
};

/** Eyebrow + heading pair used at the top of a section. */
export function SectionHeading({
  eyebrow,
  title,
  as: Tag = "h2",
}: SectionHeadingProps) {
  return (
    <div className="flex flex-col gap-2">
      {eyebrow ? (
        <p className="text-text-muted font-mono text-[12px] tracking-[1px] uppercase">
          {eyebrow}
        </p>
      ) : null}
      <Tag className="text-ink text-[24px] leading-tight font-bold sm:text-[30px]">
        {title}
      </Tag>
    </div>
  );
}
