"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { SeoFields } from "@/components/admin/SeoFields";
import { AiFillSeoButton } from "@/components/admin/ai/AiFillSeoButton";
import type { PhotoAlbum, ContentStatus } from "@/lib/types";
import { saveAlbum } from "./actions";

const STATUS_OPTIONS: { value: ContentStatus; label: string }[] = [
  { value: "draft", label: "草稿" },
  { value: "published", label: "已發佈" },
  { value: "archived", label: "已封存" },
];

const inputClass =
  "border-border focus:border-primary w-full rounded-lg border bg-white px-3 py-2 text-[14px] outline-none";
const labelClass = "text-ink text-[13px] font-medium";

export function AlbumForm({ album }: { album?: PhotoAlbum }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [coverImage, setCoverImage] = useState<string>(
    album?.cover_image ?? "",
  );

  const action = saveAlbum.bind(null, album?.id ?? null);

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const res = await action(formData);
      if (res.ok) {
        router.push("/admin/events");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <form action={onSubmit} className="flex flex-col gap-5">
      {/* cover_image 以隱藏欄位送出，由下方上傳區維護。 */}
      <input type="hidden" name="cover_image" value={coverImage} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="title" className={labelClass}>
            標題 *
          </label>
          <input
            id="title"
            name="title"
            required
            defaultValue={album?.title ?? ""}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="slug" className={labelClass}>
            Slug *（網址，如 2026-spring-delivery）
          </label>
          <input
            id="slug"
            name="slug"
            required
            defaultValue={album?.slug ?? ""}
            className={`${inputClass} font-mono`}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className={labelClass}>
          說明
        </label>
        <textarea
          id="description"
          name="description"
          rows={3}
          defaultValue={album?.description ?? ""}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="status" className={labelClass}>
            狀態
          </label>
          <select
            id="status"
            name="status"
            defaultValue={album?.status ?? "published"}
            className={inputClass}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 封面圖 */}
      <fieldset className="border-border flex flex-col gap-2 rounded-lg border p-4">
        <legend className="text-ink px-1 text-[13px] font-medium">
          封面圖
        </legend>
        {coverImage ? (
          <div className="flex items-center gap-3">
            <Image
              src={coverImage}
              alt="封面預覽"
              width={96}
              height={64}
              className="border-border h-16 w-24 rounded-md border object-cover"
            />
            <button
              type="button"
              onClick={() => setCoverImage("")}
              className="text-[13px] font-medium text-red-600 hover:underline"
            >
              移除
            </button>
          </div>
        ) : (
          <ImageUploader
            folder="events"
            onUploaded={(url) => setCoverImage(url)}
          />
        )}
      </fieldset>

      {/* SEO 設定（完整 meta） */}
      <AiFillSeoButton targetType="album" targetId={album?.id ?? null} />
      <SeoFields values={album} />

      {error ? (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      ) : null}

      <div className="border-border flex items-center gap-3 border-t pt-4">
        <button
          type="submit"
          disabled={pending}
          className="bg-primary hover:bg-primary-deep inline-flex h-10 items-center justify-center rounded-lg px-4 text-[14px] font-semibold text-white transition-colors disabled:opacity-60"
        >
          {pending ? "處理中…" : album ? "儲存變更" : "建立相簿"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/events")}
          className="text-text-muted hover:text-ink text-[14px]"
        >
          取消
        </button>
      </div>
    </form>
  );
}
