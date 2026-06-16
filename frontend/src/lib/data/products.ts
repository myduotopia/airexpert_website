// 商品介紹 資料存取 — SERVER ONLY。anon 受 RLS 保護，只讀 status='published'。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
import type { Product } from "../types";
import { CACHE_TAGS, REVALIDATE_SECONDS, throwOnError } from "./cache";

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
