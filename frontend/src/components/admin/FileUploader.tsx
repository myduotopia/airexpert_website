"use client";

import { useState, useTransition } from "react";
import { uploadMediaDirect } from "@/lib/admin/upload-client";

// 非圖片檔案上傳（如技術手冊 PDF）：選檔 → 上傳到 media bucket → 回傳公開 URL。
// 與 ImageUploader 同套路，但不顯示 <Image> 預覽，改以連結呈現已上傳檔案。
// onUploaded 讓父層（表單）接住 URL 寫進對應欄位（如 manual_url）。
export function FileUploader({
  folder = "uploads",
  accept = ".pdf,application/pdf",
  onUploaded,
}: {
  folder?: string;
  accept?: string;
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

  // 連結文字優先顯示檔名（URL 末段），取不到才退回完整 URL。
  const fileName = url ? (url.split("/").pop() ?? url) : null;

  return (
    <div className="flex flex-col gap-2">
      <label className="border-border hover:bg-surface-muted inline-flex h-10 w-fit cursor-pointer items-center rounded-lg border px-4 text-[14px] font-medium">
        {pending ? "上傳中…" : "選擇檔案"}
        <input
          type="file"
          accept={accept}
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
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-deep text-[13px] break-all hover:underline"
        >
          {fileName}
        </a>
      ) : null}
    </div>
  );
}
