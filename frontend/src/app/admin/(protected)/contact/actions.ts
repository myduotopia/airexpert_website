"use server";

// 聯絡資訊設定 server action：upsert 單一 site_settings key（contact_info）。
// site_settings PK 是 `key`（非 id），故不能用 @/lib/admin/crud 的 updateRow（.eq("id")）；
// 此處以 service_role 直接 upsert by key。安全邊界：先 requireAdmin() 驗證身分。
import { updateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin/auth";
import { CACHE_TAGS } from "@/lib/data/cache";
import { CONTACT_INFO_KEY } from "@/lib/data/contact-info";

export type SaveResult = { ok: true } | { ok: false; error: string };

// 表單送出（useActionState）：欄位 value=JSON 字串（整個 contact_info 物件）。
// value 解析失敗一律拒絕，避免寫入非法內容。
export async function saveContactInfo(
  _prev: SaveResult | null,
  formData: FormData,
): Promise<SaveResult> {
  await requireAdmin();

  const raw = String(formData.get("value") ?? "");
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: "JSON 格式錯誤，請檢查內容後再儲存。" };
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "內容必須是一個 JSON 物件。" };
  }

  const { error } = await getAdminSupabase()
    .from("site_settings")
    .upsert(
      { key: CONTACT_INFO_KEY, value, is_public: true },
      { onConflict: "key" },
    );

  if (error) return { ok: false, error: error.message };

  // updateTag（read-your-own-writes）：存檔後前台立即取得新聯絡資訊，不回舊快取。
  updateTag(CACHE_TAGS.siteSettings);
  return { ok: true };
}
