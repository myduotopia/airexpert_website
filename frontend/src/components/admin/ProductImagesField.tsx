"use client";

import Image from "next/image";
import { useState } from "react";
import { ImageUploader } from "@/components/admin/ImageUploader";
import type { MediaImage } from "@/lib/types";

// 商品 images(jsonb) 編輯器。
// 用 ImageUploader 上傳取得公開 URL，維護一個 MediaImage[]（可改 alt、刪除、調順序），
// 並把整個陣列序列化進隱藏 input（name=images），讓 server action 解析寫回 jsonb。
export function ProductImagesField({
  name = "images",
  initial = [],
}: {
  name?: string;
  initial?: MediaImage[];
}) {
  const [images, setImages] = useState<MediaImage[]>(
    [...initial].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)),
  );

  function withSort(list: MediaImage[]): MediaImage[] {
    return list.map((img, i) => ({ ...img, sort: i }));
  }

  function add(url: string) {
    setImages((prev) =>
      withSort([...prev, { url, alt: null, sort: prev.length }]),
    );
  }

  function remove(index: number) {
    setImages((prev) => withSort(prev.filter((_, i) => i !== index)));
  }

  function move(index: number, dir: -1 | 1) {
    setImages((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return withSort(next);
    });
  }

  function setAlt(index: number, alt: string) {
    setImages((prev) =>
      prev.map((img, i) => (i === index ? { ...img, alt: alt || null } : img)),
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(images)} />

      {images.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {images.map((img, index) => (
            <li
              key={`${img.url}-${index}`}
              className="border-border flex items-center gap-3 rounded-lg border bg-white p-2"
            >
              <Image
                src={img.url}
                alt={img.alt ?? ""}
                width={56}
                height={56}
                className="border-border h-14 w-14 shrink-0 rounded-md border object-cover"
              />
              <input
                type="text"
                value={img.alt ?? ""}
                onChange={(e) => setAlt(index, e.target.value)}
                placeholder="替代文字（alt，選填）"
                className="border-border focus:border-primary h-9 min-w-0 flex-1 rounded-md border px-3 text-[13px] outline-none"
              />
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="text-text-muted hover:bg-surface-muted h-8 w-8 rounded-md text-[14px] disabled:opacity-40"
                  aria-label="上移"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === images.length - 1}
                  className="text-text-muted hover:bg-surface-muted h-8 w-8 rounded-md text-[14px] disabled:opacity-40"
                  aria-label="下移"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="h-8 rounded-md px-2 text-[13px] text-red-600 hover:bg-red-50"
                >
                  刪除
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted text-[13px]">尚未加入圖片。</p>
      )}

      <ImageUploader folder="products" onUploaded={add} />
      <p className="text-text-muted text-[12px]">
        第一張圖會作為列表縮圖與詳情主圖。上傳後可調整順序與 alt。
      </p>
    </div>
  );
}
