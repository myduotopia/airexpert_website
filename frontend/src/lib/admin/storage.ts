"use server";

// 圖片 / 媒體上傳到 Supabase Storage 的 `media` bucket（公開讀）。
// 以 service_role 上傳（繞過 RLS）；先 requireAdmin() 驗證身分。
import { getAdminSupabase } from "../supabase-admin";
import { requireAdmin } from "./auth";

export type UploadResult =
  | { ok: true; url: string; path: string }
  | { ok: false; error: string };

const MAX_BYTES = 25 * 1024 * 1024; // 25MB（技術手冊 PDF 可能較大，#84）
const ALLOWED = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "application/pdf",
];

export async function uploadMedia(formData: FormData): Promise<UploadResult> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "請選擇檔案" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "檔案過大（上限 25MB）" };
  }
  if (file.type && !ALLOWED.includes(file.type)) {
    return { ok: false, error: `不支援的檔案類型：${file.type}` };
  }

  const folder = String(formData.get("folder") ?? "uploads").replace(
    /[^a-z0-9/_-]/gi,
    "",
  );
  const ext = (file.name.split(".").pop() ?? "bin").toLowerCase();
  const rand = Math.round(Math.random() * 1e9);
  const path = `${folder}/${Date.now()}-${rand}.${ext}`;

  const admin = getAdminSupabase();
  const { error } = await admin.storage
    .from("media")
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) return { ok: false, error: error.message };

  const { data } = admin.storage.from("media").getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path };
}

export async function deleteMedia(
  path: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const { error } = await getAdminSupabase()
    .storage.from("media")
    .remove([path]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
