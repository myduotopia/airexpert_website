import { ImageIcon } from "lucide-react";
import { HOME_COLORS } from "@/components/home/tokens";

// Section 2 — HeroImage band (bg surface-muted). Real industrial/clean-energy
// photo not yet available. TODO: replace this placeholder block with next/image
// once the asset exists (and register its domain in next.config if remote).
export function HeroImage() {
  return (
    <section className="bg-surface-muted">
      <div className="mx-auto max-w-[1440px] px-6 md:px-20">
        <div
          className="border-border flex h-[280px] items-center justify-center rounded-2xl border md:h-[460px]"
          style={{
            backgroundImage: `linear-gradient(to bottom right, ${HOME_COLORS.chipMint}, var(--color-border))`,
          }}
          role="img"
          aria-label="工業節能氣源系統情境照（待補正式素材）"
        >
          <ImageIcon className="text-primary/40 h-12 w-12" aria-hidden="true" />
        </div>
      </div>
    </section>
  );
}
