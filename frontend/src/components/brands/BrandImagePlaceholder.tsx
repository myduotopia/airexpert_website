import { ImageIcon } from "lucide-react";

// Tinted placeholder block standing in for real brand imagery (none licensed
// yet). Decorative — hidden from assistive tech. The caller sets the height /
// aspect ratio via className.
type BrandImagePlaceholderProps = {
  /** Short caption describing the intended image (visible label). */
  label: string;
  className?: string;
};

export function BrandImagePlaceholder({
  label,
  className,
}: BrandImagePlaceholderProps) {
  // TODO(#7): replace with real licensed brand imagery once provided.
  return (
    <div
      className={`bg-surface-muted border-border text-text-muted flex flex-col items-center justify-center gap-3 rounded-[16px] border ${
        className ?? "h-[280px]"
      }`}
      aria-hidden="true"
    >
      <ImageIcon className="h-8 w-8" />
      <span className="font-mono text-[11px] tracking-[0.5px] uppercase">
        {label}
      </span>
    </div>
  );
}
