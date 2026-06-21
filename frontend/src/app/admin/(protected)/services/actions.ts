"use server";

// 服務項目後台寫入：把共用 crud server actions 綁定到 services 表 + 失效 services 快取 tag。
// 表單由 ServiceForm（client）以 FormData 呼叫，這裡解析後轉交 createRow / updateRow。
import { requireAdmin } from "@/lib/admin/auth";
import { createRow, updateRow, deleteRow, reorderRows } from "@/lib/admin/crud";
import { CACHE_TAGS } from "@/lib/data/cache";
import type { ActionResult } from "@/lib/admin/crud";
import { parseSeoFields, type SeoValues } from "@/lib/admin/seo-fields";
import type { ContentStatus, MediaImage } from "@/lib/types";

const TABLE = "services";
const TAGS = [CACHE_TAGS.services];

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

function buildValues(fd: FormData, seo: SeoValues): Record<string, unknown> {
  const status = str(fd, "status") as ContentStatus;
  // sort_order 不在表單寫入（改由列表拖移排序維護），避免儲存時被覆蓋回 0。
  return {
    title: str(fd, "title"),
    slug: str(fd, "slug"),
    summary: nullable(str(fd, "summary")),
    body_html: nullable(str(fd, "body_html")),
    images: parseImages(str(fd, "images")),
    ...seo,
    status: status || "draft",
  };
}

const SLUG_RE = /^[a-z0-9-]+$/;

// server 端為信任邊界：不能只靠 client 的 <input>，必須驗 slug 格式。
function validate(values: Record<string, unknown>): string | null {
  if (!values.title || !values.slug) {
    return "標題與網址代稱（slug）為必填";
  }
  if (!SLUG_RE.test(values.slug as string)) {
    return "網址代稱（slug）僅能使用小寫英數字與連字號（-）";
  }
  return null;
}

export type FormState = { error?: string; ok?: boolean };

export async function createService(
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requireAdmin();
  const seo = parseSeoFields(fd);
  if (!seo.ok) return { error: seo.error };
  const values = buildValues(fd, seo.values);
  const err = validate(values);
  if (err) return { error: err };
  const res = await createRow(TABLE, values, TAGS);
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function updateService(
  id: string,
  _prev: FormState,
  fd: FormData,
): Promise<FormState> {
  await requireAdmin();
  const seo = parseSeoFields(fd);
  if (!seo.ok) return { error: seo.error };
  const values = buildValues(fd, seo.values);
  const err = validate(values);
  if (err) return { error: err };
  const res = await updateRow(TABLE, id, values, TAGS);
  if (!res.ok) return { error: res.error };
  return { ok: true };
}

export async function deleteService(id: string): Promise<ActionResult> {
  return deleteRow(TABLE, id, TAGS);
}

/** 列表拖移排序：把 sort_order 依新順序重設為 0,1,2…。 */
export async function reorderServicesAction(orderedIds: string[]) {
  return reorderRows(TABLE, orderedIds, TAGS);
}
