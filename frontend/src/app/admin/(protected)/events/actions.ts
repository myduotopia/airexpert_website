"use server";

// 公司活動 後台 server actions。
// 三個資料表：
//  - events（交機影片）：通用 CRUD bind 到 "events" 表。
//  - photo_albums（活動相簿）：通用 CRUD bind 到 "photo_albums" 表。
//  - photos（相簿照片，無 status 欄位）：自寫 insert / delete by album_id。
// 失效前台快取：CACHE_TAGS.events / CACHE_TAGS.photoAlbums。
import { revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin/auth";
import {
  deleteRow,
  setStatus,
  reorderRows,
  type ActionResult,
} from "@/lib/admin/crud";
import { CACHE_TAGS } from "@/lib/data";
import type { ContentStatus } from "@/lib/types";

const EVENTS_TAGS = [CACHE_TAGS.events];
const ALBUM_TAGS = [CACHE_TAGS.photoAlbums];
const STATUSES: ContentStatus[] = ["draft", "published", "archived"];

function normalizeStatus(raw: FormDataEntryValue | null): ContentStatus {
  const s = String(raw ?? "published");
  return STATUSES.includes(s as ContentStatus)
    ? (s as ContentStatus)
    : "published";
}

function str(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
}

// ---------------- events（交機影片） ----------------

export async function saveEvent(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const title = str(formData, "title");
  if (!title) return { ok: false, error: "標題為必填" };

  // sort_order 不在表單寫入（改由列表拖移排序維護），避免儲存時被覆蓋。
  const values = {
    title,
    description: str(formData, "description"),
    video_url: str(formData, "video_url"),
    event_date: str(formData, "event_date"), // date 或 null
    status: normalizeStatus(formData.get("status")),
  };

  const supabase = getAdminSupabase();
  const { error } = id
    ? await supabase.from("events").update(values).eq("id", id)
    : await supabase.from("events").insert(values);
  if (error) return { ok: false, error: error.message };

  for (const tag of EVENTS_TAGS) revalidateTag(tag, "max");
  return { ok: true };
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  return deleteRow("events", id, EVENTS_TAGS);
}

export async function setEventStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  return setStatus("events", id, status, EVENTS_TAGS);
}

/** 交機影片列表拖移排序：把 sort_order 依新順序重設為 0,1,2…。 */
export async function reorderEventsAction(orderedIds: string[]) {
  return reorderRows("events", orderedIds, EVENTS_TAGS);
}

// ---------------- photo_albums（活動相簿） ----------------

export async function saveAlbum(
  id: string | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const title = str(formData, "title");
  const slug = str(formData, "slug");
  if (!title || !slug) return { ok: false, error: "標題與 slug 為必填" };
  if (!/^[a-z0-9-]+$/.test(slug)) {
    return {
      ok: false,
      error: "網址代稱（slug）僅能使用小寫英數字與連字號（-）",
    };
  }

  const values = {
    title,
    slug,
    description: str(formData, "description"),
    cover_image: str(formData, "cover_image"),
    status: normalizeStatus(formData.get("status")),
  };

  const supabase = getAdminSupabase();
  const { error } = id
    ? await supabase.from("photo_albums").update(values).eq("id", id)
    : await supabase.from("photo_albums").insert(values);
  if (error) return { ok: false, error: error.message };

  for (const tag of ALBUM_TAGS) revalidateTag(tag, "max");
  return { ok: true };
}

export async function deleteAlbum(id: string): Promise<ActionResult> {
  // photos 以 on delete cascade 連帶刪除。
  return deleteRow("photo_albums", id, ALBUM_TAGS);
}

export async function setAlbumStatus(
  id: string,
  status: ContentStatus,
): Promise<ActionResult> {
  return setStatus("photo_albums", id, status, ALBUM_TAGS);
}

// ---------------- photos（相簿照片，無 status 欄位 → 自寫 action） ----------------

export async function addPhoto(
  albumId: string,
  imageUrl: string,
  caption: string | null,
  sortOrder: number,
): Promise<ActionResult> {
  await requireAdmin();
  if (!albumId || !imageUrl) {
    return { ok: false, error: "缺少相簿或圖片網址" };
  }
  const { error } = await getAdminSupabase().from("photos").insert({
    album_id: albumId,
    image_url: imageUrl,
    caption,
    sort_order: sortOrder,
  });
  if (error) return { ok: false, error: error.message };
  for (const tag of ALBUM_TAGS) revalidateTag(tag, "max");
  return { ok: true };
}

export async function deletePhoto(photoId: string): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await getAdminSupabase()
    .from("photos")
    .delete()
    .eq("id", photoId);
  if (error) return { ok: false, error: error.message };
  for (const tag of ALBUM_TAGS) revalidateTag(tag, "max");
  return { ok: true };
}

export async function updatePhotoSort(
  photoId: string,
  sortOrder: number,
): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await getAdminSupabase()
    .from("photos")
    .update({ sort_order: sortOrder })
    .eq("id", photoId);
  if (error) return { ok: false, error: error.message };
  for (const tag of ALBUM_TAGS) revalidateTag(tag, "max");
  return { ok: true };
}
