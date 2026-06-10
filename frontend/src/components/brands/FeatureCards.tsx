import type { LucideIcon } from "lucide-react";

// Responsive card grid for brand feature / technical-advantage blocks. Mirrors
// the home ProductOverview card styling (bordered white cards, mint icon chip).
export type FeatureCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type FeatureCardsProps = {
  items: FeatureCard[];
  /** Desktop column count; defaults to 3-up. */
  columns?: 2 | 3;
};

export function FeatureCards({ items, columns = 3 }: FeatureCardsProps) {
  const gridCols =
    columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";

  return (
    <ul className={`grid grid-cols-1 gap-5 ${gridCols}`}>
      {items.map(({ icon: Icon, title, description }) => (
        <li
          key={title}
          className="border-border bg-surface flex flex-col gap-4 rounded-[14px] border p-[26px]"
        >
          <span className="bg-surface-muted flex h-[46px] w-[46px] items-center justify-center rounded-full">
            <Icon
              className="text-primary-deep h-[22px] w-[22px]"
              aria-hidden="true"
            />
          </span>
          <h3 className="text-ink text-[18px] leading-snug font-semibold">
            {title}
          </h3>
          <p className="text-text-muted text-[14px] leading-[1.7]">
            {description}
          </p>
        </li>
      ))}
    </ul>
  );
}
