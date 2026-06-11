import type { Metadata } from "next";
import Image from "next/image";
import { Play } from "lucide-react";

export const metadata: Metadata = {
  title: "公司活動",
  description: "超勁賀空壓科技 交機實錄與公司活動影片花絮。",
};

// All YouTube videos from the old site's 公司活動 pages (event-1/2/3),
// in page order; one cross-page duplicate removed.
const VIDEO_IDS: string[] = [
  // event-1
  "-0fMgajQAu0",
  "UK5WMp3iNmY",
  "JuA2cbWSAME",
  "9tTpOqGVn5Q",
  "m0ghrWasLvo",
  "SiofXg65Xq8",
  "6v1b4tdyvxU",
  "dhg46CSXKVI",
  "KSrQdOwP7wY",
  "7dnrIBChlg0",
  "Tc6XB2r17bc",
  "UNz-XXPL1Tg",
  "jt4mneEjKDY",
  "wIcr5DlDztE",
  "JgJGQvvCjJ0",
  "ArlbGjNfHkU",
  "NxUxF8rEYEc",
  // event-2
  "Ah17RGA9SO4",
  "-zWyGfyPnhc",
  "QoqVUQDfcoc",
  "qi5SEAGmVcA",
  "G1EFtYSJpVk",
  "kpkQxDepg6Y",
  "AzBLDxN9sZU",
  "y5Ik6_VGViA",
  "gQjV3VvZvNk",
  "YCaDdVpcBno",
  "76ss1WrdqlM",
  "uMNHCf2Gr_U",
  "Kj38y7njaG8",
  "275wdk_CW6c",
  "h71b6LmEzLk",
  "sOSx0I7W7fM",
  "zvWgJyIIlhs",
  // event-3
  "0t_RfgnORmk",
  "sUCS0BPrkcw",
  "2aFVUOI-Zgg",
  "_CoTdfYfqA0",
  "vDE4zoa-lT0",
  "rMFC-CMpOhk",
  "mnMSWwQSZNc",
  "KCX37RpcxOk",
  "pECstCxVmrE",
  "g58m8utTz1c",
];

export default function EventsPage() {
  return (
    <>
      {/* Header band */}
      <section className="bg-surface border-border border-b">
        <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-12 md:py-20">
          <p className="text-primary-deep font-mono text-[14px] tracking-[1px] uppercase">
            EVENTS · 公司活動
          </p>
          <h1 className="text-ink mt-3 text-[32px] leading-[1.15] font-bold sm:text-[40px]">
            交機實錄與活動影片花絮
          </h1>
          <p className="text-text-muted mt-4 max-w-[640px] text-[17px] leading-[1.65]">
            歷年交機實錄、現場安裝與公司活動影片，點擊即可在 YouTube 觀看。
          </p>
        </div>
      </section>

      {/* Video grid */}
      <section className="bg-surface-muted">
        <div className="mx-auto max-w-[1440px] px-6 py-16 md:px-12 md:py-20">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {VIDEO_IDS.map((id) => (
              <a
                key={id}
                href={`https://www.youtube.com/watch?v=${id}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="在 YouTube 觀看公司活動影片"
                className="group focus-visible:ring-primary block rounded-xl focus-visible:ring-2 focus-visible:outline-none"
              >
                <div className="border-border bg-surface-dark relative aspect-video overflow-hidden rounded-xl border">
                  <Image
                    src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
                    alt="公司活動影片縮圖"
                    fill
                    loading="lazy"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw"
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/10 transition-colors group-hover:bg-black/30">
                    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/55 ring-1 ring-white/30 transition-transform group-hover:scale-110">
                      <Play
                        className="ml-0.5 h-6 w-6 text-white"
                        fill="white"
                        aria-hidden="true"
                      />
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
