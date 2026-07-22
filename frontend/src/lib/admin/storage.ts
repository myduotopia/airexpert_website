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

export type SignedUploadResult =
  | { ok: true; path: string; token: string; url: string }
  | { ok: false; error: string };

/**
 * 發給瀏覽器的「簽名上傳網址」——檔案由瀏覽器直傳 Supabase Storage，不經過本站
 * 伺服器。這是必要的：Vercel Serverless Function 的請求主體硬上限為 4.5MB
 * （平台限制、無法調高），大張商品照走 Server Action 會在傳輸層被擋，
 * 表現為整頁崩潰。此處僅驗證身分與宣告的型別/大小並回傳簽名，體積不受限。
 *
 * 注意：size/contentType 由客戶端宣告（僅作前置擋門），真正的硬性上限請於
 * Supabase bucket 設定 file size limit。
 */
export async function createMediaUploadUrl(input: {
  folder?: string;
  filename: string;
  contentType?: string;
  size?: number;
}): Promise<SignedUploadResult> {
  await requireAdmin();

  if (typeof input.size === "number" && input.size > MAX_BYTES) {
    return { ok: false, error: "檔案過大（上限 25MB）" };
  }
  if (input.contentType && !ALLOWED.includes(input.contentType)) {
    return { ok: false, error: `不支援的檔案類型：${input.contentType}` };
  }

  const folder = String(input.folder ?? "uploads").replace(
    /[^a-z0-9/_-]/gi,
    "",
  );
  const ext = (input.filename.split(".").pop() ?? "bin")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const rand = Math.round(Math.random() * 1e9);
  const path = `${folder}/${Date.now()}-${rand}.${ext || "bin"}`;

  const admin = getAdminSupabase();
  const { data, error } = await admin.storage
    .from("media")
    .createSignedUploadUrl(path);
  if (error || !data) {
    return { ok: false, error: error?.message ?? "無法建立上傳網址" };
  }

  const { data: pub } = admin.storage.from("media").getPublicUrl(path);
  return { ok: true, path: data.path, token: data.token, url: pub.publicUrl };
}

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
