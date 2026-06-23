"use server";

// 商品後台的具型別 server actions。
// 共用寫入邏輯（service_role + requireAdmin + revalidateTag）集中在 @/lib/admin/crud，
// 這裡只負責：把表單欄位整理成 products 列、解析 spec/images 兩個 jsonb 欄位、
// 並在成功後導回列表。table = "products"，PK = id。
import { revalidateTag } from "next/cache";
import { createRow, updateRow, deleteRow, reorderRows } from "@/lib/admin/crud";
import { CACHE_TAGS } from "@/lib/data/cache";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { parseSeoFields, type SeoValues } from "@/lib/admin/seo-fields";
import type { ContentStatus, MediaImage, ProductSpec } from "@/lib/types";
import { PRODUCT_CATEGORIES } from "@/components/products/categories";

const TAGS = [CACHE_TAGS.products];

// ok:true → 表單在 client 端導回列表（避免 server action 內 revalidate+redirect 卡住）。
export type ProductFormState = { error?: string; ok?: boolean };

const STATUSES: ContentStatus[] = ["draft", "published", "archived"];

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function nullableStr(formData: FormData, key: string): string | null {
  const v = str(formData, key);
  return v === "" ? null : v;
}

/**
 * spec 以「每行 一筆」的 key=value 文字輸入（最直覺、零相依的 jsonb 編輯方式）。
 * 例：
 *   排氣量=7.5 m³/min
 *   功率=55 kW
 * 解析為 { "排氣量": "7.5 m³/min", "功率": "55 kW" }。等號後可含等號（只切第一個）。
 */
function parseSpec(raw: string): ProductSpec {
  const spec: ProductSpec = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key) spec[key] = value;
  }
  return spec;
}

/**
 * images 由表單裡的隱藏欄位 `images`（JSON 字串）帶入：客戶端的 ProductImagesField
 * 以 ImageUploader 上傳取得公開 URL 後，維護一個 MediaImage[] 並序列化進此欄位。
 * 解析失敗時回空陣列（不讓壞輸入炸掉整個送出）。
 */
function parseImages(raw: string): MediaImage[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.url === "string" && x.url.trim() !== "")
      .map((x, i) => ({
        url: String(x.url),
        alt: x.alt ? String(x.alt) : null,
        sort: typeof x.sort === "number" ? x.sort : i,
      }));
  } catch {
    return [];
  }
}

function buildValues(
  formData: FormData,
  seo: SeoValues,
): Record<string, unknown> {
  const category = str(formData, "category");
  const status = str(formData, "status") as ContentStatus;

  return {
    slug: str(formData, "slug"),
    name: str(formData, "name"),
    category: (PRODUCT_CATEGORIES as readonly string[]).includes(category)
      ? category
      : (PRODUCT_CATEGORIES[0] as string),
    brand: nullableStr(formData, "brand"),
    summary: nullableStr(formData, "summary"),
    body_html: nullableStr(formData, "body_html"),
    spec: parseSpec(str(formData, "spec")),
    images: parseImages(str(formData, "images")),
    manual_url: nullableStr(formData, "manual_url"),
    ...seo,
    status: STATUSES.includes(status) ? status : "draft",
  };
}

function validate(values: Record<string, unknown>): string | null {
  if (!values.name) return "請輸入商品名稱";
  if (!values.slug) return "請輸入 slug（網址代稱）";
  if (!/^[a-z0-9-]+$/.test(String(values.slug))) {
    return "slug 僅能包含小寫英數字與連字號（-）";
  }
  return null;
}

export async function createProductAction(
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const seo = parseSeoFields(formData);
  if (!seo.ok) return { error: seo.error };
  const values = buildValues(formData, seo.values);
  const invalid = validate(values);
  if (invalid) return { error: invalid };

  const res = await createRow("products", values, TAGS);
  if (!res.ok) return { error: res.error };

  return { ok: true };
}

export async function updateProductAction(
  id: string,
  _prev: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  const seo = parseSeoFields(formData);
  if (!seo.ok) return { error: seo.error };
  const values = buildValues(formData, seo.values);
  const invalid = validate(values);
  if (invalid) return { error: invalid };

  const res = await updateRow("products", id, values, TAGS);
  if (!res.ok) return { error: res.error };

  return { ok: true };
}

/** 列表上的刪除：由 DeleteButton 在 client 事件處理器呼叫（已 bind id）。 */
export async function deleteProductAction(id: string) {
  return deleteRow("products", id, TAGS);
}

/** 列表拖移排序：把 sort_order 依新順序重設為 0,1,2…。 */
export async function reorderProductsAction(orderedIds: string[]) {
  return reorderRows("products", orderedIds, TAGS);
}

/**
 * 後台列表需要看到 draft / archived（前台 helper 只回 published），
 * 故以 service_role 直接讀全部，requireAdmin 守門。
 */
export async function listAllProductsForAdmin() {
  await requireAdmin();
  const { data, error } = await getAdminSupabase()
    .from("products")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listAllProductsForAdmin: ${error.message}`);
  return data ?? [];
}

export async function getProductForAdmin(id: string) {
  await requireAdmin();
  const { data, error } = await getAdminSupabase()
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getProductForAdmin: ${error.message}`);
  return data ?? null;
}

/** 預留：列表頁日後若要單獨失效（目前由各 action 內建 revalidate 處理）。 */
export async function revalidateProducts() {
  await requireAdmin();
  revalidateTag(CACHE_TAGS.products, "max");
}
