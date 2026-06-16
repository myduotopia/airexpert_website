// 服務項目 資料存取 — SERVER ONLY（V2 新表 services）。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
import type { Service } from "../types";
import { CACHE_TAGS, REVALIDATE_SECONDS, throwOnError } from "./cache";

export const getPublishedServices = cache(
  unstable_cache(
    async (): Promise<Service[]> => {
      const { data, error } = await getSupabaseClient()
        .from("services")
        .select("*")
        .eq("status", "published")
        .order("sort_order", { ascending: true });

      throwOnError("getPublishedServices", error);
      return (data ?? []) as Service[];
    },
    ["published-services"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.services] },
  ),
);

export const getServiceBySlug = cache(
  unstable_cache(
    async (slug: string): Promise<Service | null> => {
      const { data, error } = await getSupabaseClient()
        .from("services")
        .select("*")
        .eq("status", "published")
        .eq("slug", slug)
        .maybeSingle();

      throwOnError("getServiceBySlug", error);
      return (data as Service | null) ?? null;
    },
    ["service-by-slug"],
    { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.services] },
  ),
);
