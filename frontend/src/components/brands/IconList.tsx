import type { LucideIcon } from "lucide-react";

// Bordered icon list for itemized brand content (equipment lists, technique
// bullet points). Renders as a 1- or 2-column grid; each row is an icon chip +
// label. Reuses the TechSection list-row styling.
type IconListProps = {
  items: string[];
  /** Glyph shown in every chip (a single shared lucide icon). */
  icon: LucideIcon;
  /** Desktop column count; defaults to 2-up. */
  columns?: 1 | 2;
};

export function IconList({ items, icon: Icon, columns = 2 }: IconListProps) {
  const gridCols = columns === 2 ? "sm:grid-cols-2" : "";

  return (
    <ul className={`grid grid-cols-1 gap-3 ${gridCols}`}>
      {items.map((item) => (
        <li
          key={item}
          className="border-border bg-surface flex items-start gap-3 rounded-[12px] border p-4"
        >
          <span className="bg-surface-muted flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
            <Icon
              className="text-primary-deep h-[18px] w-[18px]"
              aria-hidden="true"
            />
          </span>
          <span className="text-ink pt-1.5 text-[14px] leading-[1.5]">
            {item}
          </span>
        </li>
      ))}
    </ul>
  );
}
