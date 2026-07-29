"use server";

// 統一 SEO 總覽（V3-4）儲存 server action。
//
// 安全邊界（防 seo_manager 越權，admin 亦走同路徑）：
//   1. requireRole(['admin','seo_manager']) — 先驗角色，未授權導回登入。
//   2. isSeoTable(table) — table 必須在五表 allowlist 內，絕不接受 / 內插任意表名。
//   3. parseSeoFields(formData) → pickSeoWritable(values) — 即使表單被竄改夾帶
//      body_html / status / role 等鍵，也只有 SEO_WRITABLE_COLUMNS 會被寫入。
//   4. 走 service_role（getAdminSupabase）寫入：seo_manager 依設計無內容表 write RLS，
//      欄位級限制改由上述白名單在此層強制。
//   5. updateTag（read-your-own-writes）讓前台 detail 頁的 metadata 立即更新。

import { updateTag } from "next/cache";
import { requireRole } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { parseSeoFields } from "@/lib/admin/seo-fields";
import { pickSeoWritable } from "@/lib/admin/seo-whitelist";
import { getSeoTableConfig, isSeoTable } from "@/lib/admin/seo-overview";

export type SeoSaveResult = { ok: true } | { ok: false; error: string };

/**
 * 更新某內容列的 SEO meta（僅 SEO 欄位，無內文）。
 * @param table 五表之一（allowlist 驗證）
 * @param id    PK
 * @param formData <SeoFields> 表單
 */
export async function updateContentSeo(
  table: string,
  id: string,
  formData: FormData,
): Promise<SeoSaveResult> {
  await requireRole(["admin", "seo_manager"]);

  if (!isSeoTable(table)) {
    return { ok: false, error: "不支援的內容類型。" };
  }
  if (!id) {
    return { ok: false, error: "缺少內容 id。" };
  }

  const parsed = parseSeoFields(formData);
  if (!parsed.ok) {
    return { ok: false, error: parsed.error };
  }

  // 只寫白名單內的 SEO 欄位（縱深防禦：即使表單夾帶其他鍵也會被丟棄）。
  const writable = pickSeoWritable(parsed.values as Record<string, unknown>);

  const { error } = await getAdminSupabase()
    .from(table)
    .update(writable)
    .eq("id", id);
  if (error) {
    return { ok: false, error: error.message };
  }

  // updateTag（read-your-own-writes）：存檔後前台 metadata 立即更新，不回舊快取。
  const cfg = getSeoTableConfig(table);
  if (cfg) updateTag(cfg.cacheTag);

  return { ok: true };
}
