import type { LucideIcon } from "lucide-react";

export type IconCard = {
  icon: LucideIcon;
  title: string;
  description: string;
};

type IconCardsProps = {
  cards: IconCard[];
  /** Heading level for each card title (default `h3`). */
  titleAs?: "h3" | "h4";
};

/**
 * Responsive grid of icon cards: green icon chip + title + description.
 * Mirrors the products FeatureGrid styling. Used for 減碳行動 data-collection
 * devices and the /services index cards (which add links — see ServiceIndexCard).
 */
export function IconCards({ cards, titleAs: Tag = "h3" }: IconCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(({ icon: Icon, title, description }) => (
        <div
          key={title}
          className="border-border bg-surface flex flex-col gap-3.5 rounded-[14px] border p-5"
        >
          <span className="bg-primary-soft/25 text-primary-deep flex h-[42px] w-[42px] items-center justify-center rounded-[21px]">
            <Icon size={21} aria-hidden="true" />
          </span>
          <Tag className="text-ink text-[17px] font-semibold">{title}</Tag>
          <p className="text-text-muted text-[15px] leading-[1.6]">
            {description}
          </p>
        </div>
      ))}
    </div>
  );
}
