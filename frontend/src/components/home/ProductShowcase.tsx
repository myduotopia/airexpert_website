import { Wind, Gauge, Fan, Tornado, Snowflake, Filter } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Category = { icon: LucideIcon; name: string; desc: string };

// 產品示意圖 — the 6 schema product categories, V3.08-styled showcase.
const CATEGORIES: Category[] = [
  {
    icon: Wind,
    name: "變頻空壓機",
    desc: "永磁變頻螺旋、無油與微油機種，7.5–600 HP 完整涵蓋。",
  },
  {
    icon: Gauge,
    name: "變頻真空泵",
    desc: "乾式與微油變頻真空系統，穩定深真空表現。",
  },
  {
    icon: Fan,
    name: "變頻鼓風機",
    desc: "氣懸浮／磁懸浮離心式，污水與氣力輸送應用。",
  },
  {
    icon: Tornado,
    name: "離心式空壓機",
    desc: "大型離心機種，300–4500 kW 高流量需求。",
  },
  {
    icon: Snowflake,
    name: "冷凍式乾燥機",
    desc: "相變儲能與冷凍式乾燥，穩定露點控制。",
  },
  {
    icon: Filter,
    name: "吸附式乾燥機",
    desc: "壓縮熱回收與雙塔吸附，達 −70°C 低露點。",
  },
];

export function ProductShowcase() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-12 md:py-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
            PRODUCT SYSTEMS · 產品系列
          </p>
          <h2 className="text-ink text-[28px] font-bold sm:text-[36px]">
            完整節能氣源系統
          </h2>
          <p className="text-text-muted max-w-[560px] text-[15px] leading-[1.6]">
            從空壓、真空、鼓風到乾燥，單一窗口整合最適合您現場的節能配置。
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <div
              key={c.name}
              className="border-border bg-surface flex flex-col gap-4 rounded-2xl border p-7 transition-shadow hover:shadow-[0_6px_28px_rgba(22,32,26,0.07)]"
            >
              <span className="bg-primary-soft/20 flex h-12 w-12 items-center justify-center rounded-xl">
                <c.icon className="text-primary h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="text-ink text-[18px] font-semibold">{c.name}</h3>
              <p className="text-text-muted text-[14px] leading-[1.6]">
                {c.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
