"use client";

/* eslint-disable @next/next/no-img-element -- external YouTube thumbnails need
   a native <img> with onError fallback to the brand logo. */

import { useState, useEffect, useCallback } from "react";
import { Play, X } from "lucide-react";
import type { Event } from "@/lib/types";

// 從 YouTube 連結擷取 11 碼 video id。支援 watch?v=、youtu.be/、embed/、shorts/ 等格式。
export function extractYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m) return m[1];
  }
  // 已是裸 id 的情況。
  if (/^[\w-]{11}$/.test(url.trim())) return url.trim();
  return null;
}

type PlayableVideo = { key: string; ytId: string; caption: string };

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

export function EventVideoGrid({ events }: { events: Event[] }) {
  const videos: PlayableVideo[] = events
    .map((e) => {
      const ytId = extractYouTubeId(e.video_url);
      return ytId ? { key: e.id, ytId, caption: e.title } : null;
    })
    .filter((v): v is PlayableVideo => v !== null);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const close = useCallback(() => setOpenKey(null), []);

  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openKey, close]);

  if (videos.length === 0) {
    return (
      <p className="text-text-muted py-12 text-center text-[15px]">
        目前尚無交機影片，敬請期待。
      </p>
    );
  }

  const openVideo = videos.find((v) => v.key === openKey);

  return (
    <>
      <div className="grid grid-cols-1 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {videos.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setOpenKey(v.key)}
            aria-label={`播放影片：${v.caption}`}
            className="group focus-visible:ring-primary block rounded-xl text-left focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="border-border bg-surface-dark relative aspect-video overflow-hidden rounded-xl border">
              <Thumb id={v.ytId} />
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
                src={`https://www.youtube-nocookie.com/embed/${openVideo.ytId}?autoplay=1&rel=0`}
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
