"use server";

// 首頁設定 server action：以「友善表單欄位」逐欄組出 value，再 upsert 單一
// site_settings key。site_settings PK 是 `key`（非 id），故以 service_role
// 直接 upsert by key。安全邊界：先 requireAdmin() 驗證身分。
import { updateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin/auth";
import { CACHE_TAGS } from "@/lib/data/cache";
import { BRANDING_KEY } from "@/lib/data/site";
import { parseBrandingFields } from "@/lib/admin/branding";
import { HOME_SECTION_KEYS, parseHomeSection } from "@/lib/admin/home-sections";
import {
  cleanupRemovedMedia,
  sectionImageUrls,
} from "@/lib/admin/media-cleanup";

export type SaveResult = { ok: true } | { ok: false; error: string };

// 首頁區段表單送出（useActionState）：欄位 key=設定鍵、其餘為各區段友善欄位。
// 不接受任何 raw JSON——value 一律由 parseHomeSection 在伺服器端逐欄組出，
// key 不在白名單一律拒絕，避免寫入非法內容。
export async function saveHomeSection(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  await requireAdmin();

  const key = String(formData.get("key") ?? "");
  if (!HOME_SECTION_KEYS.has(key)) {
    return { ok: false, error: `不允許的設定鍵：${key}` };
  }

  const value = parseHomeSection(key, formData);
  if (value == null) {
    return { ok: false, error: `無法解析區段內容：${key}` };
  }

  const admin = getAdminSupabase();
  // 取舊值，供存檔成功後清理「已被換掉」的舊上傳圖（僅輪播 / 產品分類有圖）。
  const { data: prev } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const { error } = await admin
    .from("site_settings")
    .upsert({ key, value, is_public: true }, { onConflict: "key" });

  if (error) return { ok: false, error: error.message };

  // 清理孤兒圖（best-effort，不影響存檔）：只刪 media bucket 內、且新值不再引用的檔。
  await cleanupRemovedMedia(
    sectionImageUrls(key, prev?.value),
    sectionImageUrls(key, value),
  );

  // updateTag（read-your-own-writes）：存檔後前台立即取得新首頁內容，不回舊快取。
  updateTag(CACHE_TAGS.siteSettings);
  return { ok: true };
}

// 品牌資產（LOGO / favicon）：upsert site_settings.branding（is_public=true，
// 公開 layout / Header 需讀）。欄位 logo_url / favicon_url 為圖檔 URL（可上傳或手填）。
// 空欄位省略 → 前台退回內建素材。安全邊界：先 requireAdmin()。
export async function saveBranding(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  await requireAdmin();

  const value = parseBrandingFields(formData);

  const admin = getAdminSupabase();
  const { data: prev } = await admin
    .from("site_settings")
    .select("value")
    .eq("key", BRANDING_KEY)
    .maybeSingle();
  const old = (prev?.value ?? {}) as {
    logo_url?: string;
    favicon_url?: string;
  };

  const { error } = await admin
    .from("site_settings")
    .upsert(
      { key: BRANDING_KEY, value, is_public: true },
      { onConflict: "key" },
    );

  if (error) return { ok: false, error: error.message };

  // 清理被換掉的舊 LOGO / favicon（只刪 media bucket 內、新值不再引用者；
  // 內建預設 /brand/* 、/favicon.ico 不含 media 前綴 → 永不刪）。
  await cleanupRemovedMedia(
    [old.logo_url, old.favicon_url],
    [value.logo_url, value.favicon_url],
  );

  updateTag(CACHE_TAGS.siteSettings);
  return { ok: true };
}
