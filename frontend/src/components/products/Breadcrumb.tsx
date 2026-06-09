import Link from "next/link";
import { Fragment } from "react";

type Crumb = {
  label: string;
  href?: string;
};

type BreadcrumbProps = {
  items: Crumb[];
};

/**
 * Product breadcrumb band: surface-muted bg, bottom border, mono 12.
 * Linked crumbs render as `<Link>`; the last (current) crumb is plain text in
 * primary-deep. Separators use the border colour.
 */
export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav
      aria-label="麵包屑"
      className="bg-surface-muted border-border border-b"
    >
      <ol className="text-text-muted mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 px-6 py-3.5 font-mono text-[12px] md:px-20">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 ? (
                <span className="text-border" aria-hidden="true">
                  /
                </span>
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="hover:text-ink transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? "text-primary-deep" : undefined}
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
