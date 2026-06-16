// 品牌介紹 資料存取 — SERVER ONLY（V2 新表 brands）。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
import type { Brand } from "../types";
import { CACHE_TAGS, REVALIDATE_SECONDS, throwOnError } from "./cache";

export const getPublishedBrands = cache(
  unstable_cache(
    async (): Promise<Brand[]> => {
      const { data, error } = await getSupabaseClient()
        .from("brands")
        .select("*")
        .eq("status", "published")
        .order("sort_order", { ascending: true });

      throwOnError("getPublishedBrands", error);
      return (data ?? []) as Brand[];
    },
    ["published-brands"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.brands] },
  ),
);

export const getBrandBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Brand | null> => {
      const { data, error } = await getSupabaseClient()
        .from("brands")
        .select("*")
        .eq("status", "published")
        .eq("slug", slug)
        .maybeSingle();

      throwOnError("getBrandBySlug", error);
      return (data as Brand | null) ?? null;
    },
    ["brand-by-slug"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.brands] },
  ),
);
