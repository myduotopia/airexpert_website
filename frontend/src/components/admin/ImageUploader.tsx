"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { uploadMediaDirect } from "@/lib/admin/upload-client";

// 圖片上傳：選檔 → 上傳到 media bucket → 回傳公開 URL。
// onUploaded 讓父層（表單）接住 URL 寫進對應欄位（如 images jsonb / logo_url）。
export function ImageUploader({
  folder = "uploads",
  onUploaded,
}: {
  folder?: string;
  onUploaded?: (url: string) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    startTransition(async () => {
      const res = await uploadMediaDirect(file, folder);
      if (res.ok) {
        setUrl(res.url);
        onUploaded?.(res.url);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="border-border hover:bg-surface-muted inline-flex h-10 w-fit cursor-pointer items-center rounded-lg border px-4 text-[14px] font-medium">
        {pending ? "上傳中…" : "選擇圖片"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
      </label>

      {error ? (
        <p role="alert" className="text-[13px] text-red-600">
          {error}
        </p>
      ) : null}

      {url ? (
        <div className="flex items-center gap-3">
          <Image
            src={url}
            alt="已上傳圖片預覽"
            width={64}
            height={64}
            className="border-border h-16 w-16 rounded-md border object-cover"
          />
          <code className="text-text-muted text-[12px] break-all">{url}</code>
        </div>
      ) : null}
    </div>
  );
}
