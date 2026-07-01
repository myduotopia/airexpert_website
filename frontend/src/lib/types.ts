// Hand-written TypeScript types matching supabase/migrations/0001_init_schema.sql.
// 不使用 `supabase gen types`（需專案 auth，環境不可用）。此檔為 schema 的前端對應型別。
// 若 migration 變更，請同步更新此檔。

/** content_status enum（products / articles / cases / events / photo_albums） */
export type ContentStatus = "draft" | "published" | "archived";

/**
 * V3 完整 SEO meta 欄位（0003_v3_seo.sql）。
 * products / articles / cases / services / photo_albums 五表共有。
 * seo_title / seo_description 雖於 0001/0002 既有，仍納入此介面集中描述。
 */
export interface SeoColumns {
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  schema_jsonld: Record<string, unknown> | null;
  noindex: boolean;
  nofollow: boolean;
}

/**
 * 商品圖片 jsonb 形狀：images = [{ url, alt, sort }]
 * 同樣用於 articles / cases 的 images 欄位。
 */
export interface MediaImage {
  url: string;
  alt?: string | null;
  sort?: number | null;
}

/**
 * products.spec jsonb：規格表。schema 未強制 key，採開放鍵值對。
 * 值通常為字串（規格描述），但允許 number / null 以利彈性。
 */
export type ProductSpec = Record<string, string | number | null>;

/**
 * products.hp_output jsonb：變頻空壓機「馬力數 ↔ 造氣量」對照的單筆。
 * hp / output 皆為數字字串；單位（HP / m³/min）由前台固定標題承載。
 * 其餘分類此欄位為空陣列。
 */
export interface HpOutputRow {
  hp: string;
  output: string;
}

/**
 * cases.metrics jsonb：節能數據 {能耗節省, 投資回收期, 年省電度數...}。
 * 開放鍵值對，值為字串或數字。
 */
export type CaseMetrics = Record<string, string | number | null>;

// ---------- products ----------
export interface Product extends SeoColumns {
  id: string;
  slug: string;
  category: string;
  brand: string | null;
  name: string;
  summary: string | null;
  body_html: string | null;
  spec: ProductSpec;
  hp_output: HpOutputRow[];
  images: MediaImage[];
  manual_url: string | null;
  sort_order: number;
  status: ContentStatus;
  legacy_path: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- articles ----------
export interface Article extends SeoColumns {
  id: string;
  slug: string;
  category: string;
  title: string;
  excerpt: string | null;
  body_html: string | null;
  cover_image: string | null;
  images: MediaImage[];
  status: ContentStatus;
  published_at: string | null;
  sort_order: number;
  legacy_path: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- cases ----------
export interface Case extends SeoColumns {
  id: string;
  slug: string;
  category: string;
  title: string;
  region: string | null;
  industry: string | null;
  body_html: string | null;
  metrics: CaseMetrics;
  images: MediaImage[];
  status: ContentStatus;
  sort_order: number;
  legacy_path: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- events ----------
export interface Event {
  id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  event_date: string | null;
  sort_order: number;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}

// ---------- photo_albums ----------
export interface PhotoAlbum extends SeoColumns {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_image: string | null;
  status: ContentStatus;
  created_at: string;
  updated_at: string;
}

// ---------- photos ----------
export interface Photo {
  id: string;
  album_id: string;
  image_url: string;
  caption: string | null;
  sort_order: number;
  created_at: string;
}

/** 相簿含其照片（依 sort_order 排序）。 */
export interface PhotoAlbumWithPhotos extends PhotoAlbum {
  photos: Photo[];
}

// ---------- contact_submissions ----------
// anon 僅能 insert（無讀取 policy）。完整列型別保留供後端 / 管理端使用。
export interface ContactSubmission {
  id: string;
  name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  source_page: string | null;
  created_at: string;
}

/** 前端送出聯絡表單的 payload（不含 DB 產生欄位）。 */
export type ContactSubmissionInput = Pick<
  ContactSubmission,
  "name" | "company" | "phone" | "email" | "message" | "source_page"
>;

// ---------- ai_content_drafts ----------
// 後台 / service_role 使用；anon 無 RLS policy（無法讀寫）。
export type AiDraftTargetType = "product" | "article" | "case";
export type AiDraftKind = "seo_title" | "seo_description" | "body" | "excerpt";
export type AiDraftStatus = "pending" | "accepted" | "rejected";

export interface AiContentDraft {
  id: string;
  target_type: AiDraftTargetType;
  target_id: string | null;
  kind: AiDraftKind;
  prompt: string | null;
  model: string | null;
  output: string | null;
  status: AiDraftStatus;
  created_by: string | null;
  created_at: string;
}

// ---------- brands（V2：品牌介紹 KAISHAN / DELTECH，0002_v2_cms.sql） ----------
export interface Brand {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  summary: string | null;
  body_html: string | null;
  images: MediaImage[];
  seo_title: string | null;
  seo_description: string | null;
  sort_order: number;
  status: ContentStatus;
  legacy_path: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- services（V2：服務項目 ×4，0002_v2_cms.sql） ----------
export interface Service extends SeoColumns {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body_html: string | null;
  images: MediaImage[];
  sort_order: number;
  status: ContentStatus;
  legacy_path: string | null;
  created_at: string;
  updated_at: string;
}

// ---------- site_settings（V2：全域內容，key→jsonb，0002_v2_cms.sql） ----------
// value 為開放 jsonb；各 key 的形狀由使用端（首頁 / 聯絡頁）自行 narrow。
export interface SiteSetting<T = Record<string, unknown>> {
  key: string;
  value: T;
  updated_at: string;
}
