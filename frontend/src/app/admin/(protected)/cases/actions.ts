"use server";

// 節能實績後台寫入：把共用 crud server actions 綁定到 cases 表 + 失效 cases 快取 tag。
// 表單由 CaseForm（client）以 FormData 呼叫，這裡解析後轉交 createRow / updateRow。
import { requireAdmin } from "@/lib/admin/auth";
import { createRow, updateRow, deleteRow, reorderRows } from "@/lib/admin/crud";
import { CACHE_TAGS } from "@/lib/data/cache";
import type { ActionResult } from "@/lib/admin/crud";
import { parseSeoFields, type SeoValues } from "@/lib/admin/seo-fields";
import type { CaseMetrics, ContentStatus, MediaImage } from "@/lib/types";
import { CASE_CATEGORIES } from "@/components/cases/constants";

const TABLE = "cases";
const TAGS = [CACHE_TAGS.cases];

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

/**
 * metrics 欄位：表單以「逐行 key=value」文字傳入，轉成 CaseMetrics（開放鍵值對）。
 * 只取第一個 `=` 之前為 key、之後為 value，故 value 內可含 `=`。
 * 空行 / 無 `=` / 空 key 略過。
 */
function parseMetrics(raw: string): CaseMetrics {
  const out: CaseMetrics = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (key === "") continue;
    out[key] = value;
  }
  return out;
}

function buildValues(fd: FormData, seo: SeoValues): Record<string, unknown> {
  const status = str(fd, "status") as ContentStatus;
  return {
    title: str(fd, "title"),
    slug: str(fd, "slug"),
    category: str(fd, "category"),
    region: nullable(str(fd, "region")),
    industry: nullable(str(fd, "industry")),
    body_html: nullable(str(fd, "body_html")),
    metrics: parseMetrics(str(fd, "metrics")),
    images: parseImages(str(fd, "images")),
    ...seo,
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
    !(CASE_CATEGORIES as readonly string[]).includes(values.category as string)
  ) {
    return "分類無效";
  }
  return null;
}

export type FormState = { error?: string; ok?: boolean };

export async function createCase(
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

export async function updateCase(
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

/** 列表拖移排序：把 sort_order 依新順序重設為 0,1,2…。 */
export async function reorderCasesAction(orderedIds: string[]) {
  return reorderRows(TABLE, orderedIds, TAGS);
}

export async function deleteCase(id: string): Promise<ActionResult> {
  return deleteRow(TABLE, id, TAGS);
}
