// SEO 代管（seo_manager）寫入欄位白名單 — client-safe 純函式（以利測試）。
//
// issue #57 決策：seo_manager「只能編輯 SEO meta」，不可改內文 / slug / status / 帳號 /
// 部署設定。RLS 無法做欄位級 write 限制（見 0005_seo_roles.sql 註解），因此寫入路徑一律
// 走 server action（service_role 繞過 RLS），並由本白名單把可寫欄位收斂到 SEO meta。
//
// V3-4 的統一 SEO 總覽頁 server action 會：先 requireRole(['admin','seo_manager'])，再對
// seo_manager 以 pickSeoWritable(values) 過濾要寫入 DB 的欄位，確保即使表單被竄改，也只有
// 下列欄位會被寫入。admin 不受此限（可寫全部欄位）。
//
// 欄位名稱對齊 0004_v3_seo.sql 的內容表 SEO 欄位與 components/admin/SeoFields.tsx 的 name=。

/** seo_manager 允許寫入的內容表欄位（白名單，唯一事實來源）。 */
export const SEO_WRITABLE_COLUMNS = [
  "seo_title",
  "seo_description",
  "canonical_url",
  "og_title",
  "og_description",
  "og_image_url",
  "schema_jsonld",
  "noindex",
  "nofollow",
] as const;

export type SeoWritableColumn = (typeof SEO_WRITABLE_COLUMNS)[number];

/** O(1) 查找用的 Set（避免每次 includes 線性掃描）。 */
const SEO_WRITABLE_SET: ReadonlySet<string> = new Set(SEO_WRITABLE_COLUMNS);

/** 某欄位是否在 SEO 白名單內。 */
export function isSeoWritableColumn(key: string): key is SeoWritableColumn {
  return SEO_WRITABLE_SET.has(key);
}

/**
 * 從一組待寫入的值中，只挑出 seo_manager 允許寫入的 SEO 欄位。
 * 用於 server action 對 seo_manager 的寫入做欄位收斂（admin 則直接寫全部，不需呼叫此函式）。
 * 不在白名單的鍵一律被丟棄；回傳新物件，不變動原輸入。
 */
export function pickSeoWritable(
  values: Record<string, unknown>,
): Partial<Record<SeoWritableColumn, unknown>> {
  const out: Partial<Record<SeoWritableColumn, unknown>> = {};
  for (const key of SEO_WRITABLE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      out[key] = values[key];
    }
  }
  return out;
}
