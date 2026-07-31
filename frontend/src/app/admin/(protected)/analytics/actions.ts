"use server";
import { updateTag } from "next/cache";
import { requireRole } from "@/lib/admin/auth";
import { CACHE_TAGS } from "@/lib/data/cache";

/** 手動失效 analytics 快取；admin 與 seo_manager 皆可。 */
export async function refreshAnalytics(): Promise<void> {
  await requireRole(["admin", "seo_manager"]);
  updateTag(CACHE_TAGS.analytics);
}
