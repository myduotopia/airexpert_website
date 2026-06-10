import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";

export type ServiceLink = {
  icon: LucideIcon;
  title: string;
  /** One-line summary (each sub-page's tagline). */
  summary: string;
  href: string;
};

type ServiceIndexCardProps = {
  service: ServiceLink;
};

/** Linked card for the /services index: icon chip + title + summary + arrow. */
export function ServiceIndexCard({ service }: ServiceIndexCardProps) {
  const { icon: Icon, title, summary, href } = service;
  return (
    <Link
      href={href}
      className="border-border bg-surface focus-visible:ring-primary hover:border-primary group flex flex-col gap-4 rounded-[16px] border p-6 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="bg-primary-soft/25 text-primary-deep flex h-[46px] w-[46px] items-center justify-center rounded-[23px]">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h2 className="text-ink text-[18px] font-semibold">{title}</h2>
      <p className="text-text-muted text-[14px] leading-[1.65]">{summary}</p>
      <span className="text-primary-deep mt-auto inline-flex items-center gap-1 text-[14px] font-medium">
        了解更多
        <ArrowRight
          className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </span>
    </Link>
  );
}
