import {
  Zap,
  ShieldCheck,
  Activity,
  Thermometer,
  VolumeX,
  Leaf,
  type LucideIcon,
} from "lucide-react";
import type { HomeFeatures } from "@/lib/data/home";

// DB 內容以字串指定 lucide 圖示名；此 map 把名稱解析成元件。
// 未知名稱退回 ICON_FALLBACK，確保不會因壞資料而 render 失敗。
const ICON_MAP: Record<string, LucideIcon> = {
  zap: Zap,
  "shield-check": ShieldCheck,
  activity: Activity,
  thermometer: Thermometer,
  "volume-x": VolumeX,
  leaf: Leaf,
};

const ICON_FALLBACK: LucideIcon = Zap;

function resolveIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? ICON_FALLBACK;
}

// 產品特色 — 標題與卡片皆來自 site_settings `home_features`。
export function ProductFeatures({ content }: { content: HomeFeatures }) {
  return (
    <section className="bg-surface-muted border-border border-t">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-12 md:py-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
            {content.eyebrow}
          </p>
          <h2 className="text-ink text-[30px] font-bold sm:text-[38px]">
            {content.title}
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {content.features.map((f) => {
            const Icon = resolveIcon(f.icon);
            return (
              <div
                key={f.title}
                className="border-border bg-surface flex items-start gap-4 rounded-2xl border p-6"
              >
                <span className="bg-primary-soft/20 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                  <Icon
                    className="text-primary h-[22px] w-[22px]"
                    aria-hidden="true"
                  />
                </span>
                <div className="flex flex-col gap-1.5">
                  <h3 className="text-ink text-[18px] font-semibold">
                    {f.title}
                  </h3>
                  <p className="text-text-muted text-[16px] leading-[1.6]">
                    {f.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
