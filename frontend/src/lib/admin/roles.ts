// 後台角色清單 — 純資料（無 server-only 依賴），server（auth.ts 守門）與 client（側欄 nav-config）共用。
// lib/admin/auth.ts 會 re-export 這裡的值，既有 `from "@/lib/admin/auth"` 的引用不受影響。

/**
 * 後台角色的單一事實來源。新增角色只需改這一行（並補 ROLE_LABELS），
 * getCurrentUserRole()、登入檢查（app/admin/actions.ts）等皆走 isAdminRole()。
 *   admin       — 管理員（全站）
 *   seo_manager — SEO 代管（只編各內容的 SEO meta）
 *   office      — 行政（保養記錄卡）
 *   erp         — ERP 行政（只用 ERP 模組；實際可見性另由 admin_module_grants 決定）
 *   hr          — 人事（#259；只用員工頁，含員工敏感資料；可見性同樣由 hr 模組授權決定）
 *
 * 注意：(protected)／(print) 的根 layout 以 requireRole([...ADMIN_ROLES]) 只判斷「是否為後台人員」，
 * 因此每個頁面都必須自己再守門（requireAdmin / requireRole(CONTENT_ROLES) / requireModule…），
 * 否則新增角色時會被意外開放（見 test/admin-page-guards.test.ts）。
 */
export const ADMIN_ROLES = [
  "admin",
  "seo_manager",
  "office",
  "erp",
  "hr",
] as const;

/** 後台角色。null = 未登入或非後台人員。 */
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** 字串是否為合法後台角色（admin_profiles.role 為自由文字，讀出後一律先過此檢查）。 */
export function isAdminRole(value: unknown): value is AdminRole {
  return (
    typeof value === "string" &&
    (ADMIN_ROLES as readonly string[]).includes(value)
  );
}

/** 角色顯示名稱（人員管理頁列表等）。 */
export const ROLE_LABELS: Record<AdminRole, string> = {
  admin: "管理員",
  seo_manager: "SEO 代管",
  office: "行政",
  erp: "ERP 行政",
  hr: "人事",
};

/**
 * 內容團隊角色：可進 CMS 內容區（商品 / 最新消息 / 服務 / 節能實績…）、SEO 總覽的角色。
 * 側欄未指定 roles 的項目預設也只對這些角色可見（nav-config 的 DEFAULT_ROLES）。
 * office / erp / hr 為獨立 persona，不在其中。
 */
export const CONTENT_ROLES: readonly AdminRole[] = ["admin", "seo_manager"];
