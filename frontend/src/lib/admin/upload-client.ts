"use client";

// 後台檔案上傳（瀏覽器直傳 Supabase Storage）。
//
// 為什麼不走 Server Action 傳檔：Vercel Serverless Function 的請求主體硬上限為
// 4.5MB（平台限制、無法調高），相機拍的商品照常超過，會在傳輸層被擋掉並讓整頁
// 崩潰（This page couldn't load）。改為：伺服器只用 createMediaUploadUrl 驗證
// 身分並發出簽名網址，檔案本體由瀏覽器直接送到 Supabase，不受此限制。
import { getSupabaseClient } from "@/lib/supabase";
import { createMediaUploadUrl } from "@/lib/admin/storage";

export type UploadedMedia =
  | { ok: true; url: string; path: string }
  | { ok: false; error: string };

export async function uploadMediaDirect(
  file: File,
  folder: string,
): Promise<UploadedMedia> {
  if (!file || file.size === 0) return { ok: false, error: "請選擇檔案" };

  const signed = await createMediaUploadUrl({
    folder,
    filename: file.name,
    contentType: file.type || undefined,
    size: file.size,
  });
  if (!signed.ok) return signed;

  const { error } = await getSupabaseClient()
    .storage.from("media")
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type || undefined,
    });
  if (error) return { ok: false, error: error.message };

  return { ok: true, url: signed.url, path: signed.path };
}
