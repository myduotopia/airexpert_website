"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

export type GalleryImage = { url: string; alt?: string | null };

// 服務內文圖庫 + 點擊放大燈箱。正式 /services/[slug] 與 /services-testing 共用。
// 圖片以 object-contain 呈現（示意圖/表格/截圖不裁切）；點縮圖開全螢幕檢視。
export function ServiceGallery({
  images,
  fallbackAlt,
}: {
  images: GalleryImage[];
  fallbackAlt: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const isOpen = active !== null;

  const close = useCallback(() => setActive(null), []);
  const show = useCallback(
    (delta: number) =>
      setActive((cur) =>
        cur === null ? cur : (cur + delta + images.length) % images.length,
      ),
    [images.length],
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowRight") show(1);
      else if (e.key === "ArrowLeft") show(-1);
    };
    window.addEventListener("keydown", onKey);
    // 開啟時鎖定背景捲動
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, close, show]);

  if (images.length === 0) return null;

  const altOf = (img: GalleryImage, i: number) =>
    img.alt || `${fallbackAlt} 圖 ${i + 1}`;

  return (
    <>
      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {images.map((img, i) => (
          <button
            key={img.url}
            type="button"
            onClick={() => setActive(i)}
            aria-label={`放大檢視：${altOf(img, i)}`}
            className="border-border bg-surface focus-visible:ring-primary group relative aspect-[16/10] w-full cursor-zoom-in overflow-hidden rounded-[12px] border p-3 focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="relative h-full w-full">
              <Image
                src={img.url}
                alt={altOf(img, i)}
                fill
                sizes="(max-width: 640px) 100vw, 400px"
                className="object-contain"
              />
            </div>
          </button>
        ))}
      </div>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={altOf(images[active], active)}
          onClick={close}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 sm:p-8"
        >
          {/* 關閉 */}
          <button
            type="button"
            onClick={close}
            aria-label="關閉"
            className="absolute top-4 right-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-6 w-6" />
          </button>

          {/* 上一張 / 下一張（多張時） */}
          {images.length > 1 ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  show(-1);
                }}
                aria-label="上一張"
                className="absolute left-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-6"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  show(1);
                }}
                aria-label="下一張"
                className="absolute right-3 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-6"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          ) : null}

          {/* 放大圖（點圖本身不關閉） */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex max-h-full max-w-[1100px] flex-col items-center gap-3"
          >
            {/* 原圖直接以 img 呈現、object-contain；unoptimized 專案下最單純可靠 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[active].url}
              alt={altOf(images[active], active)}
              className="max-h-[82vh] w-auto max-w-full rounded-[10px] bg-white object-contain"
            />
            <p className="text-center text-[13px] text-white/80">
              {altOf(images[active], active)}
              {images.length > 1
                ? `　（${active + 1} / ${images.length}）`
                : ""}
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
