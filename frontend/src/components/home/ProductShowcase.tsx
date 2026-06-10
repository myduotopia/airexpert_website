import Image from "next/image";

type Category = { img: string; name: string; desc: string };

// 產品示意圖 — the 6 schema product categories with real product photos.
const CATEGORIES: Category[] = [
  {
    img: "/categories/cat-air-compressor.jpg",
    name: "變頻空壓機",
    desc: "永磁變頻螺旋、無油與微油機種，7.5–600 HP 完整涵蓋。",
  },
  {
    img: "/categories/cat-vacuum-pump.jpg",
    name: "變頻真空泵",
    desc: "乾式與微油變頻真空系統，穩定深真空表現。",
  },
  {
    img: "/categories/cat-blower.jpg",
    name: "變頻鼓風機",
    desc: "氣懸浮／磁懸浮離心式，污水與氣力輸送應用。",
  },
  {
    img: "/categories/cat-centrifugal.jpg",
    name: "離心式空壓機",
    desc: "大型離心機種，300–4500 kW 高流量需求。",
  },
  {
    img: "/categories/cat-refrigerated-dryer.jpg",
    name: "冷凍式乾燥機",
    desc: "相變儲能與冷凍式乾燥，穩定露點控制。",
  },
  {
    img: "/categories/cat-adsorption-dryer.jpg",
    name: "吸附式乾燥機",
    desc: "壓縮熱回收與雙塔吸附，達 −70°C 低露點。",
  },
];

export function ProductShowcase() {
  return (
    <section className="bg-surface">
      <div className="mx-auto max-w-[1440px] px-6 py-20 md:px-12 md:py-24">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
            PRODUCT SYSTEMS · 產品系列
          </p>
          <h2 className="text-ink text-[30px] font-bold sm:text-[38px]">
            完整節能氣源系統
          </h2>
          <p className="text-text-muted max-w-[560px] text-[17px] leading-[1.6]">
            從空壓、真空、鼓風到乾燥，單一窗口整合最適合您現場的節能配置。
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => (
            <div
              key={c.name}
              className="border-border bg-surface group flex flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-[0_6px_28px_rgba(22,32,26,0.07)]"
            >
              <div className="bg-surface flex aspect-[4/3] items-center justify-center p-6">
                <Image
                  src={c.img}
                  alt={c.name}
                  width={800}
                  height={800}
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  className="h-full w-auto object-contain transition-transform duration-300 group-hover:scale-105"
                />
              </div>
              <div className="border-border flex flex-col gap-2 border-t p-6">
                <h3 className="text-ink text-[20px] font-semibold">{c.name}</h3>
                <p className="text-text-muted text-[16px] leading-[1.6]">
                  {c.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
