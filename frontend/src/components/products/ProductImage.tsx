import Image from "next/image";
import type { MediaImage } from "@/lib/types";
import { ImagePlaceholderIcon } from "./icons";

type ProductImageProps = {
  /** First/primary image is usually passed; null/undefined renders a placeholder. */
  image?: MediaImage | null;
  /** Accessible fallback alt when the media has none (e.g. the product name). */
  fallbackAlt: string;
  /** `sizes` hint forwarded to next/image for responsive selection. */
  sizes?: string;
  className?: string;
  /** Mark the primary above-the-fold image as priority. */
  priority?: boolean;
};

/**
 * Renders a product photo with `next/image`, or a tasteful tinted placeholder
 * block when no real asset exists yet (product data is imported in issue #8).
 *
 * Remote Supabase Storage URLs are allowed via `next.config.ts` remotePatterns.
 * The parent must establish the aspect ratio / size (this fills its container).
 */
export function ProductImage({
  image,
  fallbackAlt,
  sizes,
  className,
  priority,
}: ProductImageProps) {
  const url = image?.url?.trim();

  if (!url) {
    // TODO(#8): replace with real product imagery once content is imported.
    return (
      <div
        className={`bg-surface-muted text-border flex items-center justify-center ${className ?? ""}`}
        aria-hidden="true"
      >
        <ImagePlaceholderIcon size={40} />
      </div>
    );
  }

  return (
    <Image
      src={url}
      alt={image?.alt?.trim() || fallbackAlt}
      fill
      sizes={sizes ?? "(max-width: 768px) 100vw, 33vw"}
      priority={priority}
      className={`object-cover ${className ?? ""}`}
    />
  );
}
