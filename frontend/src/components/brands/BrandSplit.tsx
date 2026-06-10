import type { ReactNode } from "react";

// Two-column editorial block: copy on one side, media/aside on the other. Used
// for alternating content rows inside a BrandSection. Stacks on mobile; the
// `reverse` flag flips column order on desktop for visual rhythm.
type BrandSplitProps = {
  /** Primary text column. */
  children: ReactNode;
  /** Secondary column (image placeholder, person card, etc.). */
  aside: ReactNode;
  /** Place the aside first on desktop. */
  reverse?: boolean;
};

export function BrandSplit({ children, aside, reverse }: BrandSplitProps) {
  return (
    <div className="flex flex-col gap-10 lg:flex-row lg:items-center lg:gap-14">
      <div className={`flex-1 ${reverse ? "lg:order-2" : ""}`}>{children}</div>
      <div className={`flex-1 ${reverse ? "lg:order-1" : ""}`}>{aside}</div>
    </div>
  );
}
