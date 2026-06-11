"use client";

/* eslint-disable @next/next/no-img-element -- external YouTube thumbnails need
   a native <img> with onError fallback to the brand logo. */

import { useState, useEffect, useCallback } from "react";
import { Play, X } from "lucide-react";

type Video = { id: string; caption: string };

const VIDEOS: Video[] = [
  { id: "-0fMgajQAu0", caption: "台南安平塑膠製品製造商空壓系統改善工程" },
  { id: "UK5WMp3iNmY", caption: "高雄市路竹區螺絲加工廠空壓改善工程" },
  { id: "JuA2cbWSAME", caption: "高雄市連鎖汽車養護中心空壓系統改善工程" },
  { id: "9tTpOqGVn5Q", caption: "台南農產品加工業空壓系統改善" },
  { id: "m0ghrWasLvo", caption: "高雄電子加工業空壓系統改善" },
  { id: "SiofXg65Xq8", caption: "高雄市湖內區生物科技廠空壓改善工程" },
  { id: "6v1b4tdyvxU", caption: "台南食品製造商空壓系統改善工程" },
  { id: "dhg46CSXKVI", caption: "高雄市路竹區光電大廠空壓改善工程" },
  { id: "KSrQdOwP7wY", caption: "台南模具企業" },
  { id: "7dnrIBChlg0", caption: "台南金屬製造商改善空壓系統" },
  { id: "Tc6XB2r17bc", caption: "高雄科學園區改善空壓工程" },
  { id: "UNz-XXPL1Tg", caption: "台南金屬製造商空壓系統改善" },
  { id: "jt4mneEjKDY", caption: "台南燈具製造商空壓系統改善" },
  { id: "wIcr5DlDztE", caption: "台南包裝機械製造商" },
  { id: "JgJGQvvCjJ0", caption: "新北市三峽區鋼鐵廠空壓系統改善工程" },
  { id: "ArlbGjNfHkU", caption: "高雄螺絲製造商空壓機安裝工程" },
  { id: "NxUxF8rEYEc", caption: "台南不銹鋼供應商空壓系統改善" },
  { id: "Ah17RGA9SO4", caption: "高雄運輸物流商空壓系統安裝工程" },
  { id: "-zWyGfyPnhc", caption: "台南汽車零件製造商空壓系統改善" },
  { id: "QoqVUQDfcoc", caption: "台南電線電纜製造商空壓系統改善工程" },
  { id: "qi5SEAGmVcA", caption: "高雄零件製造商空壓系統改善工程" },
  { id: "G1EFtYSJpVk", caption: "台南永康食品製造商" },
  { id: "kpkQxDepg6Y", caption: "屏東金屬加工廠空壓系統安裝工程" },
  { id: "AzBLDxN9sZU", caption: "台南汽車零件製造商" },
  { id: "y5Ik6_VGViA", caption: "高雄螺絲製造商空壓系統安裝工程" },
  { id: "gQjV3VvZvNk", caption: "高雄螺絲製造商空壓系統安裝工程" },
  { id: "YCaDdVpcBno", caption: "高雄螺絲加工商安裝空壓系統工程" },
  { id: "76ss1WrdqlM", caption: "台南金屬加工廠安裝空壓系統" },
  { id: "uMNHCf2Gr_U", caption: "台南市食品製造商空壓系統改善工程" },
  { id: "Kj38y7njaG8", caption: "新竹市竹北半導體廠空壓系統改善工程" },
  { id: "275wdk_CW6c", caption: "桃園市蘆竹玻璃廠 8000L 儲氣桶定位" },
  { id: "h71b6LmEzLk", caption: "高雄金屬家具製造商安裝超級管路" },
  { id: "sOSx0I7W7fM", caption: "新竹市竹南科技廠節能規劃" },
  { id: "zvWgJyIIlhs", caption: "新北市新莊區噴砂廠空壓系統改善工程" },
  { id: "0t_RfgnORmk", caption: "整廠特殊配管工程" },
  { id: "sUCS0BPrkcw", caption: "新北市板橋區 SMT 廠空壓系統改善工程" },
  { id: "2aFVUOI-Zgg", caption: "新北市樹林區螺絲廠空壓設備新增工程" },
  { id: "_CoTdfYfqA0", caption: "鋁合金超級管路（上）" },
  { id: "vDE4zoa-lT0", caption: "鋁合金超級管路（下）" },
  { id: "rMFC-CMpOhk", caption: "桃園市蘆竹區玻璃廠空壓系統改善工程" },
  { id: "mnMSWwQSZNc", caption: "超勁賀的空壓系統專業" },
  { id: "KCX37RpcxOk", caption: "新北市汐止區 CNC 廠空壓系統改善工程" },
  { id: "pECstCxVmrE", caption: "新北市鶯歌區食品廠空壓系統改善工程" },
  { id: "g58m8utTz1c", caption: "桃園市蘆竹區螺絲廠空壓系統改善工程" },
];

const FALLBACK = "/brand/logo-full.png";

function Thumb({ id }: { id: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <div className="bg-surface-muted flex h-full w-full items-center justify-center p-8">
        <img
          src={FALLBACK}
          alt=""
          className="max-h-[56%] w-auto max-w-[80%] object-contain opacity-60"
        />
      </div>
    );
  }
  return (
    <img
      src={`https://img.youtube.com/vi/${id}/hqdefault.jpg`}
      alt=""
      loading="lazy"
      onError={() => setErrored(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
}

export function VideoGallery() {
  const [openId, setOpenId] = useState<string | null>(null);

  const close = useCallback(() => setOpenId(null), []);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openId, close]);

  const openVideo = VIDEOS.find((v) => v.id === openId);

  return (
    <>
      <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {VIDEOS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setOpenId(v.id)}
            aria-label={`播放影片：${v.caption}`}
            className="group focus-visible:ring-primary block rounded-xl text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="border-border bg-surface-dark relative aspect-video overflow-hidden rounded-xl border">
              <Thumb id={v.id} />
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
            <p className="text-ink mt-3 line-clamp-2 min-h-[51px] text-[17px] leading-[1.5] font-medium">
              {v.caption}
            </p>
          </button>
        ))}
      </div>

      {/* In-site lightbox player */}
      {openVideo && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={openVideo.caption}
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={close}
        >
          <div
            className="relative w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              aria-label="關閉影片"
              className="absolute -top-12 right-0 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              <X size={22} aria-hidden="true" />
            </button>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${openVideo.id}?autoplay=1&rel=0`}
                title={openVideo.caption}
                className="absolute inset-0 h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
            <p className="mt-3 text-center text-[15px] text-white/90">
              {openVideo.caption}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
