// 節能實績 資料存取 — SERVER ONLY。
import "server-only";

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getSupabaseClient } from "../supabase";
import type { Case } from "../types";
import { CACHE_TAGS, REVALIDATE_SECONDS, throwOnError } from "./cache";

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
