"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImageUploader } from "@/components/admin/ImageUploader";
import type { Photo } from "@/lib/types";
import { addPhoto, deletePhoto, updatePhotoSort } from "./actions";

// 相簿照片管理：上傳新照片、刪除、調整排序。
// photos 表無 status，故各動作為自寫 server action（見 ./actions）。
export function AlbumPhotos({
  albumId,
  photos,
}: {
  albumId: string;
  photos: Photo[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error ?? "操作失敗");
      }
    });
  }

  function handleUploaded(url: string) {
    const nextSort =
      photos.length > 0 ? Math.max(...photos.map((p) => p.sort_order)) + 1 : 0;
    run(() => addPhoto(albumId, url, null, nextSort));
  }

  return (
    <fieldset className="border-border flex flex-col gap-4 rounded-lg border p-4">
      <legend className="text-ink px-1 text-[13px] font-medium">
        相簿照片（{photos.length}）
      </legend>

      {error ? (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      ) : null}

      {photos.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {photos.map((p, i) => (
            <li
              key={p.id}
              className="border-border flex flex-col gap-2 rounded-md border p-2"
            >
              <div className="bg-surface-muted relative aspect-square w-full overflow-hidden rounded">
                <Image
                  src={p.image_url}
                  alt={p.caption ?? `照片 ${i + 1}`}
                  fill
                  sizes="200px"
                  className="object-cover"
                />
              </div>
              <div className="flex items-center justify-between gap-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={pending || i === 0}
                    onClick={() => {
                      const above = photos[i - 1];
                      run(async () => {
                        const a = await updatePhotoSort(p.id, above.sort_order);
                        if (!a.ok) return a;
                        return updatePhotoSort(above.id, p.sort_order);
                      });
                    }}
                    aria-label="上移"
                    className="hover:bg-surface-muted inline-flex h-7 w-7 items-center justify-center rounded text-[14px] disabled:opacity-40"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={pending || i === photos.length - 1}
                    onClick={() => {
                      const below = photos[i + 1];
                      run(async () => {
                        const a = await updatePhotoSort(p.id, below.sort_order);
                        if (!a.ok) return a;
                        return updatePhotoSort(below.id, p.sort_order);
                      });
                    }}
                    aria-label="下移"
                    className="hover:bg-surface-muted inline-flex h-7 w-7 items-center justify-center rounded text-[14px] disabled:opacity-40"
                  >
                    ↓
                  </button>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (!window.confirm("確定刪除這張照片？")) return;
                    run(() => deletePhoto(p.id));
                  }}
                  className="text-[12px] font-medium text-red-600 hover:underline disabled:opacity-40"
                >
                  刪除
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted text-[13px]">尚無照片，於下方上傳。</p>
      )}

      <div className="border-border border-t pt-3">
        <p className="text-text-muted mb-2 text-[13px]">新增照片</p>
        <ImageUploader folder="events" onUploaded={handleUploaded} />
      </div>
    </fieldset>
  );
}
