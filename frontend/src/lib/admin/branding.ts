// 後台共用：把品牌資產表單欄位（LOGO / favicon）解析成可寫入
// site_settings.branding 的 value 形狀 { logo_url?, favicon_url? }。
//
// 純函式（無 server-only / 無 DB），方便單元測試。對應元件：
// app/admin/(protected)/home/BrandingForm.tsx（name= 須一致：logo_url / favicon_url）。

/** site_settings.branding 寫入的 value 形狀。空欄位省略（不寫空字串）。 */
export type BrandingValue = {
  logo_url?: string;
  favicon_url?: string;
};

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/**
 * 解析品牌資產欄位 → 寫入 site_settings.branding 的 value。
 * 空字串視為「不設定」而省略該欄位（前台會退回內建素材），
 * 避免把空字串寫進 DB 造成 Header / favicon 拿到空 src。
 */
export function parseBrandingFields(fd: FormData): BrandingValue {
  const value: BrandingValue = {};
  const logo = str(fd, "logo_url");
  const favicon = str(fd, "favicon_url");
  if (logo !== "") value.logo_url = logo;
  if (favicon !== "") value.favicon_url = favicon;
  return value;
}
