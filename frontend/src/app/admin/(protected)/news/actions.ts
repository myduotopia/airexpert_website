"use server";

// 最新消息後台寫入：把共用 crud server actions 綁定到 articles 表 + 失效 articles 快取 tag。
// 表單由 ArticleForm（client）以 FormData 呼叫，這裡解析後轉交 createRow / updateRow。
import { requireAdmin } from "@/lib/admin/auth";
import { createRow, updateRow, deleteRow, reorderRows } from "@/lib/admin/crud";
import { CACHE_TAGS } from "@/lib/data/cache";
import type { ActionResult } from "@/lib/admin/crud";
import type { ContentStatus, MediaImage } from "@/lib/types";
import { NEWS_CATEGORIES } from "@/components/news/constants";

const TABLE = "articles";
const TAGS = [CACHE_TAGS.articles];

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function nullable(value: string): string | null {
  return value === "" ? null : value;
}

/** images 欄位：表單以換行分隔的 URL 文字傳入，轉成 MediaImage[]。 */
function parseImages(raw: string): MediaImage[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map((url, sort) => ({ url, alt: null, sort }));
}

/** published_at：datetime-local（無時區）→ ISO；空值存 null。 */
function parsePublishedAt(raw: string): string | null {
  if (raw === "") return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function buildValues(fd: FormData): Record<string, unknown> {
  const status = str(fd, "status") as ContentStatus;
  return {
    title: str(fd, "title"),
    slug: str(fd, "slug"),
    category: str(fd, "category"),
    excerpt: nullable(str(fd, "excerpt")),
    body_html: nullable(str(fd, "body_html")),
    cover_image: nullable(str(fd, "cover_image")),
    images: parseImages(str(fd, "images")),
    seo_title: nullable(str(fd, "seo_title")),
    seo_description: nullable(str(fd, "seo_description")),
    published_at: parsePublishedAt(str(fd, "published_at")),
    status: status || "draft",
  };
}

const SLUG_RE = /^[a-z0-9-]+$/;

// server 端為信任邊界：不能只靠 client 的 <select>/<input>，必須驗 slug 格式與分類白名單。
function validate(values: Record<string, unknown>): string | null {
  if (!values.title || !values.slug || !values.category) {
    return "標題、網址代稱（slug）與分類為必填";
  }
  if (!SLUG_RE.test(values.slug as string)) {
    return "網址代稱（slug）僅能使用小寫英數字與連字號（-）";
  }
  if (
    !(NEWS_CATEGORIES as readonly string[]).includes(values.category as string)
  ) {
    return "分類無效";
  }
  return null;
}

export type FormState = { error?: string; ok?: boolean };

export async function createArticle(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requireAdmin();
  const values = buildValues(fd);
  const err = validate(values);
  if (err) return { error: err };
  const res = await createRow(TABLE, values, TAGS);
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function updateArticle(
  id: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requireAdmin();
  const values = buildValues(fd);
  const err = validate(values);
  if (err) return { error: err };
  const res = await updateRow(TABLE, id, values, TAGS);
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function deleteArticle(id: string): Promise<ActionResult> {
  return deleteRow(TABLE, id, TAGS);
}

/** 列表拖移排序：把 sort_order 依新順序重設為 0,1,2…。 */
export async function reorderNewsAction(orderedIds: string[]) {
  return reorderRows(TABLE, orderedIds, TAGS);
}
