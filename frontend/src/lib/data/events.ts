// 公司活動 / 交機影片 + 活動照片 資料存取 — SERVER ONLY。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
import type { Event, Photo, PhotoAlbum, PhotoAlbumWithPhotos } from "../types";
import { CACHE_TAGS, REVALIDATE_SECONDS, throwOnError } from "./cache";

// 交機影片：依 sort_order，再依 event_date。
export const getPublishedEvents = cache(
  unstable_cache(
    async (): Promise<Event[]> => {
      const { data, error } = await getSupabaseClient()
        .from("events")
        .select("*")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("event_date", { ascending: false, nullsFirst: false });

      throwOnError("getPublishedEvents", error);
      return (data ?? []) as Event[];
    },
    ["published-events"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.events] },
  ),
);

export const getPublishedPhotoAlbums = cache(
  unstable_cache(
    async (): Promise<PhotoAlbum[]> => {
      const { data, error } = await getSupabaseClient()
        .from("photo_albums")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false });

      throwOnError("getPublishedPhotoAlbums", error);
      return (data ?? []) as PhotoAlbum[];
    },
    ["published-photo-albums"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.photoAlbums] },
  ),
);

/**
 * 取得單一已發佈相簿及其照片。
 * photos 的 RLS 允許讀「已發佈相簿底下的照片」，故以 album_id 連帶查詢。
 */
export const getPhotoAlbumBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<PhotoAlbumWithPhotos | null> => {
      const supabase = getSupabaseClient();

      const { data: album, error: albumError } = await supabase
        .from("photo_albums")
        .select("*")
        .eq("status", "published")
        .eq("slug", slug)
        .maybeSingle();

      throwOnError("getPhotoAlbumBySlug.album", albumError);
      if (!album) return null;

      const typedAlbum = album as PhotoAlbum;

      const { data: photos, error: photosError } = await supabase
        .from("photos")
        .select("*")
        .eq("album_id", typedAlbum.id)
        .order("sort_order", { ascending: true });

      throwOnError("getPhotoAlbumBySlug.photos", photosError);

      return { ...typedAlbum, photos: (photos ?? []) as Photo[] };
    },
    ["photo-album-by-slug"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.photoAlbums] },
  ),
);
