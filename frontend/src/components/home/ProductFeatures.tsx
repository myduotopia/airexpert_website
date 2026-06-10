import {
  Zap,
  ShieldCheck,
  Activity,
  Thermometer,
  VolumeX,
  Leaf,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Feature = { icon: LucideIcon; title: string; desc: string };

// 產品特色 — key strengths across the product line.
const FEATURES: Feature[] = [
  {
    icon: Zap,
    title: "高效節能",
    desc: "永磁變頻隨需供氣，平均節能達 35%。",
  },
  {
    icon: ShieldCheck,
    title: "Class 0 無油",
    desc: "符合 ISO 8573-1 最高潔淨等級，零油氣污染。",
  },
  {
    icon: Activity,
    title: "智慧監控",
    desc: "感測聯網，遠端即時掌握壓力、流量與耗能。",
  },
  {
    icon: Thermometer,
    title: "穩定溫控",
    desc: "多級冷卻設計，確保長時間穩定輸出。",
  },
  {
    icon: VolumeX,
    title: "低噪音運轉",
    desc: "隔音機罩設計，運轉噪音低至 67 dB(A)。",
  },
  {
    icon: Leaf,
    title: "永續減碳",
    desc: "導入 ISO 50001 能源管理，落實淨零承諾。",
  },
];

export function ProductFeatures() {
  return (
    <section className="bg-surface-muted border-border border-t">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-12 md:py-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-primary-deep font-mono text-[12px] tracking-[1px] uppercase">
            KEY FEATURES · 產品特色
          </p>
          <h2 className="text-ink text-[28px] font-bold sm:text-[36px]">
            為潔淨與節能而生
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="border-border bg-surface flex items-start gap-4 rounded-2xl border p-6"
            >
              <span className="bg-primary-soft/20 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                <f.icon
                  className="text-primary h-[22px] w-[22px]"
                  aria-hidden="true"
                />
              </span>
              <div className="flex flex-col gap-1.5">
                <h3 className="text-ink text-[16px] font-semibold">
                  {f.title}
                </h3>
                <p className="text-text-muted text-[14px] leading-[1.6]">
                  {f.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
