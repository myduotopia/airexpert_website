import { ImageIcon } from "lucide-react";

type ImagePlaceholderProps = {
  /** Accessible description of the intended imagery. */
  label: string;
  /** Tailwind height utility (e.g. "h-[280px]"). */
  heightClassName?: string;
};

/**
 * Tinted placeholder block standing in for real service imagery.
 * TODO: swap for `next/image` once the photo assets exist (register the remote
 * domain in next.config if hosted off-site).
 */
export function ImagePlaceholder({
  label,
  heightClassName = "h-[240px] md:h-[320px]",
}: ImagePlaceholderProps) {
  return (
    <div
      className={`border-border bg-surface-muted flex items-center justify-center rounded-2xl border ${heightClassName}`}
      role="img"
      aria-label={`${label}（待補正式素材）`}
    >
      <ImageIcon className="text-primary/40 h-10 w-10" aria-hidden="true" />
    </div>
  );
}
