// Typed Supabase data-access layer for the public (anon) frontend — SERVER ONLY.
//
// 所有讀取均受 RLS 保護：anon 只能讀 status='published' 內容。
// 為與 RLS 一致並避免無謂回傳，helper 也在查詢端過濾 status='published'。
//
// 快取（兩層）：
//  - `unstable_cache`（next/cache）：跨請求的時間 / tag 快取。本專案 next.config.ts
//    未啟用 cacheComponents，故採「Previous Model」；Supabase client 用自身 fetch，
//    因此用 unstable_cache 對非-fetch async 函式做快取。
//    參考：node_modules/next/dist/docs/01-app/02-guides/caching-without-cache-components.md
//  - React `cache()`：同一次 render 內的請求去重（例如 generateMetadata 與頁面 body
//    都呼叫 getProductBySlug 時，只查一次）。
//
// 本檔以 `server-only` 標記：client component 若誤從此檔匯入會立即報錯，而非把
// server-only 程式打包進 client bundle。聯絡表單送出請改用 `./contact`。

import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "./supabase";
import type {
  Article,
  Case,
  Event,
  Photo,
  PhotoAlbum,
  PhotoAlbumWithPhotos,
  Product,
} from "./types";

// 已發佈內容變動不頻繁；以 1 小時為基準，搭配 tag 供日後 on-demand 失效。
const REVALIDATE_SECONDS = 3600;

/** 集中管理快取 tag，供日後在 Server Action / Route Handler 以 revalidateTag 失效。 */
export const CACHE_TAGS = {
  products: "products",
  articles: "articles",
  cases: "cases",
  events: "events",
  photoAlbums: "photo_albums",
} as const;

function throwOnError(
  context: string,
  error: { message: string } | null,
): void {
  if (error) {
    throw new Error(`Supabase query failed (${context}): ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export const getPublishedProducts = cache(
  unstable_cache(
    async (): Promise<Product[]> => {
      const { data, error } = await getSupabaseClient()
        .from("products")
        .select("*")
        .eq("status", "published")
        .order("sort_order", { ascending: true });

      throwOnError("getPublishedProducts", error);
      return (data ?? []) as Product[];
    },
    ["published-products"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.products] },
  ),
);

export const getProductsByCategory = cache(
  unstable_cache(
    async (category: string): Promise<Product[]> => {
      const { data, error } = await getSupabaseClient()
        .from("products")
        .select("*")
        .eq("status", "published")
        .eq("category", category)
        .order("sort_order", { ascending: true });

      throwOnError("getProductsByCategory", error);
      return (data ?? []) as Product[];
    },
    ["products-by-category"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.products] },
  ),
);

export const getProductBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Product | null> => {
      const { data, error } = await getSupabaseClient()
        .from("products")
        .select("*")
        .eq("status", "published")
        .eq("slug", slug)
        .maybeSingle();

      throwOnError("getProductBySlug", error);
      return (data as Product | null) ?? null;
    },
    ["product-by-slug"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.products] },
  ),
);

// ---------------------------------------------------------------------------
// Articles（最新消息）— 依 published_at 由新到舊
// ---------------------------------------------------------------------------

export const getPublishedArticles = cache(
  unstable_cache(
    async (): Promise<Article[]> => {
      const { data, error } = await getSupabaseClient()
        .from("articles")
        .select("*")
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false });

      throwOnError("getPublishedArticles", error);
      return (data ?? []) as Article[];
    },
    ["published-articles"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.articles] },
  ),
);

export const getArticlesByCategory = cache(
  unstable_cache(
    async (category: string): Promise<Article[]> => {
      const { data, error } = await getSupabaseClient()
        .from("articles")
        .select("*")
        .eq("status", "published")
        .eq("category", category)
        .order("published_at", { ascending: false, nullsFirst: false });

      throwOnError("getArticlesByCategory", error);
      return (data ?? []) as Article[];
    },
    ["articles-by-category"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.articles] },
  ),
);

export const getArticleBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Article | null> => {
      const { data, error } = await getSupabaseClient()
        .from("articles")
        .select("*")
        .eq("status", "published")
        .eq("slug", slug)
        .maybeSingle();

      throwOnError("getArticleBySlug", error);
      return (data as Article | null) ?? null;
    },
    ["article-by-slug"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.articles] },
  ),
);

// ---------------------------------------------------------------------------
// Cases（節能實績）
// ---------------------------------------------------------------------------

export const getPublishedCases = cache(
  unstable_cache(
    async (): Promise<Case[]> => {
      const { data, error } = await getSupabaseClient()
        .from("cases")
        .select("*")
        .eq("status", "published")
        .order("created_at", { ascending: false });

      throwOnError("getPublishedCases", error);
      return (data ?? []) as Case[];
    },
    ["published-cases"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.cases] },
  ),
);

export const getCasesByCategory = cache(
  unstable_cache(
    async (category: string): Promise<Case[]> => {
      const { data, error } = await getSupabaseClient()
        .from("cases")
        .select("*")
        .eq("status", "published")
        .eq("category", category)
        .order("created_at", { ascending: false });

      throwOnError("getCasesByCategory", error);
      return (data ?? []) as Case[];
    },
    ["cases-by-category"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.cases] },
  ),
);

export const getCaseBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Case | null> => {
      const { data, error } = await getSupabaseClient()
        .from("cases")
        .select("*")
        .eq("status", "published")
        .eq("slug", slug)
        .maybeSingle();

      throwOnError("getCaseBySlug", error);
      return (data as Case | null) ?? null;
    },
    ["case-by-slug"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.cases] },
  ),
);

// ---------------------------------------------------------------------------
// Events（公司活動 / 交機影片）— 依 sort_order，再依 event_date
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Photo albums（活動照片）
// ---------------------------------------------------------------------------

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
