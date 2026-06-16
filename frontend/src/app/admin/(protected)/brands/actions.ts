"use server";

// 品牌介紹 後台 server actions：把共用 CRUD bind 到 "brands" 表，
// 並以 CACHE_TAGS.brands 失效前台快取（getPublishedBrands / getBrandBySlug）。
import { redirect } from "next/navigation";
import { revalidateTag } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase-admin";
import { requireAdmin } from "@/lib/admin/auth";
import { deleteRow, setStatus } from "@/lib/admin/crud";
import { CACHE_TAGS } from "@/lib/data";
import type { ContentStatus, MediaImage } from "@/lib/types";

const TABLE = "brands";
const TAGS = [CACHE_TAGS.brands];

export async function deleteBrand(id: string) {
  return deleteRow(TABLE, id, TAGS);
}
export async function setBrandStatus(id: string, status: ContentStatus) {
  return setStatus(TABLE, id, status, TAGS);
}

const STATUSES: ContentStatus[] = ["draft", "published", "archived"];

// 解析 form 隱藏欄位裡的 images JSON（由 client 表單維護）。失敗則回空陣列。
function parseImages(raw: FormDataEntryValue | null): MediaImage[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.url === "string")
      .map((x, i) => ({
        url: String(x.url),
        alt: x.alt ? String(x.alt) : null,
        sort: typeof x.sort === "number" ? x.sort : i,
      }));
  } catch {
    return [];
  }
}

function buildValues(formData: FormData): Record<string, unknown> {
  const str = (k: string) => {
    const v = formData.get(k);
    const s = typeof v === "string" ? v.trim() : "";
    return s === "" ? null : s;
  };
  const statusRaw = String(formData.get("status") ?? "draft");
  const status: ContentStatus = STATUSES.includes(statusRaw as ContentStatus)
    ? (statusRaw as ContentStatus)
    : "draft";
  const sortRaw = Number(formData.get("sort_order"));

  return {
    slug: str("slug"),
    name: str("name"),
    logo_url: str("logo_url"),
    summary: str("summary"),
    body_html: str("body_html"),
    images: parseImages(formData.get("images")),
    seo_title: str("seo_title"),
    seo_description: str("seo_description"),
    sort_order: Number.isFinite(sortRaw) ? sortRaw : 0,
    status,
  };
}

// 直接以 admin client 寫入（需 slug/name 為 not null，這裡先做基本驗證）。
export async function saveBrand(
  id: string | null,
  formData: FormData,
): Promise<void> {
  await requireAdmin();
  const values = buildValues(formData);

  if (!values.slug || !values.name) {
    throw new Error("slug 與 name 為必填");
  }

  const supabase = getAdminSupabase();
  if (id) {
    const { error } = await supabase.from(TABLE).update(values).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from(TABLE).insert(values);
    if (error) throw new Error(error.message);
  }

  for (const tag of TAGS) revalidateTag(tag, "max");
  redirect("/admin/brands");
}
