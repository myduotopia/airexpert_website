// 統一 SEO 總覽（V3-4）資料層 — SERVER ONLY。
//
// 跨五個內容表（products / articles / services / cases / photo_albums）撈出
// published + draft 的列（排除 archived），收斂成統一的 SeoRow 形狀供總覽頁渲染。
//
// 走 service_role（getAdminSupabase）：seo_manager 依設計無內容表的讀寫 RLS，故讀取也由
// server 端以 service_role 進行；呼叫端（page / action）須先 requireRole(['admin','seo_manager'])。
import "server-only";

import { getAdminSupabase } from "../supabase-admin";
import {
  SEO_OVERVIEW_TABLES,
  type SeoRow,
  type SeoTableConfig,
} from "../admin/seo-overview";

// 各表共用要撈的 SEO 欄位（對齊 0004_v3_seo.sql / SeoColumns）。
const SEO_COLUMNS =
  "seo_title, seo_description, canonical_url, og_title, og_description, og_image_url, schema_jsonld, noindex, nofollow";

/** 把單一表的原始列轉成 SeoRow（依設定取標題欄位）。 */
function toSeoRow(cfg: SeoTableConfig, raw: Record<string, unknown>): SeoRow {
  const titleValue = raw[cfg.titleColumn];
  return {
    table: cfg.table,
    typeLabel: cfg.typeLabel,
    id: String(raw.id),
    title: typeof titleValue === "string" ? titleValue : "（未命名）",
    slug: typeof raw.slug === "string" ? raw.slug : null,
    status: raw.status as SeoRow["status"],
    seo_title: (raw.seo_title as string | null) ?? null,
    seo_description: (raw.seo_description as string | null) ?? null,
    canonical_url: (raw.canonical_url as string | null) ?? null,
    og_title: (raw.og_title as string | null) ?? null,
    og_description: (raw.og_description as string | null) ?? null,
    og_image_url: (raw.og_image_url as string | null) ?? null,
    schema_jsonld: raw.schema_jsonld ?? null,
    noindex: (raw.noindex as boolean | null) ?? false,
    nofollow: (raw.nofollow as boolean | null) ?? false,
  };
}

/**
 * 撈齊五個內容表的 published + draft 列，彙整為單一 SeoRow 陣列。
 * 排序：先依 SEO_OVERVIEW_TABLES 的類型順序，同類型內依 updated_at 新→舊。
 * 呼叫端須先做 requireRole 守門。
 */
export async function getAllForSeo(): Promise<SeoRow[]> {
  const admin = getAdminSupabase();

  const results = await Promise.all(
    SEO_OVERVIEW_TABLES.map(async (cfg) => {
      const { data, error } = await admin
        .from(cfg.table)
        .select(`id, slug, status, ${cfg.titleColumn}, ${SEO_COLUMNS}`)
        .in("status", ["published", "draft"])
        .order("updated_at", { ascending: false });
      if (error) {
        throw new Error(`getAllForSeo(${cfg.table}): ${error.message}`);
      }
      return (data ?? []).map((raw) =>
        toSeoRow(cfg, raw as Record<string, unknown>),
      );
    }),
  );

  return results.flat();
}
