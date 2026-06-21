"use server";

// 首頁設定 server action：upsert 單一 site_settings key。
// site_settings PK 是 `key`（非 id），故不能用 @/lib/admin/crud 的 updateRow（.eq("id")）；
// 此處以 service_role 直接 upsert by key。安全邊界：先 requireAdmin() 驗證身分。
import { revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin/auth";
import { CACHE_TAGS } from "@/lib/data/cache";
import { HOME_KEYS } from "@/lib/data/home";
import { BRANDING_KEY } from "@/lib/data/site";
import { parseBrandingFields } from "@/lib/admin/branding";

const ALLOWED_KEYS = new Set<string>(Object.values(HOME_KEYS));

export type SaveResult = { ok: true } | { ok: false; error: string };

// 表單送出（useActionState）：欄位 key=設定鍵、value=JSON 字串。
// value 解析失敗或 key 不在白名單一律拒絕，避免寫入非法內容。
export async function saveHomeSetting(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  await requireAdmin();

  const key = String(formData.get("key") ?? "");
  if (!ALLOWED_KEYS.has(key)) {
    return { ok: false, error: `不允許的設定鍵：${key}` };
  }

  const raw = String(formData.get("value") ?? "");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSON 格式錯誤，請檢查內容後再儲存。" };
  }

  const { error } = await getAdminSupabase()
    .from("site_settings")
    .upsert({ key, value, is_public: true }, { onConflict: "key" });

  if (error) return { ok: false, error: error.message };

  // Next 16：revalidateTag 需第二參數；"max" = stale-while-revalidate。
  revalidateTag(CACHE_TAGS.siteSettings, "max");
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

  const { error } = await getAdminSupabase()
    .from("site_settings")
    .upsert({ key: BRANDING_KEY, value, is_public: true }, { onConflict: "key" });

  if (error) return { ok: false, error: error.message };

  revalidateTag(CACHE_TAGS.siteSettings, "max");
  return { ok: true };
}
